export interface GitHubUser {
  login: string
  name: string | null
  avatarUrl: string
}

export interface Organization {
  id: number
  login: string
  name: string | null
  description: string | null
  avatarUrl: string
  memberCount?: number
}

export interface Repository {
  id: number
  name: string
  fullName: string
  description: string | null
  url: string
  sshUrl: string
  isPrivate: boolean
  isArchived: boolean
  stargazerCount: number
  language: string | null
  updatedAt: string
  organization: string
}

export interface RepoDisplay extends Repository {
  selected: boolean
}

export interface OrgDisplay extends Organization {
  selected: boolean
}

export type CloneStatus = 'cloned' | 'updated' | 'skipped' | 'failed' | 'cloning' | 'queued'

/** Machine-classified failure reason. Only `network`/`timeout` are retried. */
export type CloneFailureKind =
  | 'auth'
  | 'not-found'
  | 'network'
  | 'timeout'
  | 'dirty'
  | 'conflict'
  | 'filesystem'
  | 'unknown'

export interface CloneTask {
  org: string
  name: string
  url: string
  sshUrl: string
  fullName: string
}

export interface CloneResult {
  fullName: string
  org: string
  name: string
  status: CloneStatus
  /** Failure classification (present when status is `failed`). */
  kind?: CloneFailureKind
  /** User-safe, secret-redacted failure message. */
  error?: string
  /** Total wall-clock time for this repository in ms. */
  durationMs?: number
  /** How many attempts were made (1 = no retry). */
  attempts?: number
  /** Extra context, e.g. "local changes kept". */
  note?: string
}

export type Screen =
  | 'loading'
  | 'token-error'
  | 'org-select'
  | 'repo-select'
  | 'confirm'
  | 'clone-progress'
  | 'summary'

export type SortField = 'name' | 'stars' | 'updated'
export type Protocol = 'https' | 'ssh'
export type ThemeMode = 'auto' | 'dark' | 'light'

export interface TokenValidationResult {
  valid: boolean
  user?: GitHubUser
  error?: string
}

export interface GitHubApiConfig {
  token: string
  baseUrl: string
  version: string
}

export interface AppConfig {
  token: string
  protocol: Protocol
  /** Always absolute. */
  workspaceDir: string
  concurrency: number
  maxRetries: number
  gitTimeoutMs: number
  theme: ThemeMode
  nonInteractive: boolean
  json: boolean
  assumeYes: boolean
  includeArchived: boolean
  /** When non-empty (non-interactive), restrict to these org logins. */
  orgFilter: string[]
  /** When non-empty (non-interactive), restrict to these repo names. */
  repoFilter: string[]
}
