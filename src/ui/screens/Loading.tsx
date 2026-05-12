import { Box, Text } from 'ink'
import { useEffect, useState, useRef } from 'react'
import { theme } from '../../theme.js'
import { APP_DISPLAY_NAME, APP_TAGLINE } from '../../constants.js'

interface LoadingScreenProps {
  message: string
  subMessage?: string
}

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function LoadingScreen({ message, subMessage }: LoadingScreenProps) {
  const [frame, setFrame] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setFrame(prev => (prev + 1) % spinnerFrames.length)
    }, 80)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={2}>
      <Box
        borderStyle={theme.asciiOnly ? undefined : 'round'}
        borderColor={theme.colors.border}
        paddingX={4}
        paddingY={1}
        flexDirection="column"
        alignItems="center"
        marginBottom={2}
      >
        <Text bold color={theme.colors.primary}>
          {theme.asciiOnly ? '>' : theme.icons.selected} {APP_DISPLAY_NAME}
        </Text>
        <Text color={theme.colors.mutedDim}>{APP_TAGLINE}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.colors.primary}>{theme.asciiOnly ? '*' : spinnerFrames[frame]}</Text>
        <Text> {message}</Text>
      </Box>

      {subMessage && (
        <Box marginTop={1}>
          <Text color={theme.colors.mutedDim}>{subMessage}</Text>
        </Box>
      )}
    </Box>
  )
}
