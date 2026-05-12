import { describe, it, expect, vi, afterEach } from 'vitest'
import { createTheme, resolveThemeMode, resolveThemeVariant, isColorEnabled, isAsciiOnly } from '../theme.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveThemeMode', () => {
  it('honors explicit dark/light', () => {
    expect(resolveThemeMode('dark')).toBe('dark')
    expect(resolveThemeMode('light')).toBe('light')
  })

  it('defaults to dark (conservative auto)', () => {
    vi.stubEnv('COLORFGBG', '')
    vi.stubEnv('GITFLEET_THEME', '')
    expect(resolveThemeMode('auto')).toBe('dark')
  })

  it('uses the contrast-safe variant when the background is unknown', () => {
    vi.stubEnv('COLORFGBG', '')
    vi.stubEnv('GITFLEET_THEME', '')
    expect(resolveThemeVariant('auto')).toBe('safe')
    const t = createTheme('auto')
    expect(t.light).toBe(false)
    expect(t.colors.primary).toBe(createTheme('light').colors.primary)
  })

  it('detects light background from COLORFGBG', () => {
    vi.stubEnv('COLORFGBG', '0;15')
    expect(resolveThemeMode('auto')).toBe('light')
    vi.stubEnv('COLORFGBG', '15;0')
    expect(resolveThemeMode('auto')).toBe('dark')
  })

  it('lets GITFLEET_THEME override heuristics', () => {
    vi.stubEnv('COLORFGBG', '0;15')
    vi.stubEnv('GITFLEET_THEME', 'dark')
    expect(resolveThemeMode('auto')).toBe('dark')
  })
})

describe('isColorEnabled', () => {
  it('is disabled with NO_COLOR', () => {
    vi.stubEnv('NO_COLOR', '1')
    expect(isColorEnabled()).toBe(false)
  })

  it('is disabled for dumb terminals', () => {
    vi.stubEnv('NO_COLOR', '')
    vi.stubEnv('TERM', 'dumb')
    expect(isColorEnabled()).toBe(false)
  })
})

describe('isAsciiOnly', () => {
  it('is enabled via GITFLEET_ASCII or dumb TERM', () => {
    vi.stubEnv('TERM', 'dumb')
    expect(isAsciiOnly()).toBe(true)
  })
})

describe('createTheme', () => {
  it('returns semantic tokens and icons', () => {
    const t = createTheme('dark')
    expect(t.colors.primary).toMatch(/^#/)
    expect(t.icons.success).toBeTruthy()
    expect(t.light).toBe(false)
  })

  it('uses a distinct light palette', () => {
    expect(createTheme('light').colors.primary).not.toBe(createTheme('dark').colors.primary)
  })

  it('falls back to ASCII icons for dumb terminals', () => {
    vi.stubEnv('TERM', 'dumb')
    const t = createTheme('dark')
    expect(t.asciiOnly).toBe(true)
    expect(t.icons.checkboxChecked).toBe('[x]')
  })
})
