# multicodex monorepo

This repository is a Bun workspace monorepo powered by Turborepo.

## Workspace apps

- `apps/cli`: `multicodex` CLI (npm package)
- `apps/macos`: Native SwiftUI macOS menu bar app

See app-specific docs:

- `apps/cli/README.md`
- `apps/macos/README.md`

## Quick start

```bash
bun install
bun run check
```

## Development commands

- `bun run dev`: run workspace `dev` scripts through Turborepo
- `bun run check`: typecheck + test + build across workspaces
- `bun run test`: run tests across workspaces
- `bun run typecheck`: run typechecks across workspaces
- `bun run build`: build all workspaces
- `bun run macos:dev`: run macOS app via `just dev`
- `bun run macos:dmg`: build macOS DMG
- `bun run macos:ci`: run macOS checks

## Release strategy

CLI and macOS release independently.

### CLI release (npm)

- `bun run release` (default patch bump)
- `bun run release:cli`
- `bun run release:plan` (dry-run; no git or npm changes)
- `bun run release:patch`
- `bun run release:minor`
- `bun run release:major`
- `bun run release:cli -- --version 0.2.0`

All commands call `apps/cli/scripts/release.ts`.

### macOS release (GitHub Releases)

- Root shortcut: `bun run release:macos`
- From `apps/macos`: `just kickoff-release`
- Explicit version tag: `cd apps/macos && just release macos-v0.1.0`
- Explicit bump type: `cd apps/macos && just release minor`

Details:

- Workflow: `.github/workflows/release-macos.yml`
- Tag format: `macos-vMAJOR.MINOR.PATCH`
- Output artifact: `apps/macos/build/dist/MultiCodex.dmg`

The macOS packaging flow always rebuilds and bundles the CLI from `apps/cli` for the tagged commit.
