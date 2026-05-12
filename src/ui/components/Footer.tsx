import { Box, Text } from 'ink'
import { theme } from '../../theme.js'

export interface Shortcut {
  keys: string
  action: string
}

interface FooterProps {
  shortcuts: Shortcut[]
  leftText?: string
  rightText?: string
}

/** Wraps on narrow terminals instead of clipping. */
export function Footer({ shortcuts, leftText, rightText }: FooterProps) {
  return (
    <Box
      borderStyle="single"
      borderColor={theme.colors.border}
      paddingX={1}
      marginTop={1}
      flexDirection="column"
    >
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {shortcuts.map(s => (
          <Box key={`${s.keys}-${s.action}`}>
            <Text color={theme.colors.primaryDim}>{s.keys}</Text>
            <Text color={theme.colors.muted}> </Text>
            <Text color={theme.colors.textDim}>{s.action}</Text>
          </Box>
        ))}
        {rightText && <Text color={theme.colors.muted}>{rightText}</Text>}
      </Box>
      {leftText && <Text color={theme.colors.mutedDim}>{leftText}</Text>}
    </Box>
  )
}

export const selectionShortcuts: Shortcut[] = [
  { keys: '↑↓/jk', action: 'Navigate' },
  { keys: 'Space', action: 'Toggle' },
  { keys: 'Tab', action: 'Confirm' },
  { keys: '/', action: 'Search' },
  { keys: 'A', action: 'All' },
  { keys: 'Esc', action: 'Back' },
]

export const repoShortcuts: Shortcut[] = [
  { keys: '↑↓/jk', action: 'Navigate' },
  { keys: 'Space', action: 'Toggle' },
  { keys: 'Tab', action: 'Clone' },
  { keys: '/', action: 'Search' },
  { keys: 'A', action: 'All' },
  { keys: 'S', action: 'Sort' },
  { keys: 'H', action: 'Archived' },
  { keys: 'Esc', action: 'Back' },
]

export const cloneShortcuts: Shortcut[] = [{ keys: 'Ctrl+C', action: 'Cancel' }]
