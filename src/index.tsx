#!/usr/bin/env node

import { render } from 'ink'
import { program } from 'commander'
import React from 'react'
import { App } from './ui/App.js'
import { resolveConfig, getTokenSetupGuide } from './config.js'
import { runHeadless } from './headless.js'
import { APP_DISPLAY_NAME, APP_VERSION } from './constants.js'
import { EXIT_CODES, GitFleetError, redactSecrets } from './errors.js'

async function main() {
  program
    .name('gitfleet')
    .description(`${APP_DISPLAY_NAME} — Clone multiple GitHub organization repositories`)
    .version(APP_VERSION)
    .option('-w, --workspace <path>', 'Workspace directory for cloned repos')
    .option('-p, --protocol <protocol>', 'Clone protocol: https or ssh')
    .option('-c, --concurrency <number>', 'Max concurrent clones (1-20)')
    .option('--retries <number>', 'Retries per repository for transient failures (0-5)')
    .option('--timeout <ms>', 'Per-operation git timeout in milliseconds')
    .option('--token <token>', 'GitHub token (held in memory only, never written to disk)')
    .option('--theme <mode>', 'Terminal theme: auto, dark, or light')
    .option('--orgs <list>', 'Comma-separated org logins (non-interactive mode)')
    .option('--repos <list>', 'Comma-separated repo names to include (non-interactive mode)')
    .option('--include-archived', 'Include archived repositories')
    .option('-y, --yes', 'Skip the confirmation screen')
    .option('--non-interactive', 'Headless mode for scripts and CI (no TUI)')
    .option('--json', 'Machine-readable JSON output (implies --non-interactive)')
    .parse(process.argv)

  const options = program.opts()

  let config
  try {
    config = resolveConfig({
      workspace: options.workspace,
      protocol: options.protocol,
      concurrency: options.concurrency,
      maxRetries: options.retries,
      gitTimeout: options.timeout,
      token: options.token,
      theme: options.theme,
      nonInteractive: options.nonInteractive,
      json: options.json,
      yes: options.yes,
      orgs: options.orgs,
      repos: options.repos,
      includeArchived: options.includeArchived,
    })
  } catch (error) {
    if (error instanceof GitFleetError && error.code === 'config' && /token/i.test(error.message)) {
      console.error(getTokenSetupGuide())
    } else {
      console.error(`error: ${redactSecrets(error instanceof Error ? error.message : String(error))}`)
      if (error instanceof GitFleetError && error.hint) console.error(error.hint)
    }
    process.exit(EXIT_CODES.error)
  }

  // A CLI-provided token lives in the resolved config; drop the env mirror
  // so child diagnostics can never echo it back.
  if (options.token && process.env.GITHUB_TOKEN === options.token) {
    delete process.env.GITHUB_TOKEN
  }

  if (config.nonInteractive) {
    const code = await runHeadless(config).catch(error => {
      console.error(`error: ${redactSecrets(error instanceof Error ? error.message : String(error))}`)
      return EXIT_CODES.error
    })
    process.exit(code)
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('error: gitfleet needs an interactive terminal. Use --non-interactive (optionally with --json) for scripts and CI.')
    process.exit(EXIT_CODES.error)
  }

  let exitCode: number = EXIT_CODES.success
  const { waitUntilExit } = render(React.createElement(App, { config, onExitCode: code => { exitCode = code } }))
  await waitUntilExit()
  process.exit(exitCode)
}

main().catch(error => {
  console.error(`fatal: ${redactSecrets(error instanceof Error ? error.message : String(error))}`)
  process.exit(EXIT_CODES.error)
})
