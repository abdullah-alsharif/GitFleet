import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateToken } from '../token.js'

const BASE_URL = 'https://api.github.com'

function mockFetch(status: number, body: any, headers?: Record<string, string>) {
  const init: ResponseInit = { status, headers }
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), init))
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })

describe('validateToken', () => {
  it('returns valid for a classic PAT with read:org scope', async () => {
    vi.mocked(fetch).mockImplementationOnce(
      mockFetch(200, { login: 'testuser', name: 'Test', avatar_url: '' }, { 'X-OAuth-Scopes': 'repo, read:org' }),
    )
    const result = await validateToken('ghp_token')
    expect(result.valid).toBe(true)
    expect(result.user?.login).toBe('testuser')
  })

  it('returns invalid for missing read:org scope', async () => {
    vi.mocked(fetch).mockImplementationOnce(
      mockFetch(200, { login: 'u', name: 'U', avatar_url: '' }, { 'X-OAuth-Scopes': 'repo' }),
    )
    const result = await validateToken('ghp_token')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('read:org')
  })

  it('falls back to API check for fine-grained PATs (empty scopes)', async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(mockFetch(200, { login: 'u', name: 'U', avatar_url: '' }, { 'X-OAuth-Scopes': '' }))
      .mockImplementationOnce(mockFetch(200, []))
    const result = await validateToken('ghp_token')
    expect(result.valid).toBe(true)
  })

  it('rejects fine-grained PAT without org access', async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(mockFetch(200, { login: 'u', name: 'U', avatar_url: '' }, { 'X-OAuth-Scopes': '' }))
      .mockImplementationOnce(mockFetch(404, { message: 'Not Found' }))
    const result = await validateToken('ghp_token')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('read:org')
  })

  it('returns invalid for 401', async () => {
    vi.mocked(fetch).mockImplementationOnce(mockFetch(401, {}))
    const result = await validateToken('bad_token')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('invalid')
  })

  it('returns invalid for 403', async () => {
    vi.mocked(fetch).mockImplementationOnce(mockFetch(403, {}))
    const result = await validateToken('bad_token')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('expired')
  })

  it('returns network error on ENOTFOUND', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ENOTFOUND github.com'))
    const result = await validateToken('ghp_token')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Cannot reach')
  })
})
