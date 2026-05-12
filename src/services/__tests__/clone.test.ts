import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createCloneTasks,
  classifyGitError,
  isRetryableKind,
  assertSafeName,
  resolveRepoDir,
} from '../clone.js'

vi.mock('execa', () => ({ execa: vi.fn() }))

import { execa } from 'execa'
import { cloneAll } from '../clone.js'

const mockedExeca = vi.mocked(execa)

describe('createCloneTasks', () => {
  it('maps repos to clone tasks', () => {
    const repos = [
      { fullName: 'org1/repo1', organization: 'org1', name: 'repo1', url: 'https://github.com/org1/repo1.git', sshUrl: 'git@github.com:org1/repo1.git' },
      { fullName: 'org1/repo2', organization: 'org1', name: 'repo2', url: 'https://github.com/org1/repo2.git', sshUrl: 'git@github.com:org1/repo2.git' },
    ]
    const tasks = createCloneTasks(repos)
    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toEqual({ org: 'org1', name: 'repo1', url: expect.stringContaining('repo1'), sshUrl: expect.stringContaining('repo1'), fullName: 'org1/repo1' })
  })

  it('returns empty array for no repos', () => {
    expect(createCloneTasks([])).toEqual([])
  })
})

describe('classifyGitError', () => {
  it('detects auth failures', () => {
    expect(classifyGitError('remote: Invalid username or password.\nfatal: Authentication failed', false)).toBe('auth')
    expect(classifyGitError('git@github.com: Permission denied (publickey).', false)).toBe('auth')
  })

  it('detects missing repositories', () => {
    expect(classifyGitError('remote: Repository not found.\nfatal: repository not found', false)).toBe('not-found')
  })

  it('detects network failures', () => {
    expect(classifyGitError('Could not resolve host: github.com', false)).toBe('network')
    expect(classifyGitError('Connection reset by peer', false)).toBe('network')
  })

  it('detects timeouts', () => {
    expect(classifyGitError('', true)).toBe('timeout')
  })

  it('detects dirty trees and divergence', () => {
    expect(classifyGitError('error: Your local changes would be overwritten', false)).toBe('dirty')
    expect(classifyGitError('Divergent branches: need merge', false)).toBe('conflict')
  })

  it('falls back to unknown', () => {
    expect(classifyGitError('some bizarre git message', false)).toBe('unknown')
  })
})

describe('isRetryableKind', () => {
  it('retries only transient failures', () => {
    expect(isRetryableKind('network')).toBe(true)
    expect(isRetryableKind('timeout')).toBe(true)
    expect(isRetryableKind('auth')).toBe(false)
    expect(isRetryableKind('not-found')).toBe(false)
    expect(isRetryableKind('dirty')).toBe(false)
    expect(isRetryableKind('conflict')).toBe(false)
    expect(isRetryableKind('unknown')).toBe(false)
  })
})

describe('assertSafeName', () => {
  it('accepts normal names', () => {
    expect(() => assertSafeName('my-repo_2.0', 'repository')).not.toThrow()
  })

  it('rejects traversal and separators', () => {
    expect(() => assertSafeName('..', 'repository')).toThrowError()
    expect(() => assertSafeName('../evil', 'organization')).toThrowError()
    expect(() => assertSafeName('a/b', 'repository')).toThrowError()
    expect(() => assertSafeName('', 'repository')).toThrowError()
    expect(() => assertSafeName('semi;colon', 'repository')).toThrowError()
  })
})

describe('resolveRepoDir', () => {
  it('resolves inside the workspace', () => {
    const ws = path.resolve('/tmp/ws')
    const { orgDir, repoDir } = resolveRepoDir('/tmp/ws', 'my-org', 'my-repo')
    expect(orgDir).toBe(path.join(ws, 'my-org'))
    expect(repoDir).toBe(path.join(ws, 'my-org', 'my-repo'))
  })

  it('rejects unsafe names', () => {
    expect(() => resolveRepoDir('/tmp/ws', '..', 'r')).toThrowError()
  })
})

