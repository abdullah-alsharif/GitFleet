import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  CACHE_NAMESPACE,
  CACHE_TTL_MS,
  GITHUB_API_BASE,
  GITHUB_API_VERSION,
  GITHUB_REQUEST_TIMEOUT_MS,
  MAX_API_PAGES,
  MAX_PAGE_SIZE,
  USER_AGENT,
} from '../constants.js'
import { GitFleetError, redactSecrets } from '../errors.js'
import { cacheKey, githubCache } from './cache.js'
import type { GitHubApiConfig, Organization, Repository } from '../types.js'

// Runtime validation: GitHub payloads are untrusted; malformed entries are skipped.

const orgSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  avatar_url: z.string().optional(),
})

const repoSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  description: z.string().nullable().optional(),
  clone_url: z.string(),
  ssh_url: z.string(),
  private: z.boolean().optional().default(false),
  archived: z.boolean().optional().default(false),
  stargazers_count: z.number().optional().default(0),
  language: z.string().nullable().optional(),
  updated_at: z.string(),
  owner: z.object({ login: z.string() }).optional(),
})

const userSchema = z.object({
  login: z.string(),
  name: z.string().nullable().optional(),
  avatar_url: z.string().optional(),
  id: z.number().optional(),
})

export type GitHubUserRaw = z.infer<typeof userSchema>

function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12)
}

