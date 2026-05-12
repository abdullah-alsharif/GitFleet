# GitFleet

**Clone multiple GitHub organization repositories at scale — with a polished terminal UI.**

GitFleet provides an interactive keyboard-driven terminal experience for browsing organizations, selecting repositories, and cloning them in bulk. It organizes repos into folders by organization, plus a headless mode for scripts and CI.

```
workspace/
├── org-1/
│   ├── repo-a/
│   ├── repo-b/
├── org-2/
│   ├── repo-c/
│   └── repo-d/
```

## Features

- **Fuzzy Search** — Live organization and repository filtering
- **Multi-Select** — Checkbox lists with keyboard navigation (`↑↓`/`j`/`k`)
- **Personal + Org Repos** — Includes your personal repositories
- **Concurrent Cloning** — Configurable parallelism (1–20) with smart retries
- **Authenticated HTTPS** — Private repos clone over HTTPS without storing credentials
- **Smart Updates** — Existing checkouts are fast-forward pulled; dirty trees are left untouched
- **Live Progress** — Adaptive progress UI with per-repo status and retry indicators
- **Confirm Step** — Review scope before expensive operations (`-y` to skip)
- **Retry Failures** — Press `R` on the summary to retry only what failed
- **Headless Mode** — `--non-interactive` / `--json` for scripts and CI
- **Themes** — `auto`/`dark`/`light` with `NO_COLOR` and ASCII fallbacks

## Requirements

- **Node.js >= 22**
- **Git** (available as `git` on `PATH`)
- **GitHub token** (classic `read:org` + `repo`, or fine-grained equivalent)

## Installation

