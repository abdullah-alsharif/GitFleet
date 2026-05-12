import { describe, it, expect } from 'vitest'
import { GitFleetError, EXIT_CODES, redactSecrets, toUserMessage } from '../errors.js'

describe('redactSecrets', () => {
  it('redacts classic GitHub tokens', () => {
    expect(redactSecrets('token ghp_abcdef1234567890 here')).toBe('token ghp_*** here')
    expect(redactSecrets('gho_secrectvalue')).toBe('gho_***')
  })

  it('redacts fine-grained tokens', () => {
    expect(redactSecrets('github_pat_abc123DEF456')).toBe('github_pat_***')
  })

  it('redacts authorization headers', () => {
    expect(redactSecrets('AUTHORIZATION: basic c3VwZXJzZWNyZXQ=')).toBe('AUTHORIZATION: basic ***')
    expect(redactSecrets('Authorization: Bearer ghp_abc')).toBe('Authorization: Bearer ***')
  })

  it('redacts tokens embedded in URLs', () => {
    expect(redactSecrets('https://x-access-token:ghp_secret@github.com/o/r.git')).toBe(
      'https://x-access-token:***@github.com/o/r.git',
    )
    expect(redactSecrets('clone failed ?token=abc123 done')).toBe('clone failed ?token=*** done')
  })

  it('leaves clean text untouched', () => {
    expect(redactSecrets('cloned org/repo in 3s')).toBe('cloned org/repo in 3s')
  })
})

describe('GitFleetError', () => {
  it('carries code, message, and hint', () => {
    const err = new GitFleetError('auth', 'bad token', 'make a new one')
    expect(err.code).toBe('auth')
    expect(err.message).toBe('bad token')
    expect(err.hint).toBe('make a new one')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('toUserMessage', () => {
  it('redacts secrets from plain errors', () => {
    const { message } = toUserMessage(new Error('failed with ghp_topsecret123'))
    expect(message).not.toContain('ghp_topsecret123')
    expect(message).toContain('ghp_***')
  })

  it('maps known codes to titles', () => {
    expect(toUserMessage(new GitFleetError('rate-limit', 'slow down')).title).toBe('Rate limited')
    expect(toUserMessage(new GitFleetError('validation', 'bad value')).title).toBe('Invalid configuration')
  })
})

describe('EXIT_CODES', () => {
  it('defines the documented contract', () => {
    expect(EXIT_CODES.success).toBe(0)
    expect(EXIT_CODES.error).toBe(1)
    expect(EXIT_CODES.partial).toBe(2)
    expect(EXIT_CODES.cancelled).toBe(130)
  })
})