function baseHeaders(config: GitHubApiConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.token}`,
    'User-Agent': USER_AGENT,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': config.version || GITHUB_API_VERSION,
  }
}

function rateLimitResetMessage(response: Response): string | null {
  const reset = response.headers.get('x-ratelimit-reset')
  if (!reset) return null
  const waitSeconds = Math.max(0, Math.ceil(Number(reset) * 1000 - Date.now()) / 1000)
  if (!Number.isFinite(waitSeconds)) return null
  return `GitHub rate limit exceeded. Resets in ${Math.ceil(waitSeconds)}s.`
}

async function throwForStatus(response: Response, context: string): Promise<never> {
  if (response.status === 401) {
    throw new GitFleetError(
      'auth',
      'GitHub token was rejected (401). It may be invalid, revoked, or expired.',
      'Create a new token at https://github.com/settings/tokens and try again.',
    )
  }
  if (response.status === 403) {
    const rateMsg = rateLimitResetMessage(response)
    if (rateMsg) {
      throw new GitFleetError('rate-limit', rateMsg, 'Wait for the reset, or use a token with a higher rate-limit budget.')
    }
    throw new GitFleetError(
      'forbidden',
      `GitHub denied access to ${context} (403). The token may lack permission (SSO enforcement or missing scopes).`,
      'For classic tokens ensure `read:org` + `repo`. For fine-grained tokens grant Contents (read) and Organization Members (read).',
    )
  }
  if (response.status === 404) {
    throw new GitFleetError(
      'not-found',
      `GitHub resource not found: ${context} (404).`,
      'The organization may have been renamed, or the token lacks access to it.',
    )
  }
  if (response.status >= 500) {
    throw new GitFleetError(
      'github-api',
      `GitHub API server error (${response.status}) while loading ${context}.`,
      'This is usually transient — it will be retried automatically.',
    )
  }
  let detail = ''
  try {
    const body = (await response.json()) as { message?: string }
    if (typeof body?.message === 'string') detail = `: ${body.message}`
  } catch {
    // ignore body parse failures
  }
  throw new GitFleetError('github-api', `GitHub API error (${response.status}) while loading ${context}${detail}`.slice(0, 300))
}

async function githubFetch(url: string, config: GitHubApiConfig, context: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { headers: baseHeaders(config), signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GitFleetError('network', `Request to GitHub timed out while loading ${context}.`, 'Check your connection and try again.')
    }
    throw new GitFleetError(
      'network',
      `Cannot reach the GitHub API while loading ${context}: ${redactSecrets(error instanceof Error ? error.message : String(error))}`,
      'Check your internet connection and proxy settings.',
    )
  } finally {
    clearTimeout(timer)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Follow RFC 5988 `Link` pagination (`rel="next"`). Caps pages to bound memory/time. */
function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/)
    if (match?.[1]) return match[1]
  }
  return null
}

async function fetchPaginated(
  firstUrl: string,
  config: GitHubApiConfig,
  context: string,
  maxPages = MAX_API_PAGES,
): Promise<unknown[]> {
  const allData: unknown[] = []
  const separator = firstUrl.includes('?') ? '&' : '?'
  let url: string | null = `${firstUrl}${separator}per_page=${MAX_PAGE_SIZE}`
  let pages = 0

  while (url && pages < maxPages) {
    pages++
    let response = await githubFetch(url, config, context)

    // Retry transient failures with backoff + jitter (never 4xx).
    let attempt = 0
    while (!response.ok && response.status >= 500 && attempt < 2) {
      attempt++
      await sleep(1000 * 2 ** (attempt - 1) + Math.random() * 250)
      response = await githubFetch(url, config, context)
    }

    if (!response.ok) await throwForStatus(response, context)

    // Empty-body guard: treat rate exhaustion reported via headers first.
    const remaining = response.headers.get('x-ratelimit-remaining')
    if (remaining === '0') {
      const msg = rateLimitResetMessage(response) ?? 'GitHub rate limit exhausted.'
      throw new GitFleetError('rate-limit', msg)
    }

    let data: unknown
    try {
      data = await response.json()
    } catch {
      throw new GitFleetError('github-api', `GitHub returned an invalid response while loading ${context}.`)
    }
    if (!Array.isArray(data)) {
      throw new GitFleetError('github-api', `Unexpected GitHub response shape while loading ${context}.`)
    }
    allData.push(...data)
    url = nextPageUrl(response.headers.get('link'))
  }

  return allData
}

const SAFE_LOGIN = /^[A-Za-z0-9_.-]+$/

function assertSafeLogin(value: string, what: string): void {
  if (!SAFE_LOGIN.test(value)) {
    throw new GitFleetError('validation', `Refusing to request ${what} with unsafe name: ${JSON.stringify(value.slice(0, 80))}`)
  }
}

export async function fetchUser(config: GitHubApiConfig): Promise<GitHubUserRaw> {
  const response = await githubFetch(`${GITHUB_API_BASE}/user`, config, 'current user')
  if (!response.ok) await throwForStatus(response, 'current user')
  const parsed = userSchema.safeParse(await response.json())
  if (!parsed.success) {
    throw new GitFleetError('github-api', 'GitHub returned an unexpected user profile shape.')
  }
  return parsed.data
}

export async function fetchOrganizations(
  config: GitHubApiConfig,
  userLogin?: string,
  userId?: number,
): Promise<Organization[]> {
  const key = cacheKey(CACHE_NAMESPACE, 'orgs', tokenFingerprint(config.token))
  const cached = githubCache.get<Organization[]>(key)
  if (cached) return cached

  const raw = await fetchPaginated(`${GITHUB_API_BASE}/user/orgs`, config, 'organizations')

  const orgs: Organization[] = []
  for (const item of raw) {
    const parsed = orgSchema.safeParse(item)
    if (!parsed.success) continue
    const o = parsed.data
    orgs.push({
      id: o.id,
      login: o.login,
      name: o.name ?? o.login,
      description: o.description ?? null,
      avatarUrl: o.avatar_url ?? '',
      memberCount: undefined,
    })
  }

  if (userLogin) {
    orgs.unshift({
      id: userId ?? 0,
      login: userLogin,
      name: `${userLogin} (personal)`,
      description: 'Your personal repositories',
      avatarUrl: '',
    })
  }

  githubCache.set(key, orgs, CACHE_TTL_MS)
  return orgs
}

export async function fetchRepositories(
  org: string,
  config: GitHubApiConfig,
  userLogin?: string,
): Promise<Repository[]> {
  assertSafeLogin(org, 'repositories')
  const key = cacheKey(CACHE_NAMESPACE, 'repos', org, tokenFingerprint(config.token))
  const cached = githubCache.get<Repository[]>(key)
  if (cached) return cached

  const isPersonal = userLogin !== undefined && userLogin === org
  const url = isPersonal ? `${GITHUB_API_BASE}/user/repos` : `${GITHUB_API_BASE}/orgs/${org}/repos`

  let raw: unknown[]
  try {
    raw = await fetchPaginated(url, config, `repositories for "${org}"`)
  } catch (error) {
    if (error instanceof GitFleetError && error.code === 'not-found') {
      throw new GitFleetError(
        'not-found',
        `Organization or user "${org}" not found, or the token cannot access it.`,
        'If this is a fine-grained token, grant it access to this organization.',
      )
    }
    throw error
  }

  let items = raw
  if (isPersonal && userLogin) {
    items = raw.filter(item => {
      const parsed = repoSchema.safeParse(item)
      return parsed.success && (parsed.data.owner?.login ?? userLogin) === userLogin
    })
  }

  const repos: Repository[] = []
  for (const item of items) {
    const parsed = repoSchema.safeParse(item)
    if (!parsed.success) continue
    const r = parsed.data
    repos.push({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      description: r.description ?? null,
      url: r.clone_url,
      sshUrl: r.ssh_url,
      isPrivate: r.private,
      isArchived: r.archived,
      stargazerCount: r.stargazers_count,
      language: r.language ?? null,
      updatedAt: r.updated_at,
      organization: org,
    })
  }

  githubCache.set(key, repos, CACHE_TTL_MS)
  return repos
}

export interface OrgFetchFailure {
  org: string
  error: string
}

export async function fetchAllRepositories(
  orgs: Organization[],
  config: GitHubApiConfig,
  userLogin?: string,
  onProgress?: (org: string, total: number) => void,
): Promise<{ repos: Repository[]; failures: OrgFetchFailure[] }> {
  const allRepos: Repository[] = []
  const failures: OrgFetchFailure[] = []

  for (const org of orgs) {
    try {
      const repos = await fetchRepositories(org.login, config, userLogin)
      allRepos.push(...repos)
      onProgress?.(org.login, repos.length)
    } catch (error) {
      const message = error instanceof GitFleetError ? error.message : redactSecrets(error instanceof Error ? error.message : String(error))
      failures.push({ org: org.login, error: message })
    }
  }

  return { repos: allRepos, failures }
}
