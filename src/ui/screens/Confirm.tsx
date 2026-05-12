import { Box, Text, useInput } from 'ink'
import { theme } from '../../theme.js'
import { StepsHeader } from '../components/StepsHeader.js'
import { Footer } from '../components/Footer.js'
import type { Protocol } from '../../types.js'

interface ConfirmScreenProps {
  repoCount: number
  orgCount: number
  workspaceDir: string
  protocol: Protocol
  concurrency: number
  maxRetries: number
  onStart: () => void
  onBack: () => void
}

export function ConfirmScreen({
  repoCount,
  orgCount,
  workspaceDir,
  protocol,
  concurrency,
  maxRetries,
  onStart,
  onBack,
}: ConfirmScreenProps) {
  useInput((input, key) => {
    if (key.return) {
      onStart()
      return
    }
    if (key.escape) {
      onBack()
    }
  })

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <StepsHeader steps={['Organizations', 'Repositories', 'Confirm', 'Clone', 'Done']} current={2} />

      <Box marginBottom={1}>
        <Text bold color={theme.colors.primary}>
          {theme.icons.info} Ready to clone
        </Text>
      </Box>

      <Box borderStyle="round" borderColor={theme.colors.border} paddingX={2} paddingY={1} marginBottom={1} flexDirection="column">
        <Box justifyContent="space-between">
          <Text color={theme.colors.mutedDim}>Repositories</Text>
          <Text bold color={theme.colors.text}>
            {repoCount} across {orgCount} org{orgCount === 1 ? '' : 's'}
          </Text>
        </Box>
        <Box justifyContent="space-between">
          <Text color={theme.colors.mutedDim}>Workspace</Text>
          <Text color={theme.colors.info}>{workspaceDir}</Text>
        </Box>
        <Box justifyContent="space-between">
          <Text color={theme.colors.mutedDim}>Protocol</Text>
          <Text color={theme.colors.text}>{protocol}</Text>
        </Box>
        <Box justifyContent="space-between">
          <Text color={theme.colors.mutedDim}>Concurrency</Text>
          <Text color={theme.colors.text}>{concurrency}</Text>
        </Box>
        <Box justifyContent="space-between">
          <Text color={theme.colors.mutedDim}>Retries</Text>
          <Text color={theme.colors.text}>{maxRetries}</Text>
        </Box>
      </Box>

      <Box marginBottom={1}>
        <Text color={theme.colors.mutedDim}>
          Existing checkouts are fast-forward pulled; repos with local changes are left untouched.
        </Text>
      </Box>

      <Footer
        shortcuts={[
          { keys: 'Enter', action: 'Start cloning' },
          { keys: 'Esc', action: 'Back' },
        ]}
      />
    </Box>
  )
}
