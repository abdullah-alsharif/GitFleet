import { describe, it, expect, beforeEach } from 'vitest'
import { Cache, cacheKey } from '../cache.js'

describe('Cache', () => {
  let cache: Cache

  beforeEach(() => { cache = new Cache() })

  it('stores and retrieves values', () => {
    cache.set('key1', { data: 42 })
    expect(cache.get('key1')).toEqual({ data: 42 })
  })

  it('returns null for missing keys', () => {
    expect(cache.get('nonexistent')).toBeNull()
  })

  it('respects TTL', async () => {
    cache.set('ephemeral', 'value', 50)
    expect(cache.get('ephemeral')).toBe('value')
    await new Promise(r => setTimeout(r, 60))
    expect(cache.get('ephemeral')).toBeNull()
  })

  it('reports has correctly', () => {
    cache.set('a', 1)
    expect(cache.has('a')).toBe(true)
    expect(cache.has('b')).toBe(false)
  })

  it('deletes keys', () => {
    cache.set('x', 1)
    cache.delete('x')
    expect(cache.get('x')).toBeNull()
  })

  it('clears all entries', () => {
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    expect(cache.size).toBe(0)
  })

  it('tracks size', () => {
    expect(cache.size).toBe(0)
    cache.set('a', 1)
    expect(cache.size).toBe(1)
    cache.set('b', 2)
    expect(cache.size).toBe(2)
  })

  it('expired entries are removed from size', async () => {
    cache.set('a', 1, 50)
    expect(cache.size).toBe(1)
    await new Promise(r => setTimeout(r, 60))
    expect(cache.get('a')).toBeNull()
    expect(cache.size).toBe(0)
  })
})

describe('cacheKey', () => {
  it('joins parts with colon', () => expect(cacheKey('repos', 'org1', 'abc')).toBe('repos:org1:abc'))
  it('works with single part', () => expect(cacheKey('orgs')).toBe('orgs'))
})
