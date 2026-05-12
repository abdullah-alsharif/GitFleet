import { Box, Text, useInput } from 'ink'
import { theme } from '../../theme.js'
import { GITHUB_TOKEN_URL, APP_DISPLAY_NAME } from '../../constants.js'

interface TokenErrorScreenProps {
  error: string
  missing: boolean
  onExit: () => void
}

export function TokenErrorScreen({ error, missing, onExit }: TokenErrorScreenProps) {
  const title = missing ? 'Token Not Found' : 'Token Invalid'
  const icon = missing ? theme.icons.warning : theme.icons.error

  useInput(
    (input, key) => {
      if (key.return || key.escape || (key.ctrl && input === 'c')) {
        onExit()
      }
    },
    { isActive: true },
  )

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={2} paddingX={2}>
      <Box
        borderStyle="double"
        borderColor={missing ? theme.colors.warning : theme.colors.error}
        paddingX={3}
        paddingY={1}
        marginBottom={1}
      >
        <Text bold color={missing ? theme.colors.warning : theme.colors.error}>
          {icon} {title}
        </Text>
      </Box>

      <Box marginBottom={1} width={62}>
        <Text color={theme.colors.text}>
          {APP_DISPLAY_NAME} requires a GitHub token to read organizations and clone repositories.
        </Text>
      </Box>

      <Box borderStyle="round" borderColor={theme.colors.border} paddingX={2} paddingY={1} marginBottom={1} width={62} flexDirection="column">
        <Text bold color={theme.colors.error}>Error:</Text>
        <Text color={theme.colors.textDim}>{error}</Text>
      </Box>

      <Box borderStyle="round" borderColor={theme.colors.secondary} paddingX={2} paddingY={1} marginBottom={1} width={62} flexDirection="column">
        <Text bold color={theme.colors.secondary}>Token scopes:</Text>
        <Text color={theme.colors.textDim}> {theme.icons.bullet} Classic: read:org + repo</Text>
        <Text color={theme.colors.textDim}> {theme.icons.bullet} Fine-grained: Contents (read) + Members (read)</Text>
      </Box>

      <Box borderStyle="round" borderColor={theme.colors.info} paddingX={2} paddingY={1} marginBottom={1} width={62} flexDirection="column">
        <Text bold color={theme.colors.info}>Create a token:</Text>
        <Text color={theme.colors.textDim}> {GITHUB_TOKEN_URL}</Text>
      </Box>

      <Box borderStyle="round" borderColor={theme.colors.border} paddingX={2} paddingY={1} marginBottom={1} width={62} flexDirection="column">
        <Text bold color={theme.colors.primary}>Quick Setup:</Text>
        <Text color={theme.colors.textDim}> $ export GITHUB_TOKEN="&lt;token&gt;"</Text>
        <Text color={theme.colors.textDim}> $ gitfleet --token &lt;token&gt;</Text>
        <Text color={theme.colors.textDim}> $ echo 'GITHUB_TOKEN="&lt;token&gt;"' &gt; ~/.config/gitfleet/.env</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.colors.muted}>Press Enter to exit, configure your token, and run again.</Text>
      </Box>
    </Box>
  )
}
