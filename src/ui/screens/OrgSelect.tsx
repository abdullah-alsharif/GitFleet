import { Box, Text, useInput, useWindowSize } from 'ink'
import { useState, useMemo, useEffect } from 'react'
import { theme } from '../../theme.js'
import { fuzzyFilter } from '../../utils/fuzzy.js'
import { Footer, selectionShortcuts } from '../components/Footer.js'
import { StepsHeader } from '../components/StepsHeader.js'
import type { OrgDisplay } from '../../types.js'

interface OrgSelectScreenProps {
  organizations: OrgDisplay[]
  onConfirm: (selected: OrgDisplay[]) => void
  onBack: () => void
  username: string
}

type Mode = 'navigate' | 'search'

const ALL_ORGS_VALUE = '__all__'

export function OrgSelectScreen({ organizations, onConfirm, onBack, username }: OrgSelectScreenProps) {
  const [mode, setMode] = useState<Mode>('navigate')
  const [searchQuery, setSearchQuery] = useState('')
  const [cursorIndex, setCursorIndex] = useState(0)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [orgs, setOrgs] = useState<OrgDisplay[]>(organizations)
  const { rows } = useWindowSize()
  const maxVisible = Math.max(5, Math.min(20, rows - 12))

  useEffect(() => {
    setOrgs(organizations)
  }, [organizations])

  const allSelected = orgs.length > 0 && orgs.every(o => o.selected)
  const selectedCount = orgs.filter(o => o.selected).length

  const filteredOrgs = useMemo(
    () => fuzzyFilter(orgs, searchQuery, o => `${o.name} ${o.login}`),
    [orgs, searchQuery],
  )

  const items = useMemo(() => {
    const list: Array<{ value: string; label: string; selected: boolean; meta?: string }> = []
    if (!searchQuery) {
      list.push({
        value: ALL_ORGS_VALUE,
        label: 'All Organizations',
        selected: allSelected,
        meta: `(${orgs.length} total)`,
      })
    }
    for (const o of filteredOrgs) {
      list.push({
        value: String(o.id),
        label: o.name || o.login,
        selected: o.selected,
        meta: o.login !== o.name ? `@${o.login}` : undefined,
      })
    }
    return list
  }, [filteredOrgs, allSelected, orgs.length, searchQuery])

  useEffect(() => {
    if (cursorIndex >= items.length) {
      setCursorIndex(Math.max(0, items.length - 1))
    }
  }, [items.length, cursorIndex])

  const toggleItem = (value: string) => {
    if (value === ALL_ORGS_VALUE) {
      setOrgs(prev => prev.map(org => ({ ...org, selected: !allSelected })))
    } else {
      setOrgs(prev =>
        prev.map(org => (String(org.id) === value ? { ...org, selected: !org.selected } : org)),
      )
    }
  }

  const move = (delta: 1 | -1) => {
    setCursorIndex(prev => {
      const next = Math.min(items.length - 1, Math.max(0, prev + delta))
      setScrollOffset(offset => {
        if (next < offset) return next
        if (next >= offset + maxVisible) return next - maxVisible + 1
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
      const selected = orgs.filter(org => org.selected)
      if (selected.length > 0) onConfirm(selected)
      return
    }
    if (key.return || input === ' ') {
      const item = items[cursorIndex]
      if (item) toggleItem(item.value)
      return
    }
    if (input === 'a' || input === 'A') {
      const selectAll = !orgs.every(o => o.selected)
      setOrgs(prev => prev.map(org => ({ ...org, selected: selectAll })))
    }
  })

  const visibleItems = items.slice(scrollOffset, scrollOffset + maxVisible)

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <StepsHeader steps={['Organizations', 'Repositories', 'Confirm', 'Clone', 'Done']} current={0} context={`Logged in as ${username}`} />

      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color={theme.colors.primary}>
          {theme.icons.folder} Organizations
        </Text>
        <Box>
          <Text color={theme.colors.success}>
            {theme.icons.selected} {selectedCount}
          </Text>
          <Text color={theme.colors.muted}> / {orgs.length}</Text>
        </Box>
      </Box>

      <Box
        borderStyle="round"
        borderColor={mode === 'search' ? theme.colors.primary : theme.colors.border}
        paddingX={1}
      >
        {mode === 'search' ? (
          <Text>
            <Text color={theme.colors.primary}>{theme.icons.search} </Text>
            {searchQuery}
            <Text color={theme.colors.primary}>|</Text>
          </Text>
        ) : (
          <Text color={theme.colors.mutedDim}>{theme.icons.search} Search organizations... (press /)</Text>
        )}
      </Box>

      <Box flexDirection="column" minHeight={maxVisible} marginTop={1}>
        {visibleItems.length === 0 ? (
          <Box borderStyle="round" borderColor={theme.colors.border} paddingY={2} justifyContent="center">
            <Text color={theme.colors.muted}>
              {searchQuery ? 'No organizations match your search' : 'No organizations found'}
            </Text>
          </Box>
        ) : (
          visibleItems.map((item, vi) => {
            const realIndex = scrollOffset + vi
            const focused = realIndex === cursorIndex && mode === 'navigate'
            const prefix = item.selected ? theme.icons.checkboxChecked : theme.icons.checkboxUnchecked

            return (
              <Box key={item.value} paddingX={1}>
                <Text
                  backgroundColor={focused ? theme.colors.surfaceLight : undefined}
                  color={focused ? theme.colors.highlight : theme.colors.text}
                >
                  <Text color={item.selected ? theme.colors.selected : theme.colors.mutedDim}>{prefix}</Text>{' '}
                  <Text bold={focused}>{item.label}</Text>
                  {item.meta ? <Text color={theme.colors.muted}> {item.meta}</Text> : null}
                </Text>
              </Box>
            )
          })
        )}
      </Box>

      <Footer
        shortcuts={selectionShortcuts}
        rightText={selectedCount > 0 ? `${selectedCount} selected — Tab to continue` : 'Select at least one organization'}
      />
    </Box>
  )
}
