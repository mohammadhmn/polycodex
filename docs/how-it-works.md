# How polycodex works

`polycodex` is a small wrapper around the `codex` CLI that adds multiple “accounts” (logins) and switching between them.

## Key idea

Codex stores its current login state in:

- `~/.codex/auth.json`

Codex also stores everything else in `~/.codex` (rules, skills, config, sessions, history, etc).

`polycodex` **does not change** where Codex keeps its data. It keeps using `~/.codex` as-is.

Instead, `polycodex` implements account switching by saving and restoring different versions of `~/.codex/auth.json`.

## Where polycodex stores accounts

Polycodex stores one auth snapshot per account:

- `~/.config/polycodex/accounts/<name>/auth.json`

and a small config file:

- `~/.config/polycodex/config.json`

You can override the root with `POLYCODEX_HOME`.

## Locking / safety

While `codex` is running, `polycodex` prevents other `polycodex` processes from swapping auth mid-session using a lock directory:

- `~/.config/polycodex/locks/auth.lockdir`

If you see “locked by …”, it usually means another `polycodex`-managed Codex session is still running.

If the previous process crashed and left a stale lock, you can retry with `--force` (e.g. `polycodex run --force -- ...`).

## What happens when you run codex through polycodex

For commands that run `codex` (including passthrough, `run`, `status`, and `limits`):

1) Acquire the auth lock
2) Replace `~/.codex/auth.json` with the selected account’s snapshot (or delete it if that account has no snapshot yet)
3) Spawn `codex ...` normally (no `CODEX_HOME` override)
4) After `codex` exits, copy the resulting `~/.codex/auth.json` back into the selected account’s snapshot (keeps refreshed tokens)
5) Release the lock

### The `--temp` flag

`polycodex run --temp -- ...` restores the previous `~/.codex/auth.json` after the command completes.

Use this for one-off commands where you don’t want to permanently switch your default Codex login.

## Commands

### Accounts

- `polycodex accounts add <name>`: create an account entry (no login happens yet)
- `polycodex accounts list`: list accounts (with cached status/metadata)
- `polycodex accounts use <name>`: set default account and apply its auth snapshot to `~/.codex/auth.json`
- `polycodex accounts current`: print current account
- `polycodex accounts import [<name>]`: snapshot current `~/.codex/auth.json` into an account

Aliases: `ls`, `add`, `rm`, `rename`, `use`, `switch`, `current`, `which`, `import`.

### Running codex

- `polycodex codex`: runs interactive `codex` using the current account
- `polycodex run [<name>] -- <codex args...>`: run `codex` for an account
- `polycodex run --temp -- ...`: run without changing your default login

### Limits

`polycodex limits [<name>]` uses the Codex app-server RPC to fetch current usage limits per account.

Under the hood it runs:

- `codex -s read-only -a untrusted app-server`
- JSON-RPC methods: `initialize`, `initialized`, and `account/rateLimits/read`

If Codex app-server isn’t available in your installed `codex`, this command will fail.

## Autocomplete

`polycodex` can print shell completion scripts:

- Bash: `polycodex completion bash`
- Zsh: `polycodex completion zsh` (wraps bash completion via `bashcompinit`)
- Fish: `polycodex completion fish`

## Requirements

- `codex` must be installed and available in `PATH` (polycodex shells out to it).
- Node.js is required to run the published npm package.
