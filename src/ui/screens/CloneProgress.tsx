import { Box, Text, useWindowSize } from 'ink'
import { useState, useEffect, useRef } from 'react'
import { theme } from '../../theme.js'
import { StepsHeader } from '../components/StepsHeader.js'
import { Footer, cloneShortcuts } from '../components/Footer.js'
import { formatDuration, formatTime, truncate } from '../../utils/format.js'
import type { CloneResult } from '../../types.js'

interface CloneProgressScreenProps {
  results: CloneResult[]
  total: number
  elapsed: number
  onComplete?: () => void
}

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function statusCell(status: string): { icon: string; color: string | undefined } {
  switch (status) {
    case 'cloned':
      return { icon: theme.icons.success, color: theme.colors.success }
    case 'updated':
      return { icon: theme.icons.retry, color: theme.colors.info }
    case 'skipped':
      return { icon: theme.icons.skipped, color: theme.colors.warning }
    case 'failed':
      return { icon: theme.icons.error, color: theme.colors.error }
    case 'cloning':
      return { icon: theme.icons.cloning, color: theme.colors.info }
    default:
      return { icon: theme.icons.queued, color: theme.colors.muted }
  }
}

export function CloneProgressScreen({ results, total, elapsed, onComplete }: CloneProgressScreenProps) {
  const [spinnerFrame, setSpinnerFrame] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const doneRef = useRef(false)
  const { columns } = useWindowSize()

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSpinnerFrame(prev => (prev + 1) % spinnerFrames.length)
    }, 120)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const completed = results.filter(
    r => r.status === 'cloned' || r.status === 'updated' || r.status === 'skipped' || r.status === 'failed',
  ).length
  const cloned = results.filter(r => r.status === 'cloned').length
  const updated = results.filter(r => r.status === 'updated').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const failed = results.filter(r => r.status === 'failed').length
  const queued = Math.max(0, total - completed)
  const progress = total > 0 ? completed / total : 0
  const isComplete = completed >= total && total > 0

  useEffect(() => {
    if (isComplete && !doneRef.current) {
      doneRef.current = true
      const timer = setTimeout(() => onComplete?.(), 600)
      return () => clearTimeout(timer)
    }
  }, [isComplete, onComplete])

  // Adaptive bar: leave room for brackets, percentage and counters.
  const barWidth = Math.max(10, Math.min(50, columns - 30))
  const filledWidth = Math.round(barWidth * progress)
  const emptyWidth = barWidth - filledWidth

  const recentResults = results.slice(-8).reverse()
  const nameWidth = Math.max(20, Math.min(60, columns - 24))

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <StepsHeader steps={['Organizations', 'Repositories', 'Confirm', 'Clone', 'Done']} current={3} />

      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={theme.colors.primary}>
          {theme.icons.folder} Cloning Repositories
        </Text>
        <Text color={theme.colors.muted}>
          {theme.icons.clock} {formatTime(elapsed)}
        </Text>
      </Box>

      <Box borderStyle="round" borderColor={theme.colors.border} paddingX={1} paddingY={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text>[</Text>
          <Text color={theme.colors.success}>{theme.icons.block.repeat(filledWidth)}</Text>
          <Text color={theme.colors.mutedDim}>{theme.icons.separator.repeat(emptyWidth)}</Text>
          <Text>] {Math.round(progress * 100)}%</Text>
        </Box>

        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Text color={theme.colors.success}>
            {theme.icons.success} {cloned} cloned
          </Text>
          <Text color={theme.colors.info}>
            {theme.icons.retry} {updated} updated
          </Text>
          <Text color={theme.colors.warning}>
            {theme.icons.skipped} {skipped} skipped
          </Text>
          {failed > 0 && (
            <Text color={theme.colors.error}>
              {theme.icons.error} {failed} failed
            </Text>
          )}
          {queued > 0 && (
            <Text color={theme.colors.muted}>
              {theme.icons.queued} {queued} queued
            </Text>
          )}
          <Text color={theme.colors.muted}>
            {completed}/{total}
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1} minHeight={8}>
        <Box borderStyle="round" borderColor={theme.colors.border} paddingX={1} flexDirection="column">
          {recentResults.length === 0 && (
            <Box paddingY={1}>
              <Text color={theme.colors.muted}>
                {theme.asciiOnly ? '*' : spinnerFrames[spinnerFrame]} Initializing clone queue...
              </Text>
            </Box>
          )}

          {recentResults.map(result => {
            const { icon, color } = statusCell(result.status)
            const retried = (result.attempts ?? 1) > 1
            return (
              <Box key={result.fullName} height={1}>
                <Text color={color}>{result.status === 'cloning' && !theme.asciiOnly ? spinnerFrames[spinnerFrame] : icon}</Text>
                <Text color={theme.colors.textDim}> {truncate(`${result.org}/${result.name}`, nameWidth)}</Text>
                {retried && <Text color={theme.colors.info}> {theme.icons.retry}x{result.attempts}</Text>}
                {result.durationMs != null && result.durationMs >= 1000 && (
                  <Text color={theme.colors.muted}> ({formatDuration(result.durationMs)})</Text>
                )}
                {result.status === 'failed' && result.error && (
                  <Text color={theme.colors.errorDim}> {truncate(result.error, Math.max(20, columns - nameWidth - 30))}</Text>
                )}
              </Box>
            )
          })}
        </Box>
      </Box>

      <Box marginTop={1} justifyContent="space-between">
        <Text color={theme.colors.textDim}>Queue: {queued} remaining</Text>
        {isComplete && (
          <Text bold color={theme.colors.success}>
            Complete! {theme.icons.success}
          </Text>
        )}
      </Box>

      <Footer shortcuts={cloneShortcuts} />
    </Box>
  )
}
