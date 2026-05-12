import { validateToken } from './services/token.js'
import { fetchOrganizations, fetchAllRepositories } from './services/github.js'
import { cloneAll, createCloneTasks } from './services/clone.js'
import { EXIT_CODES, toUserMessage } from './errors.js'
import { formatDuration } from './utils/format.js'
import type { AppConfig, CloneResult, GitHubApiConfig } from './types.js'

/**
 * Non-interactive mode for scripts and CI. Human-readable progress goes to
 * stderr; with `json` only the final document goes to stdout. Exits 0/1/2.
 */
export async function runHeadless(config: AppConfig): Promise<number> {
  const log = (...args: unknown[]) => console.error(...args)
  const out = (...args: unknown[]) => console.log(...args)

  const apiConfig: GitHubApiConfig = {
    token: config.token,
    baseUrl: 'https://api.github.com',
    version: '2022-11-28',
  }

  const validation = await validateToken(config.token)
  if (!validation.valid) {
    log(`error: ${validation.error || 'Invalid token'}`)
    return EXIT_CODES.error
  }
  const username = validation.user?.login ?? ''

  let orgs: Awaited<ReturnType<typeof fetchOrganizations>>
  try {
    orgs = await fetchOrganizations(apiConfig, username || undefined)
  } catch (error) {
    const { message } = toUserMessage(error)
    log(`error: ${message}`)
    return EXIT_CODES.error
  }

  if (config.orgFilter.length > 0) {
    const wanted = new Set(config.orgFilter.map(o => o.toLowerCase()))
    orgs = orgs.filter(o => wanted.has(o.login.toLowerCase()))
    const missing = config.orgFilter.filter(o => !orgs.some(org => org.login.toLowerCase() === o.toLowerCase()))
    for (const m of missing) log(`warning: organization "${m}" not found or not accessible`)
    if (orgs.length === 0) {
      log('error: no matching organizations')
      return EXIT_CODES.error
    }
  } else {
    log('error: --orgs is required in non-interactive mode (e.g. --orgs "my-org,other-org")')
    return EXIT_CODES.error
  }

  const startedAt = Date.now()
  const { repos, failures } = await fetchAllRepositories(orgs, apiConfig, username || undefined)
  for (const f of failures) log(`warning: failed to list ${f.org}: ${f.error}`)

  let selected = config.includeArchived ? repos : repos.filter(r => !r.isArchived)
  if (config.repoFilter.length > 0) {
    const wanted = new Set(config.repoFilter.map(r => r.toLowerCase()))
    selected = selected.filter(r => wanted.has(r.name.toLowerCase()) || wanted.has(r.fullName.toLowerCase()))
  }
  if (selected.length === 0) {
    log('error: no repositories selected')
    return EXIT_CODES.error
  }

  if (!config.json) {
    log(`Cloning ${selected.length} repositories into ${config.workspaceDir} ...`)
  }

  let done = 0
  const onProgress = (result: CloneResult) => {
    done++
    if (!config.json) {
      const mark = result.status === 'cloned' ? '+' : result.status === 'updated' ? '~' : result.status === 'skipped' ? '=' : 'x'
      log(`[${done}/${selected.length}] ${mark} ${result.fullName}${result.error ? ` — ${result.error}` : ''}`)
    }
  }

  const results = await cloneAll(createCloneTasks(selected), {
    workspaceDir: config.workspaceDir,
    protocol: config.protocol,
    concurrency: config.concurrency,
    token: config.token,
    maxRetries: config.maxRetries,
    gitTimeoutMs: config.gitTimeoutMs,
    onProgress,
  })

  const failed = results.filter(r => r.status === 'failed')
  const durationMs = Date.now() - startedAt
  const summary = {
    total: results.length,
    cloned: results.filter(r => r.status === 'cloned').length,
    updated: results.filter(r => r.status === 'updated').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    failed: failed.length,
    durationMs,
    workspace: config.workspaceDir,
    protocol: config.protocol,
    results: results.map(r => ({
      repo: r.fullName,
      status: r.status,
      ...(r.kind ? { kind: r.kind } : {}),
      ...(r.error ? { error: r.error } : {}),
      ...(r.durationMs !== undefined ? { durationMs: r.durationMs } : {}),
    })),
  }

  if (config.json) {
    out(JSON.stringify(summary, null, 2))
  } else {
    out(
      `Done: ${summary.cloned} cloned, ${summary.updated} updated, ${summary.skipped} skipped, ${summary.failed} failed ` +
        `in ${formatDuration(durationMs)}.`,
    )
    for (const f of failed) out(`  FAILED ${f.fullName}: ${f.error ?? f.kind ?? 'unknown error'}`)
  }

  return failed.length > 0 ? EXIT_CODES.partial : EXIT_CODES.success
}
