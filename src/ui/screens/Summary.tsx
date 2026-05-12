import { Box, Text, useInput } from 'ink'
import { useState } from 'react'
import { theme } from '../../theme.js'
import { StepsHeader } from '../components/StepsHeader.js'
import { formatDuration } from '../../utils/format.js'
import type { CloneResult, Protocol } from '../../types.js'

interface SummaryScreenProps {
  results: CloneResult[]
  totalDurationMs: number
  workspaceDir: string
  protocol: Protocol
  concurrency: number
  onExit: () => void
  onRetryFailed: () => void
}

type SummaryTab = 'overview' | 'details' | 'errors'

export function SummaryScreen({
  results,
  totalDurationMs,
  workspaceDir,
  protocol,
  concurrency,
  onExit,
  onRetryFailed,
}: SummaryScreenProps) {
  const [tab, setTab] = useState<SummaryTab>('overview')

  const cloned = results.filter(r => r.status === 'cloned')
  const updated = results.filter(r => r.status === 'updated')
  const skipped = results.filter(r => r.status === 'skipped')
  const failed = results.filter(r => r.status === 'failed')
  const hasFailures = failed.length > 0

  const orgs = new Map<string, { cloned: number; updated: number; skipped: number; failed: number }>()
  for (const r of results) {
    if (!orgs.has(r.org)) {
      orgs.set(r.org, { cloned: 0, updated: 0, skipped: 0, failed: 0 })
    }
    const org = orgs.get(r.org)
    if (!org) continue
    if (r.status === 'cloned') org.cloned++
    else if (r.status === 'updated') org.updated++
    else if (r.status === 'skipped') org.skipped++
    else if (r.status === 'failed') org.failed++
  }

  const failuresByKind = new Map<string, number>()
  for (const f of failed) {
    failuresByKind.set(f.kind ?? 'unknown', (failuresByKind.get(f.kind ?? 'unknown') ?? 0) + 1)
  }

  useInput((input, key) => {
    if (key.return || key.escape) {
      onExit()
      return
    }
    if (input === '1') setTab('overview')
    if (input === '2') setTab('details')
    if (input === '3') setTab('errors')
    if ((input === 'r' || input === 'R') && hasFailures) onRetryFailed()
  }, { isActive: true })

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <StepsHeader steps={['Organizations', 'Repositories', 'Confirm', 'Clone', 'Done']} current={4} />

      <Box marginBottom={1}>
        <Text bold color={hasFailures ? theme.colors.warning : theme.colors.success}>
          {hasFailures ? `${theme.icons.warning} Clone finished with failures` : `${theme.icons.success} Clone Complete`}
        </Text>
      </Box>

      <Box borderStyle="round" borderColor={theme.colors.border} paddingX={1} paddingY={1} flexDirection="column" marginBottom={1}>
        <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
          <Box flexDirection="column" alignItems="center" paddingX={1}>
            <Text bold color={theme.colors.success}>{cloned.length}</Text>
            <Text color={theme.colors.success}>Cloned</Text>
          </Box>
          <Box flexDirection="column" alignItems="center" paddingX={1}>
            <Text bold color={theme.colors.info}>{updated.length}</Text>
            <Text color={theme.colors.info}>Updated</Text>
          </Box>
          <Box flexDirection="column" alignItems="center" paddingX={1}>
            <Text bold color={theme.colors.warning}>{skipped.length}</Text>
            <Text color={theme.colors.warning}>Skipped</Text>
          </Box>
          <Box flexDirection="column" alignItems="center" paddingX={1}>
            <Text bold color={hasFailures ? theme.colors.error : theme.colors.muted}>{failed.length}</Text>
            <Text color={hasFailures ? theme.colors.error : theme.colors.muted}>Failed</Text>
          </Box>
          <Box flexDirection="column" alignItems="center" paddingX={1}>
            <Text bold color={theme.colors.text}>{results.length}</Text>
            <Text color={theme.colors.muted}>Total</Text>
          </Box>
        </Box>
        <Box justifyContent="center" marginTop={1}>
          <Text color={theme.colors.muted}>
            Duration: {formatDuration(totalDurationMs)} {theme.icons.bullet} {workspaceDir} {theme.icons.bullet}{' '}
            {protocol} {theme.icons.bullet} concurrency {concurrency}
          </Text>
        </Box>
      </Box>

      <Box marginBottom={1} flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Text color={tab === 'overview' ? theme.colors.primary : theme.colors.muted} bold={tab === 'overview'}>
          [1] Overview
        </Text>
        <Text color={tab === 'details' ? theme.colors.primary : theme.colors.muted} bold={tab === 'details'}>
          [2] Details
        </Text>
        <Text color={tab === 'errors' ? theme.colors.primary : theme.colors.muted} bold={tab === 'errors'}>
          [3] Errors{hasFailures ? ` (${failed.length})` : ''}
        </Text>
        {hasFailures && <Text color={theme.colors.warning}>[R] Retry failed</Text>}
      </Box>

      <Box borderStyle="round" borderColor={theme.colors.border} paddingX={1} paddingY={1} minHeight={8} flexDirection="column">
        {tab === 'overview' && (
          <Box flexDirection="column">
            {orgs.size === 0 && <Text color={theme.colors.muted}>No organizations processed</Text>}
            {Array.from(orgs.entries()).map(([org, counts]) => (
              <Box key={org} justifyContent="space-between" paddingX={1}>
                <Box>
                  <Text color={theme.colors.textDim}>{theme.icons.folder} </Text>
                  <Text bold color={theme.colors.text}>{org}</Text>
                </Box>
                <Box>
                  {counts.cloned > 0 && <Text color={theme.colors.success}>+{counts.cloned} </Text>}
                  {counts.updated > 0 && <Text color={theme.colors.info}>~{counts.updated} </Text>}
                  {counts.skipped > 0 && <Text color={theme.colors.warning}>={counts.skipped} </Text>}
                  {counts.failed > 0 && <Text color={theme.colors.error}>-{counts.failed} </Text>}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {tab === 'details' && (
          <Box flexDirection="column">
            {cloned.length === 0 && updated.length === 0 && skipped.length === 0 && (
              <Text color={theme.colors.muted}>No repositories processed</Text>
            )}
            {[...cloned, ...updated, ...skipped].slice(0, 15).map(r => (
              <Box key={r.fullName}>
                <Text
                  color={
                    r.status === 'cloned'
                      ? theme.colors.success
                      : r.status === 'updated'
                        ? theme.colors.info
                        : theme.colors.warning
                  }
                >
                  {r.status === 'cloned' ? theme.icons.success : r.status === 'updated' ? theme.icons.retry : theme.icons.skipped}
                </Text>
                <Text color={theme.colors.textDim}>
                  {' '}{r.org}/{r.name}
                </Text>
                {r.note && <Text color={theme.colors.muted}> ({r.note})</Text>}
                {r.durationMs != null && r.durationMs >= 1000 && (
                  <Text color={theme.colors.muted}> ({formatDuration(r.durationMs)})</Text>
                )}
              </Box>
            ))}
          </Box>
        )}

        {tab === 'errors' && (
          <Box flexDirection="column">
            {failed.length === 0 ? (
              <Box justifyContent="center" paddingY={2}>
                <Text color={theme.colors.success}>
                  {theme.icons.success} No errors — all repositories processed successfully!
                </Text>
              </Box>
            ) : (
              <>
                {failuresByKind.size > 0 && (
                  <Box marginBottom={1} flexDirection="row" flexWrap="wrap" columnGap={2}>
                    {Array.from(failuresByKind.entries()).map(([kind, count]) => (
                      <Text key={kind} color={theme.colors.errorDim}>
                        {kind}: {count}
                      </Text>
                    ))}
                  </Box>
                )}
                {failed.slice(0, 10).map(r => (
                  <Box key={r.fullName} flexDirection="column" marginBottom={1}>
                    <Box>
                      <Text color={theme.colors.error}>{theme.icons.error}</Text>
                      <Text color={theme.colors.text}>
                        {' '}{r.org}/{r.name}
                      </Text>
                      {r.kind && <Text color={theme.colors.muted}> [{r.kind}]</Text>}
                    </Box>
                    <Box paddingX={2}>
                      <Text color={theme.colors.errorDim}>{r.error}</Text>
                    </Box>
                  </Box>
                ))}
              </>
            )}
          </Box>
        )}
      </Box>

      <Box marginTop={1} justifyContent="center">
        <Text color={theme.colors.muted}>
          {hasFailures ? 'Press R to retry failures, Enter to exit' : 'Press Enter or Esc to exit'}
        </Text>
      </Box>
    </Box>
  )
}
