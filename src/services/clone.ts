import fs from 'node:fs'
import path from 'node:path'
import { execa } from 'execa'
import pLimit from 'p-limit'
import { RETRY_BASE_DELAY_MS, RETRY_JITTER_MS, GIT_FETCH_TIMEOUT_MS } from '../constants.js'
import { GitFleetError, redactSecrets } from '../errors.js'
import type { CloneFailureKind, CloneResult, CloneTask, Protocol } from '../types.js'

export interface CloneOptions {
  workspaceDir: string
  protocol: Protocol
  concurrency: number
  /** Bearer token used for HTTPS auth (never embedded in URLs). */
  token?: string
  maxRetries: number
  gitTimeoutMs: number
  onProgress?: (result: CloneResult) => void
  onQueueChange?: (queued: number) => void
}

// Org/repo names come from the network and are untrusted.

const SAFE_NAME = /^[A-Za-z0-9_.-]+$/

export function assertSafeName(value: string, what: 'organization' | 'repository'): void {
  if (value === '.' || value === '..' || !SAFE_NAME.test(value)) {
    throw new GitFleetError(
      'filesystem',
      `Refusing to use unsafe ${what} name: ${JSON.stringify(value.slice(0, 80))}`,
      'Names must be alphanumeric (plus `.`, `-`, `_`).',
    )
  }
}

/** Join workspace/org/repo, refusing paths that escape the workspace. */
export function resolveRepoDir(workspaceDir: string, org: string, name: string): { orgDir: string; repoDir: string } {
  assertSafeName(org, 'organization')
  assertSafeName(name, 'repository')
  const workspace = path.resolve(workspaceDir)
  const orgDir = path.join(workspace, org)
  const repoDir = path.join(orgDir, name)
  for (const dir of [orgDir, repoDir]) {
    const rel = path.relative(workspace, dir)
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new GitFleetError('filesystem', `Resolved path escapes the workspace: ${dir}`)
    }
  }
  return { orgDir, repoDir }
}

// All git operations go through execa with array argv (no shell).

export async function ensureGitAvailable(): Promise<string> {
  try {
    const result = await execa('git', ['--version'], { timeout: 10_000 })
    return result.stdout.trim()
  } catch {
    throw new GitFleetError(
      'git-absent',
      'Git executable not found. GitFleet needs git to clone repositories.',
      'Install git (https://git-scm.com/downloads) and make sure `git --version` works.',
    )
  }
}

/**
 * Authenticate HTTPS git operations WITHOUT embedding the token in the remote
 * URL (which would persist it into `.git/config`): ephemeral `http.extraHeader`
 * scoped to the child process via environment.
 */
