import type { ThemeMode } from './types.js'

/**
 * Terminal theme handling. A terminal is not a browser: there is no reliable
 * universal light/dark signal, so `auto` resolves to `safe` (readable on both
 * backgrounds) unless the terminal explicitly reports light (COLORFGBG) or the
 * user forces a mode. Statuses always pair color with a symbol/text, and icons
 * fall back to ASCII on dumb terminals.
 */

export interface ThemeColors {
  primary: string
  primaryDim: string
  secondary: string
  success: string
  warning: string
  error: string
  errorDim: string
  info: string
  /** Undefined = terminal default (adapts to any background). */
  muted: string | undefined
  mutedDim: string | undefined
  text: string | undefined
  textDim: string | undefined
  surface: string
  surfaceLight: string
  highlight: string
  selected: string
  border: string
}

export interface ThemeIcons {
  checkboxChecked: string
  checkboxUnchecked: string
  selected: string
  success: string
  error: string
  warning: string
  info: string
  star: string
  folder: string
  search: string
  clock: string
  bullet: string
  separator: string
  block: string
  retry: string
  skipped: string
  queued: string
  cloning: string
}

export interface Theme {
  colors: ThemeColors
  icons: ThemeIcons
  colorEnabled: boolean
  light: boolean
  asciiOnly: boolean
}

export function resolveThemeMode(requested: ThemeMode): 'dark' | 'light' {
  return resolveThemeVariant(requested) === 'light' ? 'light' : 'dark'
}

type ThemeVariant = 'dark' | 'light' | 'safe'

/**
 * `safe` = background unknown: dark surfaces with deeper accents readable on
 * both dark and light backgrounds. Used when `auto` has no confident signal.
 */
export function resolveThemeVariant(requested: ThemeMode): ThemeVariant {
  if (requested === 'dark') return 'dark'
  if (requested === 'light') return 'light'
  const override = process.env.GITFLEET_THEME?.toLowerCase()
  if (override === 'light') return 'light'
  if (override === 'dark') return 'dark'
  const colorfg = process.env.COLORFGBG
  if (colorfg) {
    const parts = colorfg.split(';').map(Number)
    const bg = parts[parts.length - 1]
    if (Number.isFinite(bg)) return (bg as number) >= 7 ? 'light' : 'dark'
  }
  return 'safe'
}

export function isColorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false
  if (process.env.TERM === 'dumb') return false
  if (process.env.GITFLEET_NO_COLOR === '1') return false
  // Non-TTY output (pipes, CI logs) gets plain text.
  if (!process.stdout.isTTY) return false
  return true
}

export function isAsciiOnly(): boolean {
  if (process.env.GITFLEET_ASCII === '1') return true
  if (process.env.TERM === 'dumb') return true
  return false
}

const UNICODE_ICONS: ThemeIcons = {
  checkboxChecked: '■',
  checkboxUnchecked: '□',
  selected: '◆',
  success: '✓',
  error: '✗',
  warning: '!',
  info: 'i',
  star: '★',
  folder: '▸',
  search: '⌕',
  clock: '◷',
  bullet: '•',
  separator: '─',
  block: '█',
  retry: '↻',
  skipped: '⊘',
  queued: '○',
  cloning: '⋯',
}

const ASCII_ICONS: ThemeIcons = {
  checkboxChecked: '[x]',
  checkboxUnchecked: '[ ]',
  selected: '>',
  success: 'ok',
  error: 'FAIL',
  warning: '!',
  info: 'i',
  star: '*',
  folder: '>',
  search: '/',
  clock: '@',
  bullet: '-',
  separator: '-',
  block: '#',
  retry: '~',
  skipped: '-',
  queued: 'o',
  cloning: '...',
}

const DARK_COLORS: ThemeColors = {
  primary: '#00D4AA',
  primaryDim: '#009977',
  secondary: '#8B85FF',
  success: '#00E676',
  warning: '#FFD54F',
  error: '#FF5252',
  errorDim: '#E57373',
  info: '#40C4FF',
  muted: undefined,
  mutedDim: undefined,
  text: undefined,
  textDim: undefined,
  surface: '#1E1E2E',
  surfaceLight: '#2A2A3E',
  highlight: '#FFFFFF',
  selected: '#00D4AA',
  border: '#3A3A4E',
}

const LIGHT_COLORS: ThemeColors = {
  primary: '#00755E',
  primaryDim: '#005A48',
  secondary: '#4F46E5',
  success: '#007E33',
  warning: '#8A6100',
  error: '#C62828',
  errorDim: '#B71C1C',
  info: '#0277BD',
  muted: undefined,
  mutedDim: undefined,
  text: undefined,
  textDim: undefined,
  surface: '#F5F5F5',
  surfaceLight: '#E0E0E0',
  highlight: '#1A1A2E',
  selected: '#00755E',
  border: '#BDBDBD',
}

/**
 * Contrast-safe fallback: dark structural surfaces with the deeper light
 * accents, readable on dark and light backgrounds.
 */
const SAFE_COLORS: ThemeColors = {
  ...DARK_COLORS,
  primary: LIGHT_COLORS.primary,
  primaryDim: LIGHT_COLORS.primaryDim,
  secondary: LIGHT_COLORS.secondary,
  success: LIGHT_COLORS.success,
  warning: LIGHT_COLORS.warning,
  error: LIGHT_COLORS.error,
  errorDim: LIGHT_COLORS.errorDim,
  info: LIGHT_COLORS.info,
  selected: LIGHT_COLORS.selected,
}

export function createTheme(mode: ThemeMode = 'auto'): Theme {
  const variant = resolveThemeVariant(mode)
  return {
    colors: variant === 'light' ? LIGHT_COLORS : variant === 'dark' ? DARK_COLORS : SAFE_COLORS,
    icons: isAsciiOnly() ? ASCII_ICONS : UNICODE_ICONS,
    colorEnabled: isColorEnabled(),
    light: variant === 'light',
    asciiOnly: isAsciiOnly(),
  }
}

/** Process-wide theme singleton, evaluated once at startup. */
export const theme: Theme = createTheme(
  (process.env.GITFLEET_THEME as ThemeMode | undefined) ?? 'auto',
)
