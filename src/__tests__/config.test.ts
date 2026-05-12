import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveConfig } from '../config.js'
import { GitFleetError } from '../errors.js'

const ENV_KEYS = [
  'GITHUB_TOKEN',
  'GITFLEET_PROTOCOL',
  'GITFLEET_WORKSPACE',
  'GITFLEET_CONCURRENCY',
  'GITFLEET_RETRIES',
  'GITFLEET_TIMEOUT',
  'GITFLEET_THEME',
  'GITFLEET_NON_INTERACTIVE',
  'GITFLEET_JSON',
  'GITFLEET_YES',
  'GITFLEET_ORGS',
  'GITFLEET_REPOS',
  'GITFLEET_INCLUDE_ARCHIVED',
]

let savedEnv: Record<string, string | undefined>
let tmpHome: string
let tmpWork: string
let savedCwd: string

beforeEach(() => {
  savedEnv = {}
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-home-'))
  tmpWork = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-work-'))
  // Canonicalize: tmpdir may contain symlinks (macOS /private) or 8.3 short
  // names (Windows), which would mismatch process.cwd()-based assertions.
  tmpHome = fs.realpathSync(tmpHome)
  tmpWork = fs.realpathSync(tmpWork)
  vi.stubEnv('HOME', tmpHome)
  savedCwd = process.cwd()
  process.chdir(tmpWork)
})

afterEach(() => {
  process.chdir(savedCwd)
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  vi.unstubAllEnvs()
  fs.rmSync(tmpHome, { recursive: true, force: true })
  fs.rmSync(tmpWork, { recursive: true, force: true })
})

describe('resolveConfig', () => {
  it('applies defaults with an env token', () => {
    process.env.GITHUB_TOKEN = 'ghp_validtoken123'
    const config = resolveConfig({})
    expect(config.protocol).toBe('https')
    expect(config.concurrency).toBe(5)
    expect(config.maxRetries).toBe(2)
    expect(config.theme).toBe('auto')
    expect(config.nonInteractive).toBe(false)
    expect(config.json).toBe(false)
    expect(config.workspaceDir).toBe(fs.realpathSync(tmpWork))
  })

  it('prefers CLI over environment', () => {
    process.env.GITHUB_TOKEN = 'ghp_envtoken'
    process.env.GITFLEET_CONCURRENCY = '7'
    const config = resolveConfig({ token: 'ghp_clitoken', concurrency: '3', protocol: 'ssh' })
    expect(config.token).toBe('ghp_clitoken')
    expect(config.concurrency).toBe(3)
    expect(config.protocol).toBe('ssh')
  })

  it('prefers environment over local .env file', () => {
    process.env.GITHUB_TOKEN = 'ghp_envtoken'
    fs.writeFileSync(path.join(tmpWork, '.env'), 'GITHUB_TOKEN=ghp_filetoken\nGITFLEET_CONCURRENCY=9\n')
    const config = resolveConfig({})
    expect(config.token).toBe('ghp_envtoken')
    expect(config.concurrency).toBe(9)
  })

  it('falls back to local .env file', () => {
    fs.writeFileSync(path.join(tmpWork, '.env'), 'GITHUB_TOKEN=ghp_filetoken\n')
    const config = resolveConfig({})
    expect(config.token).toBe('ghp_filetoken')
  })

  it('throws a config error when no token exists', () => {
    expect(() => resolveConfig({})).toThrowError(GitFleetError)
  })

  it('rejects placeholder tokens', () => {
    expect(() => resolveConfig({ token: 'ghp_your_token_here' })).toThrowError(/Placeholder/)
  })

  it('rejects out-of-range concurrency', () => {
    expect(() => resolveConfig({ token: 'ghp_x', concurrency: '99' })).toThrowError(/concurrency/)
    expect(() => resolveConfig({ token: 'ghp_x', concurrency: '0' })).toThrowError(/concurrency/)
  })

  it('rejects invalid protocol and theme', () => {
    expect(() => resolveConfig({ token: 'ghp_x', protocol: 'ftp' })).toThrowError(/protocol/)
    expect(() => resolveConfig({ token: 'ghp_x', theme: 'neon' })).toThrowError(/theme/)
  })

  it('parses org/repo lists and implies non-interactive from json', () => {
    const config = resolveConfig({ token: 'ghp_x', json: true, orgs: 'a, b ,c', repos: 'r1,r2' })
    expect(config.orgFilter).toEqual(['a', 'b', 'c'])
    expect(config.repoFilter).toEqual(['r1', 'r2'])
    expect(config.json).toBe(true)
    expect(config.nonInteractive).toBe(true)
  })

  it('resolves workspace to an absolute path', () => {
    const config = resolveConfig({ token: 'ghp_x', workspace: 'sub/dir' })
    expect(config.workspaceDir).toBe(path.join(fs.realpathSync(tmpWork), 'sub/dir'))
  })
})