The published package is [`gitfleet-cli`](https://www.npmjs.com/package/gitfleet-cli)
(the unscoped `gitfleet` name belongs to an unrelated package). The installed
command stays `gitfleet`:

```bash
npm install -g gitfleet-cli
```

Or run directly without installing:

```bash
npx -p gitfleet-cli gitfleet
```

## Quick Start

```bash
export GITHUB_TOKEN="<your_token>"
gitfleet
gitfleet --token <your_token>   # held in memory only, never written to disk
```

## Authentication

Create a token at https://github.com/settings/tokens.

| Token type | Needed permissions |
|------------|--------------------|
| Classic PAT | `read:org` (organization memberships) + `repo` (private clones) |
| Fine-grained PAT | Repository **Contents (read)** + Organization **Members (read)**, granted per org/repo |

GitFleet accepts all current token formats (`ghp_`, `gho_`, `github_pat_`, …) — not just `ghp_`.
Tokens are never printed, logged, cached, or embedded in git URLs.

### Token precedence

`--token` flag → `GITHUB_TOKEN` env → `~/.config/gitfleet/.env` (Windows: `%APPDATA%\gitfleet\.env`) → `./.env`

### Full configuration precedence

CLI flags → environment variables → config file → local `.env` → defaults.

| CLI | Env | Default |
|-----|-----|---------|
| `-w, --workspace` | `GITFLEET_WORKSPACE` | `.` |
| `-p, --protocol` | `GITFLEET_PROTOCOL` | `https` |
| `-c, --concurrency` | `GITFLEET_CONCURRENCY` | `5` |
| `--retries` | `GITFLEET_RETRIES` | `2` |
| `--timeout` | `GITFLEET_TIMEOUT` | `300000` (ms) |
| `--theme` | `GITFLEET_THEME` | `auto` |
| `--orgs` / `--repos` | `GITFLEET_ORGS` / `GITFLEET_REPOS` | — |
| `--include-archived` | `GITFLEET_INCLUDE_ARCHIVED` | `false` |
| `-y, --yes` | `GITFLEET_YES` | `false` |
| `--non-interactive` | `GITFLEET_NON_INTERACTIVE` | `false` |
| `--json` | `GITFLEET_JSON` | `false` |

## Usage

```bash
gitfleet [options]
```

### Examples

```bash
gitfleet --workspace ~/projects --concurrency 10
gitfleet --protocol ssh
gitfleet -y --workspace ./repos                    # skip confirmation
gitfleet --non-interactive --orgs "my-org"         # headless (CI)
gitfleet --non-interactive --orgs "a,b" --repos "web,api" --json
gitfleet --theme light
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` `↓` or `j` `k` | Navigate list |
| `Enter` / `Space` | Toggle selection |
| `Tab` | Confirm and proceed |
| `/` | Focus search (`Enter` done, `Esc` clear) |
| `A` | Select all / deselect all |
| `S` | Cycle sort (Updated → Stars → Name, repos only) |
| `H` | Toggle archived repos (repos only) |
| `1` `2` `3` | Summary tabs (Overview / Details / Errors) |
| `R` | Retry failed repositories (summary) |
| `Esc` | Go back |
| `Ctrl+C` | Cancel (exit code 130) |

## Interactive Workflow

1. **Organizations** — pick orgs (personal repos included), step indicator shows progress.
2. **Repositories** — grouped by org, sortable, searchable; fetch failures per org are shown, not fatal.
3. **Confirm** — review repo count, workspace, protocol, concurrency, retries.
4. **Clone progress** — adaptive bar, per-repo status, retry attempts, elapsed time.
5. **Summary** — counts, duration, per-org breakdown, failures grouped by cause with hints.

### Status indicators

Every status has both a color and a symbol (readable with colors off):

| Symbol | Meaning |
|--------|---------|
| `✓` | Cloned (new) |
| `↻` | Updated with new commits |
| `⊘` | Skipped (up-to-date, or local changes kept) |
| `✗` | Failed (with classified reason) |
| `⋯` | Cloning |
| `○` | Queued |

## Non-interactive mode

For scripts and CI (`--non-interactive` requires `--orgs`):

```bash
gitfleet --non-interactive --orgs "my-org" --repos "web,api" --json > result.json
```

- Human progress goes to **stderr**; with `--json`, **stdout** contains only the final JSON document.
- Exit codes: `0` success · `1` fatal error · `2` partial failure (some repos failed).

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success (all repositories processed) |
| `1` | Fatal error (config, auth, API failure, nothing to clone) |
| `2` | Partial failure (clone run finished, ≥1 repo failed) |
| `130` | Cancelled by user (Ctrl+C) |

## Themes & accessibility

- `--theme auto|dark|light` (or `GITFLEET_THEME`). `auto` is conservative: dark unless the terminal explicitly reports a light background (`COLORFGBG`).
- `NO_COLOR=1`, `TERM=dumb`, or piped output disables color; icons fall back to ASCII (`GITFLEET_ASCII=1` forces this).
- Non-TTY stdio is refused for the TUI with a pointer to `--non-interactive`.

## HTTPS vs SSH

- **HTTPS** (default): GitFleet authenticates with your token via an ephemeral `http.extraHeader` — private repos work and the token never lands in `.git/config`.
- **SSH**: uses your existing keys/agent (`ssh` must already work with GitHub).

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `Token is invalid` | Revoked/expired token — create a new one |
| `lacks organization access` | Fine-grained token missing org access, or SSO not authorized |
| `Git authentication failed` | HTTPS: bad token; SSH: key not added to GitHub / agent not running |
| `Repository not found` | Renamed/deleted repo, or token lacks access |
| `Local changes kept` | Commit, stash, or discard changes in that checkout, then rerun |
| `Rate limited` | Wait for the reset time shown, or use a token with more budget |
| `Git executable not found` | Install git and ensure `git --version` works |

## Development

```bash
npm install
export GITHUB_TOKEN="<token>"
npm run dev        # tsx
npm run typecheck
npm test
npm run build
```

## Architecture

```
gitfleet/
├── bin/gitfleet.js        # CLI entry (imports dist)
└── src/
    ├── index.tsx          # Commander CLI bootstrap + Ink/headless dispatch
    ├── headless.ts        # Non-interactive runner (TTY-free, JSON-safe)
    ├── config.ts          # Precedence + Zod validation (CLI > env > file > defaults)
    ├── errors.ts          # GitFleetError taxonomy, secret redaction, exit codes
    ├── theme.ts           # Terminal theme system (auto/dark/light, no-color, ASCII)
    ├── types.ts           # Domain types
    ├── constants.ts       # Tunables (timeouts, retries, pagination caps)
    ├── utils/             # fuzzy search, formatting
    ├── services/
    │   ├── github.ts      # Validated REST client, Link pagination, rate-limit handling
    │   ├── token.ts       # Token validation (classic + fine-grained PATs)
    │   ├── clone.ts       # execa-owned git engine, retries, path safety
    │   └── cache.ts       # Bounded in-memory TTL cache (never stores secrets)
    └── ui/
        ├── App.tsx        # Screen state machine + orchestration
        ├── components/    # Footer, StepsHeader
        └── screens/       # Loading, TokenError, OrgSelect, RepoSelect,
                           # Confirm, CloneProgress, Summary
```

## License

MIT
