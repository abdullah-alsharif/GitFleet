import { describe, it, expect } from 'vitest'
import { fuzzyScore, fuzzyFilter } from '../fuzzy.js'

describe('fuzzyScore', () => {
  it('returns 1 for exact match', () => expect(fuzzyScore('hello', 'hello')).toBe(1))
  it('returns 0.9 for prefix match', () => expect(fuzzyScore('hel', 'hello')).toBe(0.9))
  it('returns 0.7 for substring match', () => expect(fuzzyScore('ell', 'hello')).toBe(0.7))
  it('returns 0 for no match', () => expect(fuzzyScore('xyz', 'hello')).toBe(0))
  it('returns 1 for empty query', () => expect(fuzzyScore('', 'hello')).toBe(1))
  it('returns 0 for empty target', () => expect(fuzzyScore('a', '')).toBe(0))
  it('scores fuzzy match > 0', () => {
    const score = fuzzyScore('hlo', 'hello')
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(0.7)
  })
  it('is case insensitive', () => expect(fuzzyScore('HELLO', 'hello')).toBe(1))
})

describe('fuzzyFilter', () => {
  const items = [{ name: 'react' }, { name: 'redux' }, { name: 'vue' }, { name: 'angular' }]

  it('returns all items for empty query', () => {
    expect(fuzzyFilter(items, '', i => i.name)).toHaveLength(4)
  })

  it('filters by score threshold', () => {
    const result = fuzzyFilter(items, 're', i => i.name)
    expect(result.length).toBeLessThan(4)
    expect(result.every(i => i.name.startsWith('re') || i.name.includes('re'))).toBe(true)
  })

  it('returns empty for no match', () => {
    expect(fuzzyFilter(items, 'xyz', i => i.name)).toHaveLength(0)
  })

  it('sorts by descending score', () => {
    const result = fuzzyFilter(items, 're', i => i.name)
    expect(result[0]?.name).toBe('react')
  })
})
