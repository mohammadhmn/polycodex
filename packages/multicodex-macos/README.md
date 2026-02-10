# MultiCodexMenu (macOS Menu Bar App)

Native macOS SwiftUI menu bar app for `multicodex`.

## Features

- Menu bar item showing current profile.
- Lists all configured profiles from `multicodex accounts list --json`.
- Shows per-profile usage from `multicodex limits --json` (5h, weekly, credits, source).
- One-click profile switch via `multicodex accounts use <name> --json`.
- Auto refresh every 5 minutes (matching limits cache TTL) plus manual refresh buttons.
- Card-style profile panels with progress bars and pace status (`ahead`, `on track`, `behind`).
- Reset time display toggle (`relative` / `absolute`), inspired by OpenUsage.
- Quick profile switch strip in the menu, inspired by CodexBar.
- Compact dual-bar tray glyph in the menu bar status item for at-a-glance usage.

## Build and run

Requirements:

- macOS 13+
- Xcode 15+ (or Swift 5.9+ toolchain)
- Node.js available on the machine (the app runs bundled `multicodex` via `node`)
- `just` (recommended for local app workflow)

From repo root:

```bash
cd packages/multicodex-macos
swift build
swift run MultiCodexMenu
```

With Bun workspaces / Turborepo:

```bash
bun run build
bun run --filter @multicodex/macos-app dev
```

## Common `just` commands

From `packages/multicodex-macos`:

```bash
just list                 # show all recipes
just doctor               # check swift/bun/node + sync bundled CLI
just dev                  # package debug app and run it
just build-debug          # debug build
just build-release        # release build
just package-app debug    # create build/dist/MultiCodexMenu.app
just dist                 # package release app to build/dist/
just dmg                  # create build/dist/MultiCodexMenu.dmg
just install              # copy app to /Applications
just logs                 # stream app logs
just reset-settings       # clear app defaults domain
just ci                   # doctor + build + test + typecheck
```

## Command resolution

The app bundles the CLI JS (`multicodex-cli.js`) and resolves Node in this order:

1. Custom Node path set in app settings.
2. `MULTICODEX_NODE` environment variable.
3. `NODE_BINARY` environment variable.
4. Common install paths (`/opt/homebrew/bin/node`, `/usr/local/bin/node`, `/usr/bin/node`).
5. `node` from `PATH`.

If lookup fails, use `Choose Node…` from the menu.
