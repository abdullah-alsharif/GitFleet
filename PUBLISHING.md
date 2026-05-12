# Publishing GitFleet

Package: [`gitfleet-cli`](https://www.npmjs.com/package/gitfleet-cli) (the
unscoped `gitfleet` name belongs to an unrelated package — do not use it).
The installed command stays `gitfleet` via the `bin` field.

## Normal releases (trusted publishing, no tokens)

Releases are cut from git tags and published by CI (`.github/workflows/publish.yml`)
using npm OIDC trusted publishing — no `NPM_TOKEN` needed.

```bash
# 1. Bump the version in these 4 places (keep them in sync):
#      package.json, package-lock.json (2 spots), src/constants.ts (APP_VERSION)
#    and add a CHANGELOG.md entry.
# 2. Verify:
npm install && npm run typecheck && npm test && npm run build
# 3. Commit, tag, push:
git add -A && git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z && git push origin main vX.Y.Z
```

Pushing the tag runs typecheck → tests → build → `npm publish --provenance
--access public`. Watch it under GitHub → Actions → Publish.

One-time setup (already done, documented here so it isn't lost): the trust
relationship lives on npmjs.com → Packages → gitfleet-cli → Settings →
Trusted publishing (GitHub user `abdullah-alsharif`, repo `GitFleet`,
workflow `publish.yml`). It only had to exist before the *second* publish;
the first one went out manually (see below).

## First publish bootstrap (already done for 1.0.0)

OIDC can't create a package that doesn't exist yet, so v1.0.0 was published
by hand with a granular access token (read + write, bypass-2FA enabled):

```bash
npm config set //registry.npmjs.org/:_authToken=<TOKEN>
npm publish
npm config delete //registry.npmjs.org/:_authToken
```

Always delete the token from local config afterwards.

## Rules that bit us once

- **Never republish a version.** npm forbids it; change content → bump version.
- **Never delete the package** to "redo" a release: the name becomes
  squattable and the trusted-publisher link breaks.
- **Version spots must agree:** `package.json`, `package-lock.json` (root +
  `packages[""]`), `src/constants.ts`, `CHANGELOG.md`. CI doesn't check
  this — the checklist above does.
- **`repository.url`** must use the `git+https://` form or `npm publish`
  warns on every release.
- The repo being **private** is fine for publishing, but provenance badges
  link to a repo nobody can open — prefer a public repo for a public CLI.
- Local `npm publish` requires a 2FA-capable session (`npm logout &&
  npm login` with OTP) or a bypass-enabled token; browser-flow logins
  don't carry publish rights.