function authEnv(token: string | undefined, protocol: Protocol): Record<string, string> {
  const env: Record<string, string> = {
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
  }
  if (protocol === 'https' && token) {
    const credentials = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64')
    env.GIT_CONFIG_COUNT = '1'
    env.GIT_CONFIG_KEY_0 = 'http.extraHeader'
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${credentials}`
  }
  return env
}

interface GitRunResult {
  ok: boolean
  timedOut: boolean
  stdout: string
  stderr: string
}

async function runGit(args: string[], cwd: string, timeout: number, env: Record<string, string>): Promise<GitRunResult> {
  try {
    const result = await execa('git', args, {
      cwd,
      timeout,
      env: { ...process.env, ...env },
      stdio: 'pipe',
      stripFinalNewline: true,
    })
    return { ok: true, timedOut: false, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; timedOut?: boolean }
    return {
      ok: false,
      timedOut: err.timedOut === true,
      stdout: typeof err.stdout === 'string' ? err.stdout : '',
      stderr: typeof err.stderr === 'string' ? err.stderr : '',
    }
  }
}

function combinedOutput(run: GitRunResult): string {
  return redactSecrets(`${run.stderr}\n${run.stdout}`.trim())
}

// Only transient failures are retried.

export function classifyGitError(output: string, timedOut: boolean): CloneFailureKind {
  if (timedOut) return 'timeout'
  const text = output.toLowerCase()
  if (
    text.includes('authentication failed') ||
    text.includes('invalid username or password') ||
    text.includes('could not read username') ||
    text.includes('permission denied (publickey)') ||
    text.includes('remote: invalid username') ||
    text.includes('401') ||
    text.includes('403') ||
    text.includes('access denied')
  ) {
    return 'auth'
  }
  if (
    text.includes('repository not found') ||
    text.includes('could not find repository') ||
    text.includes('not found:') ||
    text.includes('404') ||
    text.includes('remote: repository not found')
  ) {
    return 'not-found'
  }
  if (
    text.includes('could not resolve host') ||
    text.includes('network is unreachable') ||
    text.includes('connection reset') ||
    text.includes('connection refused') ||
    text.includes('timed out') ||
    text.includes('operation timed out') ||
    text.includes('internal server error') ||
    text.includes('502') ||
    text.includes('503') ||
    text.includes('the remote end hung up')
  ) {
    return 'network'
  }
  if (text.includes('your local changes') || text.includes('would be overwritten') || text.includes('dirty')) {
    return 'dirty'
  }
  if (
    text.includes('non-fast-forward') ||
    text.includes('divergent branches') ||
    text.includes('need to merge') ||
    text.includes('unrelated histories')
  ) {
    return 'conflict'
  }
  if (text.includes('permission denied') && text.includes('mkdir')) return 'filesystem'
  if (text.includes('no space left') || text.includes('disk quota')) return 'filesystem'
  return 'unknown'
}

export function isRetryableKind(kind: CloneFailureKind): boolean {
  return kind === 'network' || kind === 'timeout'
}

function friendlyMessage(kind: CloneFailureKind, output: string): string {
  const firstLine = output.split('\n').map(l => l.trim()).filter(Boolean)[0] ?? ''
  const short = firstLine.slice(0, 160)
  switch (kind) {
    case 'auth':
      return 'Git authentication failed. For HTTPS set a valid token; for SSH check your key/agent access to this repo.'
    case 'not-found':
      return 'Repository not found on GitHub (renamed, deleted, or token lacks access).'
    case 'network':
      return `Network error during git operation${short ? `: ${short}` : '.'}`
    case 'timeout':
      return 'Git operation timed out. Try again or raise --timeout.'
    case 'dirty':
      return 'Local changes would be overwritten — left untouched. Commit, stash, or discard them, then rerun.'
    case 'conflict':
      return 'Local branch diverged from remote — left untouched. Merge or reset it manually, then rerun.'
    case 'filesystem':
      return `Filesystem error${short ? `: ${short}` : '.'}`
    default:
      return short || 'Git operation failed.'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function backoffDelay(attempt: number): number {
  return RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * RETRY_JITTER_MS
}

async function cloneRepo(
  url: string,
  dest: string,
  env: Record<string, string>,
  timeout: number,
  maxRetries: number,
): Promise<{ attempts: number }> {
  let attempts = 0
  // Remove interrupted/partial clones before (re)trying.
  const removePartial = () => {
    try {
      fs.rmSync(dest, { recursive: true, force: true })
    } catch {
      // Cleanup failures are ignored; the clone error below carries the signal.
    }
  }

  for (;;) {
    attempts++
    removePartial()
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    try {
      await execa('git', ['clone', url, dest], {
        timeout,
        env: { ...process.env, ...env },
        stdio: 'pipe',
        stripFinalNewline: true,
      })
      return { attempts }
    } catch (error) {
      const err = error as { timedOut?: boolean; stderr?: string; stdout?: string; message?: string }
      const output = redactSecrets(`${err.stderr ?? ''}\n${err.stdout ?? ''}\n${err.message ?? ''}`.trim())
      const kind = classifyGitError(output, err.timedOut === true)
      if (!isRetryableKind(kind) || attempts > maxRetries + 1) {
        removePartial()
        const failure = new Error(friendlyMessage(kind, output)) as Error & { kind: CloneFailureKind; attempts: number }
        failure.kind = kind
        failure.attempts = attempts
        throw failure
      }
      await sleep(backoffDelay(attempts - 1))
    }
  }
}

interface PullOutcome {
  updated: boolean
  skippedReason?: string
}

async function pullRepo(repoDir: string, env: Record<string, string>, timeout: number): Promise<PullOutcome> {
  const inside = await runGit(['rev-parse', '--is-inside-work-tree'], repoDir, 15_000, env)
  if (!inside.ok || inside.stdout.trim() !== 'true') {
    throw Object.assign(new Error('Directory exists but is not a git repository. Move it aside and rerun.'), {
      kind: 'filesystem' as CloneFailureKind,
    })
  }

  const remote = await runGit(['remote', 'get-url', 'origin'], repoDir, 15_000, env)
  if (!remote.ok) {
    throw Object.assign(new Error('Existing repository has no "origin" remote. Set it manually and rerun.'), {
      kind: 'unknown' as CloneFailureKind,
    })
  }

  const before = await runGit(['rev-parse', 'HEAD'], repoDir, 15_000, env)
  const beforeHead = before.ok ? before.stdout.trim() : ''

  const fetchTimeout = Math.min(timeout, GIT_FETCH_TIMEOUT_MS)
  const fetchRun = await runGit(['fetch', 'origin'], repoDir, fetchTimeout, env)
  if (!fetchRun.ok) {
    const kind = classifyGitError(redactSecrets(fetchRun.stderr), fetchRun.timedOut)
    throw Object.assign(new Error(friendlyMessage(kind, redactSecrets(fetchRun.stderr))), { kind })
  }

  const dirty = await runGit(['status', '--porcelain'], repoDir, 15_000, env)
  if (dirty.ok && dirty.stdout.trim() !== '') {
    return { updated: false, skippedReason: 'local changes kept' }
  }

  const pull = await runGit(['pull', '--ff-only'], repoDir, fetchTimeout, env)
  if (!pull.ok) {
    const output = combinedOutput(pull)
    const kind = classifyGitError(output, false)
    if (kind === 'dirty') return { updated: false, skippedReason: 'local changes kept' }
    throw Object.assign(new Error(friendlyMessage(kind, output)), { kind })
  }

  const after = await runGit(['rev-parse', 'HEAD'], repoDir, 15_000, env)
  return { updated: beforeHead !== '' && after.ok && after.stdout.trim() !== beforeHead }
}

export async function cloneAll(tasks: CloneTask[], options: CloneOptions): Promise<CloneResult[]> {
  await ensureGitAvailable()

  const concurrency = Math.max(1, Math.min(20, Math.floor(options.concurrency) || 1))
  const limit = pLimit(concurrency)
  const env = authEnv(options.token, options.protocol)
  const total = tasks.length
  options.onQueueChange?.(total)

  const promises = tasks.map(task =>
    limit(async (): Promise<CloneResult> => {
      const startTime = Date.now()
      const { repoDir } = resolveRepoDir(options.workspaceDir, task.org, task.name)
      const url = options.protocol === 'ssh' ? task.sshUrl : task.url

      try {
        if (fs.existsSync(repoDir)) {
          const outcome = await pullRepo(repoDir, env, options.gitTimeoutMs)
          const result: CloneResult = {
            fullName: task.fullName,
            org: task.org,
            name: task.name,
            status: outcome.updated ? 'updated' : 'skipped',
            durationMs: Date.now() - startTime,
            attempts: 1,
            ...(outcome.skippedReason ? { note: outcome.skippedReason } : {}),
          }
          options.onProgress?.(result)
          return result
        }

        const { attempts } = await cloneRepo(url, repoDir, env, options.gitTimeoutMs, options.maxRetries)
        const result: CloneResult = {
          fullName: task.fullName,
          org: task.org,
          name: task.name,
          status: 'cloned',
          durationMs: Date.now() - startTime,
          attempts,
        }
        options.onProgress?.(result)
        return result
      } catch (error) {
        const kind: CloneFailureKind =
          (error as { kind?: CloneFailureKind }).kind ??
          classifyGitError(redactSecrets(error instanceof Error ? error.message : String(error)), false)
        const result: CloneResult = {
          fullName: task.fullName,
          org: task.org,
          name: task.name,
          status: 'failed',
          kind,
          error: redactSecrets(error instanceof Error ? error.message : String(error)).slice(0, 300),
          durationMs: Date.now() - startTime,
          attempts: (error as { attempts?: number }).attempts ?? 1,
        }
        options.onProgress?.(result)
        return result
      }
    }),
  )

  return Promise.all(promises)
}

export function createCloneTasks(
  repos: Array<{ fullName: string; organization: string; name: string; url: string; sshUrl: string }>,
): CloneTask[] {
  return repos.map(repo => ({
    org: repo.organization,
    name: repo.name,
    url: repo.url,
    sshUrl: repo.sshUrl,
    fullName: repo.fullName,
  }))
}
