# polycodex

`polycodex` is a small Node CLI wrapper around `codex` that adds multiple “accounts” (logins) and fast switching.

It reuses your default Codex home (`~/.codex`) for everything (rules, skills, config, sessions, history, etc) and only switches accounts by swapping `~/.codex/auth.json` under a lock.

See `docs/how-it-works.md` for details.

## Install

- Run without installing: `npx polycodex --help`
- Install globally: `npm i -g polycodex`

Requirements:
- `codex` installed and available in `PATH` (polycodex shells out to it)
- Node.js 18+

## Usage

Create accounts:
- `polycodex profile add work`
- `polycodex profile add personal`

Login per account (stores per-account auth snapshots):
- `polycodex login --account work`
- `polycodex login --account personal`

Switch default account:
- `polycodex profile use work`

Run Codex using current account:
- `polycodex`
- `polycodex exec -m o3 "do the thing"`

Run a one-off command without switching your default login:
- `polycodex run --account personal --restore -- codex login status`

## Development

- Install deps: `bun install`
- Typecheck: `bun run typecheck`
- Tests: `bun test`
- Build (Node CLI): `bun run build`

## Publish

- `bun run build`
- `npm publish`

## Contributing

See `CONTRIBUTING.md`.

## Storage

Default root: `~/.config/polycodex` (override with `POLYCODEX_HOME`).

Per-account auth snapshots:
- `~/.config/polycodex/accounts/<name>/auth.json`

Lock:
- `~/.config/polycodex/locks/auth.lockdir`

Codex home (unchanged):
- `~/.codex` (polycodex only touches `~/.codex/auth.json`)
