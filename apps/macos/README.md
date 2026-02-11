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
  - launch profile login flow in Terminal
- Reset time display toggle (`relative` / `absolute`).
- Compact dual-bar tray glyph in the menu bar status item for at-a-glance usage.

## Build and run

Requirements:

- macOS 13+
- Xcode 15+ (or Swift 5.9+ toolchain)
- Node.js available on the machine (the app runs bundled `multicodex` through `node`)
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
just list                 # show available commands
just doctor               # check swift/bun/node + sync bundled CLI
just dev                  # package debug app and run it
just dmg                  # create build/dist/MultiCodex.dmg
just ci                   # doctor + build + test + typecheck
just clean                # remove build artifacts
```

## GitHub release (DMG)

This app has its own release flow (separate from CLI npm release).

- Workflow: `.github/workflows/release-macos.yml`
- Trigger tag format: `macos-vMAJOR.MINOR.PATCH` (example: `macos-v0.1.0`)
- Release artifact: `MultiCodex.dmg`

From `apps/macos`:

```bash
just kickoff-release           # patch bump and push tag
just release minor             # bump from latest macos-v tag
just release macos-v0.1.0      # explicit version
```

From repo root (shortcut):

```bash
bun run release:macos
```

Note: packaging always rebuilds and bundles the CLI from `apps/cli` for the tagged commit.

## Monorepo shortcuts

From repo root, these commands are available:

- `bun run macos:dev`
- `bun run macos:dmg`
- `bun run macos:ci`
- `bun run release:macos`

## Command resolution

The app bundles the CLI JS (`multicodex-cli.js`) and resolves Node in this order:

1. Custom Node path set in app settings.
2. `MULTICODEX_NODE` environment variable.
3. `NODE_BINARY` environment variable.
4. Common install paths (`/opt/homebrew/bin/node`, `/usr/local/bin/node`, `/usr/bin/node`).
5. `node` from `PATH`.

If lookup fails, use `Choose Node…` from the menu.