describe('cloneAll', () => {
  let workspace: string

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-clone-'))
    mockedExeca.mockReset()
    // git --version probe
    mockedExeca.mockResolvedValue({ stdout: 'git version 2.45.0', stderr: '' } as never)
  })

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true })
  })

  const baseOptions = () => ({
    workspaceDir: workspace,
    protocol: 'https' as const,
    concurrency: 2,
    token: 'ghp_test',
    maxRetries: 0,
    gitTimeoutMs: 30_000,
  })

  it('clones a fresh repo without embedding the token in argv', async () => {
    mockedExeca.mockImplementation((bin: string, args?: string[]) => {
      if (args?.[0] === '--version') return Promise.resolve({ stdout: 'git version 2.45.0', stderr: '' }) as never
      return Promise.resolve({ stdout: '', stderr: '' }) as never
    })
    const tasks = createCloneTasks([
      { fullName: 'o/r', organization: 'o', name: 'r', url: 'https://github.com/o/r.git', sshUrl: 'git@github.com:o/r.git' },
    ])
    const results = await cloneAll(tasks, baseOptions())
    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe('cloned')

    const cloneCall = mockedExeca.mock.calls.find(call => (call[1] as string[])?.[0] === 'clone')
    expect(cloneCall).toBeDefined()
    const argv = (cloneCall?.[1] as string[]).join(' ')
    expect(argv).not.toContain('ghp_test')
    expect(argv).toContain('https://github.com/o/r.git')
  })

  it('does not retry auth failures', async () => {
    mockedExeca.mockImplementation(((_bin: string, args?: string[]) => {
      if (args?.[0] === '--version') return Promise.resolve({ stdout: 'git version 2.45.0', stderr: '' }) as never
      return Promise.reject(Object.assign(new Error('clone failed'), {
        stderr: 'remote: Invalid username or password.\nfatal: Authentication failed',
        stdout: '',
      })) as never
    }) as never)
    const tasks = createCloneTasks([
      { fullName: 'o/private', organization: 'o', name: 'private', url: 'https://github.com/o/private.git', sshUrl: 'git@github.com:o/private.git' },
    ])
    const results = await cloneAll(tasks, { ...baseOptions(), maxRetries: 3 })
    expect(results[0]?.status).toBe('failed')
    expect(results[0]?.kind).toBe('auth')
    const cloneCalls = mockedExeca.mock.calls.filter(call => (call[1] as string[])?.[0] === 'clone')
    expect(cloneCalls).toHaveLength(1)
  })

  it('retries network failures then succeeds', async () => {
    let calls = 0
    mockedExeca.mockImplementation(((_bin: string, args?: string[]) => {
      if (args?.[0] === '--version') return Promise.resolve({ stdout: 'git version 2.45.0', stderr: '' }) as never
      calls++
      if (calls === 1) {
        return Promise.reject(Object.assign(new Error('boom'), { stderr: 'Could not resolve host: github.com', stdout: '' })) as never
      }
      return Promise.resolve({ stdout: '', stderr: '' }) as never
    }) as never)
    const tasks = createCloneTasks([
      { fullName: 'o/r', organization: 'o', name: 'r', url: 'https://github.com/o/r.git', sshUrl: 'git@github.com:o/r.git' },
    ])
    const results = await cloneAll(tasks, { ...baseOptions(), maxRetries: 2 })
    expect(results[0]?.status).toBe('cloned')
    expect(results[0]?.attempts).toBe(2)
  })

  it('pulls existing checkouts and skips dirty trees', async () => {
    const repoDir = path.join(workspace, 'o', 'r')
    fs.mkdirSync(repoDir, { recursive: true })
    mockedExeca.mockImplementation(((_bin: string, args?: string[]) => {
      const cmd = (args ?? []).join(' ')
      if (args?.[0] === '--version') return Promise.resolve({ stdout: 'git version 2.45.0', stderr: '' }) as never
      if (cmd.includes('is-inside-work-tree')) return Promise.resolve({ stdout: 'true', stderr: '' }) as never
      if (cmd.includes('get-url')) return Promise.resolve({ stdout: 'https://github.com/o/r.git', stderr: '' }) as never
      if (cmd.includes('rev-parse HEAD')) return Promise.resolve({ stdout: 'abc123', stderr: '' }) as never
      if (cmd === 'fetch origin') return Promise.resolve({ stdout: '', stderr: '' }) as never
      if (cmd.includes('status --porcelain')) return Promise.resolve({ stdout: ' M dirty.ts\n', stderr: '' }) as never
      return Promise.resolve({ stdout: '', stderr: '' }) as never
    }) as never)
    const tasks = createCloneTasks([
      { fullName: 'o/r', organization: 'o', name: 'r', url: 'https://github.com/o/r.git', sshUrl: 'git@github.com:o/r.git' },
    ])
    const results = await cloneAll(tasks, baseOptions())
    expect(results[0]?.status).toBe('skipped')
    expect(results[0]?.note).toBe('local changes kept')
  })
})
