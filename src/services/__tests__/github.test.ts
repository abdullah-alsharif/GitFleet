import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchOrganizations, fetchRepositories, fetchAllRepositories } from '../github.js'
import { githubCache } from '../cache.js'
import { GitFleetError } from '../../errors.js'

const BASE_URL = 'https://api.github.com'
const config = { token: 'ghp_test', baseUrl: BASE_URL, version: '2022-11-28' }

function mockResponse(status: number, data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status }))
}

function paginatedMock(firstPage: any[]) {
  let page = 0
  return () => {
    page++
    return mockResponse(200, page === 1 ? firstPage : [])
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  githubCache.clear()
})

describe('fetchOrganizations', () => {
  it('returns orgs from API', async () => {
    vi.mocked(fetch).mockImplementation(paginatedMock([
      { id: 1, login: 'org1', name: 'Org One', description: 'desc', avatar_url: '' },
    ]))
    const orgs = await fetchOrganizations(config, 'user1')
    expect(orgs.some(o => o.login === 'org1')).toBe(true)
    expect(orgs.some(o => o.login === 'user1')).toBe(true)
  })

  it('prepends personal org', async () => {
    vi.mocked(fetch).mockImplementation(paginatedMock([]))
    const orgs = await fetchOrganizations(config, 'myuser')
    expect(orgs[0].login).toBe('myuser')
    expect(orgs[0].name).toContain('personal')
  })

  it('caches results', async () => {
    vi.mocked(fetch).mockImplementation(paginatedMock([
      { id: 1, login: 'org1', name: 'O1', description: null, avatar_url: '' },
    ]))
    await fetchOrganizations(config, 'u')
    const spy = vi.fn()
    vi.mocked(fetch).mockImplementation(spy)
    await fetchOrganizations(config, 'u')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('fetchRepositories', () => {
  it('fetches org repos', async () => {
    vi.mocked(fetch).mockImplementation(paginatedMock([
      { id: 1, name: 'repo1', full_name: 'org1/repo1', description: null, clone_url: '', ssh_url: '', private: false, archived: false, stargazers_count: 0, language: null, updated_at: new Date().toISOString(), owner: { login: 'org1' } },
    ]))
    const repos = await fetchRepositories('org1', config)
    expect(repos).toHaveLength(1)
    expect(repos[0].name).toBe('repo1')
  })

  it('filters personal repos by owner', async () => {
    vi.mocked(fetch).mockImplementation(paginatedMock([
      { id: 1, name: 'mine', full_name: 'me/mine', clone_url: '', ssh_url: '', private: false, archived: false, stargazers_count: 0, language: null, updated_at: new Date().toISOString(), owner: { login: 'me' } },
      { id: 2, name: 'theirs', full_name: 'org/theirs', clone_url: '', ssh_url: '', private: false, archived: false, stargazers_count: 0, language: null, updated_at: new Date().toISOString(), owner: { login: 'org' } },
    ]))
    const repos = await fetchRepositories('me', config, 'me')
    expect(repos).toHaveLength(1)
    expect(repos[0].name).toBe('mine')
  })

  it('caches results', async () => {
    vi.mocked(fetch).mockImplementation(paginatedMock([]))
    await fetchRepositories('org1', config)
    const spy = vi.fn()
    vi.mocked(fetch).mockImplementation(spy)
    await fetchRepositories('org1', config)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('pagination via Link headers', () => {
  it('follows rel="next" across pages', async () => {
    const page1 = [
      { id: 1, login: 'org1', name: 'O1', description: null, avatar_url: '' },
    ]
    const page2 = [
      { id: 2, login: 'org2', name: 'O2', description: null, avatar_url: '' },
    ]
    vi.mocked(fetch)
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify(page1), {
            status: 200,
            headers: { link: '<https://api.github.com/user/orgs?page=2>; rel="next"' },
          }),
        ),
      )
      .mockImplementationOnce(() => mockResponse(200, page2))
    const orgs = await fetchOrganizations(config)
    expect(orgs.map(o => o.login)).toEqual(['org1', 'org2'])
  })

  it('stops without a next link', async () => {
    const spy = vi.mocked(fetch).mockImplementation(paginatedMock([
      { id: 1, login: 'org1', name: 'O1', description: null, avatar_url: '' },
    ]))
    await fetchOrganizations(config)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('API error mapping', () => {
  it('maps 401 to auth errors', async () => {
    vi.mocked(fetch).mockImplementation(() => mockResponse(401, { message: 'Bad credentials' }))
    await expect(fetchOrganizations(config)).rejects.toMatchObject({ code: 'auth' })
  })

  it('maps exhausted rate limits with reset time', async () => {
    const reset = Math.floor(Date.now() / 1000) + 60
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
          status: 403,
          headers: { 'x-ratelimit-reset': String(reset) },
        }),
      ),
    )
    const error = await fetchOrganizations(config).catch(e => e)
    expect(error).toBeInstanceOf(GitFleetError)
    expect(error.code).toBe('rate-limit')
    expect(error.message).toMatch(/Resets in \d+s/)
  })

  it('wraps org 404s with actionable context', async () => {
    vi.mocked(fetch).mockImplementation(() => mockResponse(404, { message: 'Not Found' }))
    const error = await fetchRepositories('ghost-org', config).catch(e => e)
    expect(error).toBeInstanceOf(GitFleetError)
    expect(error.code).toBe('not-found')
    expect(error.message).toContain('ghost-org')
  })

  it('rejects unsafe org names without requesting', async () => {
    const spy = vi.mocked(fetch).mockImplementation(() => mockResponse(200, []))
    await expect(fetchRepositories('../../evil', config)).rejects.toMatchObject({ code: 'validation' })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('response validation', () => {
  it('skips malformed entries instead of failing', async () => {
    vi.mocked(fetch).mockImplementation(paginatedMock([
      { id: 1, name: 'good', full_name: 'o/good', description: null, clone_url: 'u', ssh_url: 's', private: false, archived: false, stargazers_count: 1, language: null, updated_at: new Date().toISOString(), owner: { login: 'o' } },
      { totally: 'bogus' },
      { id: 'not-a-number', name: 42 },
    ]))
    const repos = await fetchRepositories('o', config)
    expect(repos).toHaveLength(1)
    expect(repos[0]?.name).toBe('good')
  })
})

describe('fetchAllRepositories', () => {
  it('collects per-org failures without aborting', async () => {
    vi.mocked(fetch).mockImplementation((url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('/orgs/bad-org/')) return mockResponse(404, { message: 'Not Found' })
      return mockResponse(200, [])
    })
    const { repos, failures } = await fetchAllRepositories(
      [
        { id: 1, login: 'good-org', name: 'g', description: null, avatarUrl: '' },
        { id: 2, login: 'bad-org', name: 'b', description: null, avatarUrl: '' },
      ],
      config,
    )
    expect(repos).toEqual([])
    expect(failures).toHaveLength(1)
    expect(failures[0]?.org).toBe('bad-org')
  })
})
