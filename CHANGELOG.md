# Changelog

## 1.0.1

- Publish as `gitfleet-cli` (unscoped `gitfleet` belongs to another package).
- Document the release process in PUBLISHING.md.
- CI publishes via OIDC trusted publishing with provenance.

Major modernization release.

### Breaking changes

- Requires **Node.js >= 22** (was >= 18). Node 18 is end-of-life; Ink 7 requires Node 22.
- Upgraded to **Ink 7 + React 19** (was Ink 5 + React 18).
- New confirmation screen before cloning; pass `-y` / `--yes` to skip it.
- `CloneResult.duration` renamed to `durationMs`; results now also carry `kind`, `attempts`, and `note`.
- `fetchAllRepositories` now returns `{ repos, failures }` instead of throwing on the first failing org.
- Default retries changed from 3 to 2 (configurable via `--retries 0-5`).
- Removed unused dependencies: `simple-git`, `chalk`, `figures` (git is driven via `execa` only).

### Added

- Non-interactive mode: `--non-interactive`, `--json`, `--orgs`, `--repos`, `--include-archived`.
- Confirmation screen with workspace/protocol/concurrency summary.
- Retry failed repositories from the summary screen (`R`).
- Terminal themes: `--theme auto|dark|light`, `NO_COLOR` / dumb-terminal / ASCII fallbacks.
- Step-indicator header, `j`/`k` navigation, responsive list heights, wrapping footers.
- Typed error model (`GitFleetError`) with actionable hints; stable exit codes (0/1/2/130).
- HTTPS git authentication via ephemeral `http.extraHeader` (tokens never touch remote URLs or disk).
- Git failure classification (auth / not-found / network / timeout / dirty / conflict) — only transient failures retry.
- Unsafe org/repo names rejected before any filesystem or URL use (path-traversal safe).
- GitHub responses validated with Zod; `Link`-header pagination (up to 1000 repos per listing); request timeouts; 429 handling.
- Dirty working trees and diverged branches are left untouched and reported as skipped/failed with guidance.
- `LICENSE` (MIT), exit-code and troubleshooting docs.

### Migration from 1.x

1. Upgrade Node.js to >= 22.
2. If you script GitFleet, add `--non-interactive --orgs "<org>"` (interactive TUI refuses non-TTY stdio).
3. Add `-y` if you want to skip the new confirmation screen.
4. No config file changes required.
