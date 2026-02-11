# multicodex

[![npm version](https://img.shields.io/npm/v/multicodex)](https://www.npmjs.com/package/multicodex)
[![license](https://img.shields.io/npm/l/multicodex)](LICENSE)

`multicodex` is a Node CLI wrapper around `codex` that adds multiple accounts (logins) and fast switching.

It reuses your default Codex home (`~/.codex`) for everything (rules, skills, config, sessions, history, etc) and only switches accounts by swapping `~/.codex/auth.json` under a lock.

See `docs/how-it-works.md` for implementation details.

## Install

- Run without installing: `npx multicodex --help`
- Install globally: `npm i -g multicodex`

Requirements:

- `codex` installed and available in `PATH` (`multicodex` shells out to it)
- Node.js 18+

Binary names:

- `multicodex`
- `mcodex` (alias)

## Usage

Create accounts:
- `multicodex accounts add work`
- `multicodex accounts add personal`

Login per account (stores per-account auth snapshots):
- `multicodex run work -- codex login`
- `multicodex run personal -- codex login`

Switch default account:
- `multicodex accounts use work`

Run Codex using current account:
- `multicodex codex` (interactive)
- `multicodex codex -m o3 "do the thing"` (passthrough)

Run a one-off command without switching your default login:
- `multicodex run personal --temp -- codex login status`

See accounts at a glance:
- `multicodex accounts` (alias: `multicodex ls`)

Usage limits (via Codex app-server RPC):
- `multicodex limits` (all accounts)
- `multicodex limits work`

Notes: results are cached for 300 seconds by default. Use `--no-cache` or `--ttl <seconds>`.

## JSON output (for apps/automation)

Most account management commands support `--json` for machine-readable output on stdout.

Examples:
- `multicodex accounts list --json`
- `multicodex accounts current --json`
- `multicodex use work --json`
- `multicodex limits --json`

## Autocomplete

Bash:
- `multicodex completion bash > ~/.multicodex-completion.bash`
- Add to `~/.bashrc`: `source ~/.multicodex-completion.bash`

Zsh:
- `multicodex completion zsh > ~/.multicodex-completion.zsh`
- Add to `~/.zshrc`:
  - `autoload -Uz compinit && compinit`
  - `source ~/.multicodex-completion.zsh`
- Or install to fpath: `multicodex completion zsh --install`

Fish:
- `multicodex completion fish > ~/.config/fish/completions/multicodex.fish`

## Development

- Install deps from repo root: `bun install`
- Typecheck: `bun run --filter multicodex typecheck`
- Tests: `bun run --filter multicodex test`
- Build (Node CLI): `bun run --filter multicodex build`

Architecture notes:
- `docs/architecture.md`

## Publish

- `bun run --filter multicodex build`
- `npm publish --workspace apps/cli`

## Contributing

See `CONTRIBUTING.md`.

## Storage

Default root: `~/.config/multicodex` (override with `MULTICODEX_HOME`).

Per-account auth snapshots:
- `~/.config/multicodex/accounts/<name>/auth.json`

Lock:
- `~/.config/multicodex/locks/auth.lockdir`

Codex home (unchanged):
- `~/.codex` (multicodex only touches `~/.codex/auth.json`)
