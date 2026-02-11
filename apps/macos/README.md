# MultiCodex (macOS Menu Bar App)

Native macOS SwiftUI menu bar app for `multicodex`.

## Features

- Menu bar item showing current profile.
- Lists all configured profiles from `multicodex accounts list --json`.
- Shows per-profile usage from `multicodex limits --json` (5h, weekly, source).
- One-click profile switch via `multicodex accounts use <name> --json`.
- Auto refresh every 5 minutes (matching limits cache TTL) plus manual refresh buttons.
- Profile and login management in Settings:
  - add/rename/remove profiles
  - import current `~/.codex/auth.json` into a profile
  - check login status per profile
  - launch profile login flow in Terminal (`multicodex run <name> -- login`)
- Reset time display toggle (`relative` / `absolute`).
- Compact dual-bar tray glyph in the menu bar status item for at-a-glance usage.

## Build and run

Requirements:

- macOS 13+
- Xcode 15+ (or Swift 5.9+ toolchain)
- Node.js available on the machine (the app runs bundled `multicodex` via `node`)
- `just` (recommended for local app workflow)

From repo root:

```bash
cd apps/macos
swift build
swift run MultiCodex
```

With Bun workspaces / Turborepo:

```bash
bun run build
bun run --filter macos dev
```

## Common `just` commands

From `apps/macos`:

```bash
just list                 # show all recipes
just doctor               # check swift/bun/node + sync bundled CLI
just icon                 # generate icon PNGs + AppIcon.icns from Assets/AppIcon.appiconset/icon-master.svg
just dev                  # package debug app and run it
just build-debug          # debug build
just build-release        # release build
just package-app debug    # create build/dist/MultiCodex.app
just dist                 # package release app to build/dist/
just dmg                  # create build/dist/MultiCodex.dmg
just install              # copy app to /Applications
just logs                 # stream app logs
just reset-settings       # clear app defaults domain
just ci                   # doctor + build + test + typecheck
```

## GitHub release (DMG)

This workspace is released from the monorepo root via GitHub Actions.

- Workflow: `/Users/mohamadhosein/Workspace/utilities/multicodex/.github/workflows/release-macos.yml`
- Trigger tag format: `macos-vMAJOR.MINOR.PATCH` (example: `macos-v0.1.0`)
- Release artifact: `MultiCodex.dmg`

From repo root:

```bash
git tag -a macos-v0.1.0 -m "macos-v0.1.0"
git push origin macos-v0.1.0
```

## Command resolution

The app bundles the CLI JS (`multicodex-cli.js`) and resolves Node in this order:

1. Custom Node path set in app settings.
2. `MULTICODEX_NODE` environment variable.
3. `NODE_BINARY` environment variable.
4. Common install paths (`/opt/homebrew/bin/node`, `/usr/local/bin/node`, `/usr/bin/node`).
5. `node` from `PATH`.

If lookup fails, use `Choose Node…` from the menu.
