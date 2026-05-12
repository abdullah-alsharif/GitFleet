/** Error taxonomy. Service boundaries convert unknown failures into these. */
export type ErrorCode =
  | 'auth'
  | 'forbidden'
  | 'rate-limit'
  | 'not-found'
  | 'network'
  | 'github-api'
  | 'git-absent'
  | 'filesystem'
  | 'config'
  | 'validation'

export class GitFleetError extends Error {
  readonly code: ErrorCode
  readonly hint?: string

  constructor(code: ErrorCode, message: string, hint?: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions | undefined)
    this.name = 'GitFleetError'
    this.code = code
    this.hint = hint
  }
}

/** Stable CLI exit codes (documented in README). */
export const EXIT_CODES = {
  success: 0,
  error: 1,
  partial: 2,
  cancelled: 130,
} as const

/** Strip credentials from free-form text before it reaches UI/logs. */
export function redactSecrets(text: string): string {
  if (!text) return text
  return (
    text
      // GitHub token formats: classic (ghp_/gho_/ghu_/ghs_/ghr_) + fine-grained (github_pat_)
      .replace(/github_pat_[A-Za-z0-9_]+/g, 'github_pat_***')
      .replace(/gh[pousr]_[A-Za-z0-9]+/g, match => `${match.slice(0, 4)}***`)
      // Authorization headers / basic-auth blobs
      .replace(/(Authorization:\s*(?:Basic|Bearer|token)\s+)[^\s'"]+/gi, '$1***')
      .replace(/([?&](?:token|access_token)=)[^&\s'"]+/gi, '$1***')
      // x-access-token embedded in URLs (legacy / defensive)
      .replace(/x-access-token:[^@\s'"]+@/gi, 'x-access-token:***@')
  )
}

/** Convert any thrown value into a user-safe message (secrets redacted). */
export function toUserMessage(error: unknown): { title: string; message: string; hint?: string } {
  if (error instanceof GitFleetError) {
    return { title: errorTitle(error.code), message: redactSecrets(error.message), hint: error.hint }
  }
  if (error instanceof Error) {
    return { title: 'Unexpected error', message: redactSecrets(error.message) }
  }
  return { title: 'Unexpected error', message: redactSecrets(String(error)) }
}

function errorTitle(code: ErrorCode): string {
  switch (code) {
    case 'auth':
      return 'Authentication failed'
    case 'forbidden':
      return 'Access denied'
    case 'rate-limit':
      return 'Rate limited'
    case 'not-found':
      return 'Not found'
    case 'network':
      return 'Network error'
    case 'github-api':
      return 'GitHub API error'
    case 'git-absent':
      return 'Git not found'
    case 'filesystem':
      return 'Filesystem error'
    case 'config':
    case 'validation':
      return 'Invalid configuration'
    default:
      return 'Unexpected error'
  }
}
