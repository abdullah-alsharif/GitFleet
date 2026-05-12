import { Box, Text, useInput, useWindowSize } from 'ink'
import { useState, useMemo, useEffect } from 'react'
import { theme } from '../../theme.js'
import { fuzzyFilter } from '../../utils/fuzzy.js'
import { Footer, repoShortcuts } from '../components/Footer.js'
import { StepsHeader } from '../components/StepsHeader.js'
import { formatStars, formatDate } from '../../utils/format.js'
import type { RepoDisplay, SortField } from '../../types.js'
import type { OrgFetchFailure } from '../../services/github.js'

interface RepoSelectScreenProps {
  repositories: RepoDisplay[]
  fetchFailures: OrgFetchFailure[]
  onConfirm: (selected: RepoDisplay[]) => void
  onBack: () => void
  loading?: boolean
  loadingMessage?: string
}

type Mode = 'navigate' | 'search'

const ALL_REPOS_VALUE = '__all__'

export function RepoSelectScreen({
  repositories,
  fetchFailures,
  onConfirm,
  onBack,
  loading = false,
  loadingMessage,
}: RepoSelectScreenProps) {
  const [mode, setMode] = useState<Mode>('navigate')
  const [searchQuery, setSearchQuery] = useState('')
  const [cursorIndex, setCursorIndex] = useState(0)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [sortField, setSortField] = useState<SortField>('updated')
  const [showArchived, setShowArchived] = useState(false)
  const [repos, setRepos] = useState<RepoDisplay[]>(repositories)
  const { rows } = useWindowSize()
  const visibleHeight = Math.max(6, Math.min(20, rows - 14))

  useEffect(() => {
    setRepos(repositories)
  }, [repositories])

  const filteredRepos = useMemo(() => {
    let result = repos
    if (!showArchived) result = result.filter(r => !r.isArchived)
    if (searchQuery.trim()) {
      result = fuzzyFilter(result, searchQuery, r => `${r.name} ${r.description || ''} ${r.language || ''}`)
    }
    return [...result].sort((a, b) => {
      switch (sortField) {
        case 'stars':
          return b.stargazerCount - a.stargazerCount
        case 'name':
          return a.name.localeCompare(b.name)
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      }
    })
  }, [repos, searchQuery, sortField, showArchived])

  const groupedRepos = useMemo(() => {
    const groups = new Map<string, typeof filteredRepos>()
    for (const repo of filteredRepos) {
      const g = groups.get(repo.organization) || []
      g.push(repo)
      groups.set(repo.organization, g)
    }
    return groups
  }, [filteredRepos])

  const allSelected = repos.length > 0 && repos.every(r => r.selected)
  const selectedCount = repos.filter(r => r.selected).length
  const totalCount = repos.length
  const archivedCount = repos.filter(r => r.isArchived).length
  const sortLabel = sortField === 'stars' ? 'Stars' : sortField === 'name' ? 'Name' : 'Updated'

  const flatItems = useMemo(() => {
    const items: Array<{
      value: string
      label: string
      selected: boolean
      metadata: string
      org: string
      isHeader?: boolean
    }> = []

    if (!searchQuery) {
      items.push({
        value: ALL_REPOS_VALUE,
        label: 'All Repositories',
        selected: allSelected,
        metadata: `(${totalCount} total)`,
        org: '',
        isHeader: false,
      })
    }

    for (const [org, orgRepos] of groupedRepos) {
      items.push({
        value: `__header_${org}`,
        label: org,
        selected: false,
        metadata: `${orgRepos.length} repos`,
        org,
        isHeader: true,
      })
      for (const repo of orgRepos) {
        const stars = formatStars(repo.stargazerCount)
        const vis = repo.isPrivate ? 'private' : 'public'
        const lang = repo.language || ''
        const archived = repo.isArchived ? ' [archived]' : ''
        items.push({
          value: repo.fullName,
          label: repo.name,
          selected: repo.selected,
          metadata: `${stars} ${theme.icons.star} ${vis} ${lang} ${formatDate(repo.updatedAt)}${archived}`,
          org: repo.organization,
        })
      }
    }
    return items
  }, [groupedRepos, allSelected, totalCount, searchQuery])

  useEffect(() => {
    if (cursorIndex >= flatItems.length) {
      setCursorIndex(Math.max(0, flatItems.length - 1))
    }
  }, [flatItems.length, cursorIndex])

  const toggleAt = (index: number) => {
    const item = flatItems[index]
    if (!item || item.isHeader) return
    if (item.value === ALL_REPOS_VALUE) {
      setRepos(prev => prev.map(r => ({ ...r, selected: !allSelected })))
    } else {
      setRepos(prev => prev.map(r => (r.fullName === item.value ? { ...r, selected: !r.selected } : r)))
    }
  }

  const move = (delta: 1 | -1) => {
    setCursorIndex(prev => {
      let next = prev + delta
      if (next < 0 || next >= flatItems.length) return prev
      if (flatItems[next]?.isHeader) {
        next += delta
        if (next < 0 || next >= flatItems.length) return prev
      }
      setScrollOffset(offset => {
        if (next < offset) return next
        if (next >= offset + visibleHeight) return next - visibleHeight + 1
        return offset
      })
      return next
    })
  }

  useInput((input, key) => {
    if (mode === 'search') {
      if (key.return) {
        setMode('navigate')
        return
      }
      if (key.escape) {
        setSearchQuery('')
        setMode('navigate')
        return
      }
      if (key.backspace || key.delete) {
        setSearchQuery(s => s.slice(0, -1))
        return
      }
      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setSearchQuery(s => s + input)
      }
      return
    }

    if (input === '/') {
      setSearchQuery('')
      setMode('search')
      return
    }
    if (key.upArrow || input === 'k') {
      move(-1)
      return
    }
    if (key.downArrow || input === 'j') {
      move(1)
      return
    }
    if (key.escape) {
      onBack()
      return
    }
    if (key.tab) {
      const selected = repos.filter(r => r.selected)
      if (selected.length > 0) onConfirm(selected)
      return
    }
    if (key.return || input === ' ') {
      toggleAt(cursorIndex)
      return
    }
    if (input === 'a' || input === 'A') {
      setRepos(prev => prev.map(r => ({ ...r, selected: !allSelected })))
      return
    }
    if (input === 's' || input === 'S') {
      const fields: SortField[] = ['updated', 'stars', 'name']
      const current = fields.indexOf(sortField)
      setSortField(fields[(current + 1) % fields.length] ?? 'updated')
      return
    }
    if (input === 'h' || input === 'H') {
      setShowArchived(prev => !prev)
    }
  })

  const visibleItems = flatItems.slice(scrollOffset, scrollOffset + visibleHeight)

  if (loading) {
    return (
      <Box flexDirection="column" alignItems="center" paddingY={4}>
        <Text color={theme.colors.primary}>{theme.asciiOnly ? '*' : '⠋'}</Text>
        <Text> {loadingMessage || 'Loading repositories...'}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <StepsHeader steps={['Organizations', 'Repositories', 'Confirm', 'Clone', 'Done']} current={1} />

      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color={theme.colors.primary}>
          {theme.icons.folder} Repositories
        </Text>
        <Box>
          <Text color={theme.colors.success}>
            {theme.icons.selected} {selectedCount}
          </Text>
          <Text color={theme.colors.muted}> / {totalCount}</Text>
        </Box>
      </Box>

      {fetchFailures.length > 0 && (
        <Box borderStyle="round" borderColor={theme.colors.warning} paddingX={1} marginBottom={1} flexDirection="column">
          <Text color={theme.colors.warning}>
            {theme.icons.warning} Skipped {fetchFailures.length} organization{fetchFailures.length === 1 ? '' : 's'} (fetch failed):
          </Text>
          {fetchFailures.slice(0, 3).map(f => (
            <Text key={f.org} color={theme.colors.muted}>
              {' '}
              {theme.icons.bullet} {f.org}: {f.error.slice(0, 100)}
            </Text>
          ))}
        </Box>
      )}

      <Box marginBottom={1} flexDirection="row">
        <Box
          borderStyle="round"
          borderColor={mode === 'search' ? theme.colors.primary : theme.colors.border}
          paddingX={1}
          flexGrow={1}
          marginRight={1}
        >
          {mode === 'search' ? (
            <Text>
              <Text color={theme.colors.primary}>{theme.icons.search} </Text>
              {searchQuery}
              <Text color={theme.colors.primary}>|</Text>
            </Text>
          ) : (
            <Text color={theme.colors.mutedDim}>{theme.icons.search} Search... (press /)</Text>
          )}
        </Box>
        <Box paddingX={1}>
          <Text color={theme.colors.secondary}>Sort: {sortLabel}</Text>
        </Box>
        <Box paddingX={1}>
          <Text color={showArchived ? theme.colors.warning : theme.colors.muted}>
            Archived: {showArchived ? `Show (${archivedCount})` : `Hide (${archivedCount})`}
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column" minHeight={visibleHeight}>
        {visibleItems.length === 0 && (
          <Box borderStyle="round" borderColor={theme.colors.border} paddingY={2} justifyContent="center">
            <Text color={theme.colors.muted}>
              {searchQuery ? 'No repositories match your search' : 'No repositories found'}
            </Text>
          </Box>
        )}

        {visibleItems.map((item, vi) => {
          const realIndex = scrollOffset + vi
          const focused = realIndex === cursorIndex && mode === 'navigate'

          if (item.isHeader) {
            return (
              <Box
                key={item.value}
                borderStyle="single"
                borderColor={theme.colors.border}
                paddingX={1}
                marginTop={vi > 0 ? 1 : 0}
              >
                <Text bold color={theme.colors.primaryDim}>
                  {theme.icons.folder} {item.label}
                </Text>
                <Text color={theme.colors.muted}> — {item.metadata}</Text>
              </Box>
            )
          }

          return (
            <Box key={item.value} paddingX={1}>
              <Text
                backgroundColor={focused ? theme.colors.surfaceLight : undefined}
                color={focused ? theme.colors.highlight : theme.colors.text}
              >
                <Text color={item.selected ? theme.colors.selected : theme.colors.mutedDim}>
                  {item.selected ? theme.icons.checkboxChecked : theme.icons.checkboxUnchecked}
                </Text>{' '}
                <Text bold={focused}>{item.label}</Text> <Text color={theme.colors.muted}>{item.metadata}</Text>
              </Text>
            </Box>
          )
        })}
      </Box>

      <Footer
        shortcuts={repoShortcuts}
        rightText={selectedCount > 0 ? `${selectedCount} selected — Tab to continue` : 'Select repositories to clone'}
      />
    </Box>
  )
}
