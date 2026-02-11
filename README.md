# multicodex monorepo

This repository is configured as a Bun workspace monorepo with Turborepo.

## Apps

- `apps/cli`: `multicodex` CLI app workspace.
- `apps/macos`: Native Swift macOS menu bar app workspace.

## Development

- Install dependencies: `bun install`
- Run tests across workspaces: `bun run test`
- Typecheck across workspaces: `bun run typecheck`
- Build across workspaces: `bun run build`
- Run the macOS app only: `bun run --filter macos dev`
- App-focused workflow commands: `cd apps/macos && just list`

## Release Strategy (Monorepo)

- CLI (`apps/cli`) continues to publish to npm using the existing local flow (`bun run --filter cli release`).
- macOS app (`apps/macos`) is released via GitHub Actions on tags that match `macos-v*`.

### CLI release (npm)

- Run the current CLI release helper:
  - `bun run --filter cli release`
- This keeps your current npm publishing behavior unchanged.

### macOS release (GitHub Releases)

- Create and push a tag like `macos-v0.1.0`:
  - `git tag -a macos-v0.1.0 -m "macos-v0.1.0"`
  - `git push origin macos-v0.1.0`
- Workflow: `.github/workflows/release-macos.yml`
- Output artifact: `apps/macos/build/dist/MultiCodex.dmg` uploaded to the GitHub Release for that tag.

## Adding workspaces later

Create a new folder under `apps/` with its own `package.json`. It will be included automatically by the root `workspaces` configuration.
