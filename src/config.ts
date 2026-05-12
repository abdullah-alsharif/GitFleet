import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import dotenv from 'dotenv'
import { z } from 'zod'
import { GitFleetError } from './errors.js'
import {
  APP_NAME,
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_RETRIES,
  GIT_CLONE_TIMEOUT_MS,
  MAX_CONCURRENCY,
  MAX_RETRIES_LIMIT,
  WORKSPACE_DEFAULT,
} from './constants.js'
import type { AppConfig } from './types.js'

const protocolSchema = z.enum(['https', 'ssh'])
const themeModeSchema = z.enum(['auto', 'dark', 'light'])

const rawSchema = z.object({
  token: z
    .string()
    .trim()
    .min(1, 'GitHub token is required')
    .refine(t => !/^(ghp_your_token_here|your_token_here|xxx+)$/i.test(t), 'Placeholder token — set a real GitHub token'),
  protocol: protocolSchema,
  workspaceDir: z.string().trim().min(1),
  concurrency: z.coerce.number().int().min(1).max(MAX_CONCURRENCY),
  maxRetries: z.coerce.number().int().min(0).max(MAX_RETRIES_LIMIT),
  gitTimeoutMs: z.coerce.number().int().min(10_000).max(3_600_000),
  theme: themeModeSchema,
  nonInteractive: z.boolean(),
  json: z.boolean(),
  assumeYes: z.boolean(),
  includeArchived: z.boolean(),
  orgFilter: z.array(z.string()),
  repoFilter: z.array(z.string()),
})

export interface CliOptions {
  workspace?: string
  protocol?: string
  concurrency?: string
  maxRetries?: string
  gitTimeout?: string
  token?: string
  theme?: string
  nonInteractive?: boolean
  json?: boolean
  yes?: boolean
  orgs?: string
  repos?: string
  includeArchived?: boolean
}

function parseList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

function parseBoolEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined
  const v = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'off'].includes(v)) return false
  return undefined
}

/** Load a dotenv file. Missing/unreadable files yield {}. */
function loadEnvFile(filePath: string): Record<string, string> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return dotenv.parse(content) as Record<string, string>
  } catch {
    return {}
  }
}

function homeConfigFile(): string {
  const appData = process.env.APPDATA
  if (process.platform === 'win32' && appData) {
    return path.join(appData, APP_NAME, '.env')
  }
  return path.join(os.homedir(), '.config', APP_NAME, '.env')
}

/**
 * Precedence (highest wins):
 * CLI flags > process environment > ~/.config/gitfleet/.env > ./.env > defaults.
 * A CLI-provided --token is held in memory only, never written to disk.
 */
export function resolveConfig(cli: CliOptions): AppConfig {
  const homeFile = loadEnvFile(homeConfigFile())
  const localFile = loadEnvFile(path.resolve('.env'))

  const pick = (envKey: string): string | undefined => {
    if (process.env[envKey] !== undefined && process.env[envKey] !== '') return process.env[envKey]
    if (homeFile[envKey]) return homeFile[envKey]
    if (localFile[envKey]) return localFile[envKey]
    return undefined
  }

  const raw = {
    token: cli.token ?? pick('GITHUB_TOKEN'),
    protocol: cli.protocol ?? pick('GITFLEET_PROTOCOL') ?? 'https',
    workspaceDir: cli.workspace ?? pick('GITFLEET_WORKSPACE') ?? WORKSPACE_DEFAULT,
    concurrency: cli.concurrency ?? pick('GITFLEET_CONCURRENCY') ?? DEFAULT_CONCURRENCY,
    maxRetries: cli.maxRetries ?? pick('GITFLEET_RETRIES') ?? DEFAULT_MAX_RETRIES,
    gitTimeoutMs: cli.gitTimeout ?? pick('GITFLEET_TIMEOUT') ?? GIT_CLONE_TIMEOUT_MS,
    theme: cli.theme ?? pick('GITFLEET_THEME') ?? 'auto',
    nonInteractive: cli.nonInteractive ?? parseBoolEnv(pick('GITFLEET_NON_INTERACTIVE')) ?? false,
    json: cli.json ?? parseBoolEnv(pick('GITFLEET_JSON')) ?? false,
    assumeYes: cli.yes ?? parseBoolEnv(pick('GITFLEET_YES')) ?? false,
    includeArchived: cli.includeArchived ?? parseBoolEnv(pick('GITFLEET_INCLUDE_ARCHIVED')) ?? false,
    orgFilter: parseList(cli.orgs ?? pick('GITFLEET_ORGS')),
    repoFilter: parseList(cli.repos ?? pick('GITFLEET_REPOS')),
  }

  // --json implies headless machine-readable mode.
  const normalized = { ...raw, nonInteractive: raw.nonInteractive || raw.json }

  const parsed = rawSchema.safeParse(normalized)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(i => `  • ${(i.path.join('.') || 'config')}: ${i.message}`)
      .join('\n')
    throw new GitFleetError(
      'config',
      `Invalid configuration:\n${details}`,
      'Run `gitfleet --help` for valid option values.',
    )
  }

  const data = parsed.data
  const workspaceDir = path.resolve(data.workspaceDir.replace(/^~(?=$|[\\/])/, os.homedir()))

  return {
    token: data.token,
    protocol: data.protocol,
    workspaceDir,
    concurrency: data.concurrency,
    maxRetries: data.maxRetries,
    gitTimeoutMs: data.gitTimeoutMs,
    theme: data.theme,
    nonInteractive: data.nonInteractive,
    json: data.json,
    assumeYes: data.assumeYes,
    includeArchived: data.includeArchived,
    orgFilter: data.orgFilter,
    repoFilter: data.repoFilter,
  }
}

export function getTokenSetupGuide(): string {
  return [
    'GitHub token not found.',
    '',
    'Create a Personal Access Token at:',
    '  https://github.com/settings/tokens',
    '',
    'Classic scopes: read:org, repo',
    'Fine-grained: Contents (read) + Organization Members (read)',
    '',
    'Then either:',
    '  $ export GITHUB_TOKEN="<token>"',
    '  $ gitfleet --token <token>',
    '  $ echo \'GITHUB_TOKEN="<token>"\' > ~/.config/gitfleet/.env',
  ].join('\n')
}
