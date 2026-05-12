import { Box, useApp, useInput } from 'ink'
import { useState, useEffect, useRef, useCallback } from 'react'
import { LoadingScreen } from './screens/Loading.js'
import { TokenErrorScreen } from './screens/TokenError.js'
import { OrgSelectScreen } from './screens/OrgSelect.js'
import { RepoSelectScreen } from './screens/RepoSelect.js'
import { ConfirmScreen } from './screens/Confirm.js'
import { CloneProgressScreen } from './screens/CloneProgress.js'
import { SummaryScreen } from './screens/Summary.js'
import { validateToken } from '../services/token.js'
import { fetchOrganizations, fetchAllRepositories, type OrgFetchFailure } from '../services/github.js'
import { cloneAll, createCloneTasks } from '../services/clone.js'
import { EXIT_CODES, toUserMessage } from '../errors.js'
import type {
  Screen,
  OrgDisplay,
  RepoDisplay,
  CloneResult,
  GitHubApiConfig,
  AppConfig,
  CloneTask,
} from '../types.js'

interface AppProps {
  config: AppConfig
  onExitCode?: (code: number) => void
}

export function App({ config, onExitCode }: AppProps) {
  const { exit } = useApp()

  const [screen, setScreen] = useState<Screen>('loading')
  const [loadingMessage, setLoadingMessage] = useState('Initializing...')
  const [errorMessage, setErrorMessage] = useState('')
  const [tokenMissing, setTokenMissing] = useState(false)
  const [username, setUsername] = useState('')

  const [organizations, setOrganizations] = useState<OrgDisplay[]>([])
  const [repositories, setRepositories] = useState<RepoDisplay[]>([])
  const [fetchFailures, setFetchFailures] = useState<OrgFetchFailure[]>([])
  const [selectedRepos, setSelectedRepos] = useState<RepoDisplay[]>([])
  const [cloneResults, setCloneResults] = useState<CloneResult[]>([])
  const [cloneTotal, setCloneTotal] = useState(0)
  const [cloneElapsed, setCloneElapsed] = useState(0)
  const [reposLoading, setReposLoading] = useState(false)
  const [reposLoadingMessage, setReposLoadingMessage] = useState('')

  const apiConfig: GitHubApiConfig = {
    token: config.token,
    baseUrl: 'https://api.github.com',
    version: '2022-11-28',
  }

  const startTimeRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const mountedRef = useRef(true)
  const exitCodeRef = useRef<number>(EXIT_CODES.success)

  useEffect(() => {
    mountedRef.current = true
    void initApp()
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const finish = useCallback(
    (code: number) => {
      exitCodeRef.current = code
      onExitCode?.(code)
      exit()
    },
    [exit, onExitCode],
  )

  async function initApp() {
    setLoadingMessage('Validating GitHub token...')

    const result = await validateToken(config.token)
    if (!mountedRef.current) return

    if (!result.valid) {
      setErrorMessage(result.error || 'Unknown error')
      setTokenMissing(result.error?.includes('Cannot reach') || false)
      setScreen('token-error')
      exitCodeRef.current = EXIT_CODES.error
      onExitCode?.(EXIT_CODES.error)
      return
    }

    setUsername(result.user?.login || '')
    setLoadingMessage('Fetching organizations...')

    try {
      const orgs = await fetchOrganizations(apiConfig, result.user?.login)
      if (!mountedRef.current) return
      setOrganizations(orgs.map(o => ({ ...o, selected: false })))
      setScreen('org-select')
    } catch (error) {
      if (!mountedRef.current) return
      const { message } = toUserMessage(error)
      setErrorMessage(message)
      setTokenMissing(false)
      setScreen('token-error')
      exitCodeRef.current = EXIT_CODES.error
      onExitCode?.(EXIT_CODES.error)
    }
  }

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = undefined
    }
  }

  const handleOrgConfirm = useCallback(
    async (selected: OrgDisplay[]) => {
      setReposLoading(true)
      setReposLoadingMessage('Fetching repositories...')
      setFetchFailures([])
      setScreen('repo-select')

      try {
        const { repos, failures } = await fetchAllRepositories(selected, apiConfig, username)
        if (!mountedRef.current) return
        setRepositories(repos.map(r => ({ ...r, selected: false })))
        setFetchFailures(failures)
      } catch (error) {
        if (!mountedRef.current) return
        const { message } = toUserMessage(error)
        setErrorMessage(message)
        setTokenMissing(false)
        setScreen('token-error')
      } finally {
        if (mountedRef.current) setReposLoading(false)
      }
    },
    [config.token, username],
  )

  const runClone = useCallback(
    async (reposToClone: RepoDisplay[]) => {
      const tasks: CloneTask[] = createCloneTasks(reposToClone)
      setCloneTotal(tasks.length)
      setCloneResults([])
      setCloneElapsed(0)
      setScreen('clone-progress')

      startTimeRef.current = Date.now()
      stopTimer()
      timerRef.current = setInterval(() => {
        if (mountedRef.current) {
          setCloneElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
        }
      }, 1000)

      const results = await cloneAll(tasks, {
        workspaceDir: config.workspaceDir,
        protocol: config.protocol,
        concurrency: config.concurrency,
        token: config.token,
        maxRetries: config.maxRetries,
        gitTimeoutMs: config.gitTimeoutMs,
        onProgress: (result: CloneResult) => {
          if (mountedRef.current) setCloneResults(prev => [...prev, result])
        },
        onQueueChange: () => {},
      })

      stopTimer()
      if (!mountedRef.current) return
      setCloneResults(results)
      setCloneElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
      const failed = results.filter(r => r.status === 'failed').length
      exitCodeRef.current = failed > 0 ? EXIT_CODES.partial : EXIT_CODES.success
      onExitCode?.(exitCodeRef.current)
    },
    [config, onExitCode],
  )

  const handleRepoConfirm = useCallback(
    (selected: RepoDisplay[]) => {
      setSelectedRepos(selected)
      if (config.assumeYes) {
        void runClone(selected)
      } else {
        setScreen('confirm')
      }
    },
    [config.assumeYes, runClone],
  )

  const handleRetryFailed = useCallback(() => {
    const failedNames = new Set(cloneResults.filter(r => r.status === 'failed').map(r => r.fullName))
    const retryRepos = selectedRepos.filter(r => failedNames.has(r.fullName))
    if (retryRepos.length > 0) {
      void runClone(retryRepos)
    }
  }, [cloneResults, selectedRepos, runClone])

  const handleBackToOrg = useCallback(() => {
    setScreen('org-select')
  }, [])

  const handleBackToRepo = useCallback(() => {
    setScreen('repo-select')
  }, [])

  const handleExit = useCallback(() => {
    stopTimer()
    finish(exitCodeRef.current)
  }, [finish])

  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        stopTimer()
        onExitCode?.(EXIT_CODES.cancelled)
        exit()
      }
    },
    { isActive: true },
  )

  const selectedOrgCount = organizations.filter(o => o.selected).length

  return (
    <Box flexDirection="column" width="100%" paddingX={1}>
      {screen === 'loading' && <LoadingScreen message={loadingMessage} subMessage="Connecting to GitHub..." />}

      {screen === 'token-error' && (
        <TokenErrorScreen error={errorMessage} missing={tokenMissing} onExit={handleExit} />
      )}

      {screen === 'org-select' && (
        <OrgSelectScreen
          organizations={organizations}
          onConfirm={handleOrgConfirm}
          onBack={handleExit}
          username={username}
        />
      )}

      {screen === 'repo-select' && (
        <RepoSelectScreen
          repositories={repositories}
          fetchFailures={fetchFailures}
          onConfirm={handleRepoConfirm}
          onBack={handleBackToOrg}
          loading={reposLoading}
          loadingMessage={reposLoadingMessage}
        />
      )}

      {screen === 'confirm' && (
        <ConfirmScreen
          repoCount={selectedRepos.length}
          orgCount={Math.max(1, selectedOrgCount)}
          workspaceDir={config.workspaceDir}
          protocol={config.protocol}
          concurrency={config.concurrency}
          maxRetries={config.maxRetries}
          onStart={() => void runClone(selectedRepos)}
          onBack={handleBackToRepo}
        />
      )}

      {screen === 'clone-progress' && (
        <CloneProgressScreen
          results={cloneResults}
          total={cloneTotal}
          elapsed={cloneElapsed}
          onComplete={() => mountedRef.current && setScreen('summary')}
        />
      )}

      {screen === 'summary' && (
        <SummaryScreen
          results={cloneResults}
          totalDurationMs={cloneElapsed * 1000}
          workspaceDir={config.workspaceDir}
          protocol={config.protocol}
          concurrency={config.concurrency}
          onExit={handleExit}
          onRetryFailed={handleRetryFailed}
        />
      )}
    </Box>
  )
}
