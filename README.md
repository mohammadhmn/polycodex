# polycodex

`polycodex` is a Bun + TypeScript wrapper around `codex` that adds multiple “accounts” (logins) and fast switching.

It reuses your default Codex home (`~/.codex`) for everything (rules, skills, config, sessions, history, etc) and only switches accounts by swapping `~/.codex/auth.json` under a lock.

See `POLYCODEX_PLAN.md` for details.

## Install (local dev)

- Run: `bun install`
- Run: `bun run dev -- --help`

## Build

- Build CLI bundle: `bun run build`
- Output: `dist/cli.js`

## Usage

Create accounts (profiles):
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

Run Codex using a specific account (one-off):
- `polycodex run --account personal --restore -- codex login status`

## Storage

Default root: `~/.config/polycodex` (override with `POLYCODEX_HOME`).

Per-account auth snapshots:
- `~/.config/polycodex/accounts/<name>/auth.json`

Lock:
- `~/.config/polycodex/locks/auth.lockdir`

Codex home (unchanged):
- `~/.codex` (polycodex only touches `~/.codex/auth.json`)

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.8. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
