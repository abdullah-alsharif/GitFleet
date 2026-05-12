import { describe, it, expect } from 'vitest'
import {
  formatCount, formatStars, formatDate, formatDuration,
  truncate, formatTime,
} from '../format.js'

describe('formatCount', () => {
  it('formats numbers below 1000', () => { expect(formatCount(0)).toBe('0'); expect(formatCount(999)).toBe('999') })
  it('formats thousands', () => { expect(formatCount(1000)).toBe('1.0k'); expect(formatCount(1500)).toBe('1.5k') })
  it('formats millions', () => { expect(formatCount(1_000_000)).toBe('1.0M'); expect(formatCount(2_500_000)).toBe('2.5M') })
})

describe('formatStars', () => {
  it('returns 0 for zero', () => expect(formatStars(0)).toBe('0'))
  it('formats non-zero', () => expect(formatStars(1234)).toBe('1.2k'))
})

describe('formatDate', () => {
  it('returns today', () => expect(formatDate(new Date().toISOString())).toBe('today'))
  it('returns yesterday', () => {
    const d = new Date(Date.now() - 86400000)
    expect(formatDate(d.toISOString())).toBe('yesterday')
  })
  it('returns days ago', () => {
    const d = new Date(Date.now() - 5 * 86400000)
    expect(formatDate(d.toISOString())).toBe('5d ago')
  })
  it('returns months ago', () => {
    const d = new Date(Date.now() - 60 * 86400000)
    expect(formatDate(d.toISOString())).toBe('2mo ago')
  })
  it('returns years ago', () => {
    const d = new Date(Date.now() - 400 * 86400000)
    expect(formatDate(d.toISOString())).toBe('1y ago')
  })
})

describe('formatDuration', () => {
  it('formats seconds', () => expect(formatDuration(3000)).toBe('3s'))
  it('formats minutes and seconds', () => expect(formatDuration(125000)).toBe('2m 5s'))
  it('formats hours', () => expect(formatDuration(3661000)).toBe('1h 1m 1s'))
})

describe('truncate', () => {
  it('returns short strings as-is', () => expect(truncate('hello', 10)).toBe('hello'))
  it('truncates long strings', () => expect(truncate('hello world', 8)).toBe('hello w…'))
})

describe('formatTime', () => {
  it('formats seconds to MM:SS', () => expect(formatTime(65)).toBe('01:05'))
  it('handles zero', () => expect(formatTime(0)).toBe('00:00'))
  it('handles large values', () => expect(formatTime(3661)).toBe('61:01'))
})
