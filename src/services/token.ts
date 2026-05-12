import { z } from 'zod'
import { GITHUB_API_BASE, GITHUB_API_VERSION, GITHUB_REQUEST_TIMEOUT_MS, USER_AGENT } from '../constants.js'
import type { GitHubUser, TokenValidationResult } from '../types.js'

const userSchema = z.object({
  login: z.string(),
  name: z.string().nullable().optional(),
  avatar_url: z.string().optional(),
})

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': USER_AGENT,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  }
}

async function timedFetch(url: string, token: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { headers: headers(token), signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Validate the token against `GET /user`, then confirm organization access.
 * Classic PATs expose `X-OAuth-Scopes` (requires `read:org`); fine-grained
 * PATs omit it, so organization access is probed via `GET /user/orgs`.
 */
export async function validateToken(token: string): Promise<TokenValidationResult> {
  let response: Response
  try {
    response = await timedFetch(`${GITHUB_API_BASE}/user`, token)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('abort')) {
      return { valid: false, error: 'GitHub API request timed out. Check your connection and try again.' }
    }
    if (message.includes('ENOTFOUND') || message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return { valid: false, error: 'Cannot reach GitHub API. Check your internet connection.' }
    }
    return { valid: false, error: `Network error: ${message.slice(0, 160)}` }
  }

  if (response.status === 401) {
    return { valid: false, error: 'Token is invalid or has been revoked' }
  }

  if (response.status === 403) {
    return { valid: false, error: 'Token is expired, rate-limited, or lacks required permissions' }
  }

  if (response.status === 429) {
    return { valid: false, error: 'GitHub rate limit exceeded. Wait a minute and try again.' }
  }

  if (!response.ok) {
    return { valid: false, error: `GitHub API returned status ${response.status}` }
  }

  const parsed = userSchema.safeParse(await response.json())
  if (!parsed.success || !parsed.data.login) {
    return { valid: false, error: 'GitHub returned an unexpected user profile' }
  }

  const scopes = response.headers.get('X-OAuth-Scopes') || ''
  if (scopes) {
    const hasOrgScope = scopes
      .split(',')
      .map(s => s.trim())
      .includes('read:org')
    if (!hasOrgScope) {
      return { valid: false, error: 'Token does not have required scopes (read:org)' }
    }
  } else {
    // No OAuth scopes header means a fine-grained PAT: probe org access directly.
    try {
      const orgsResponse = await timedFetch(`${GITHUB_API_BASE}/user/orgs?per_page=1`, token)
      if (orgsResponse.status === 401 || orgsResponse.status === 403 || orgsResponse.status === 404) {
        return { valid: false, error: 'Token lacks organization access (classic read:org scope or fine-grained Members read permission).' }
      }
      if (!orgsResponse.ok) {
        return { valid: false, error: 'Token does not have required organization permissions' }
      }
    } catch {
      return { valid: false, error: 'Cannot reach GitHub API. Check your internet connection.' }
    }
  }

  const user: GitHubUser = {
    login: parsed.data.login,
    name: parsed.data.name || parsed.data.login,
    avatarUrl: parsed.data.avatar_url ?? '',
  }

  return { valid: true, user }
}
