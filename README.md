# polycodex

[![npm version](https://img.shields.io/npm/v/polycodex)](https://www.npmjs.com/package/polycodex)
[![license](https://img.shields.io/npm/l/polycodex)](LICENSE)

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
- `polycodex accounts add work`
- `polycodex accounts add personal`

Login per account (stores per-account auth snapshots):
- `polycodex run work -- codex login`
- `polycodex run personal -- codex login`

Switch default account:
- `polycodex accounts use work`

Run Codex using current account:
- `polycodex codex` (interactive)
- `polycodex codex -m o3 "do the thing"` (passthrough)

Run a one-off command without switching your default login:
- `polycodex run personal --temp -- codex login status`

See accounts at a glance:
- `polycodex accounts` (alias: `polycodex ls`)

## Autocomplete

Bash:
- `polycodex completion bash > ~/.polycodex-completion.bash`
- Add to `~/.bashrc`: `source ~/.polycodex-completion.bash`

Zsh:
- `polycodex completion zsh > ~/.polycodex-completion.zsh`
- Add to `~/.zshrc`: `source ~/.polycodex-completion.zsh`

Fish:
- `polycodex completion fish > ~/.config/fish/completions/polycodex.fish`

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
