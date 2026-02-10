# How multicodex works

`multicodex` is a small wrapper around the `codex` CLI that adds multiple “accounts” (logins) and switching between them.

## Key idea

Codex stores its current login state in:

- `~/.codex/auth.json`

Codex also stores everything else in `~/.codex` (rules, skills, config, sessions, history, etc).

`multicodex` **does not change** where Codex keeps its data. It keeps using `~/.codex` as-is.

Instead, `multicodex` implements account switching by saving and restoring different versions of `~/.codex/auth.json`.

## Where multicodex stores accounts

Multicodex stores one auth snapshot per account:

- `~/.config/multicodex/accounts/<name>/auth.json`

and a small config file:

- `~/.config/multicodex/config.json`

You can override the root with `MULTICODEX_HOME`.

## Locking / safety

While `codex` is running, `multicodex` prevents other `multicodex` processes from swapping auth mid-session using a lock directory:

- `~/.config/multicodex/locks/auth.lockdir`

If you see “locked by …”, it usually means another `multicodex`-managed Codex session is still running.

If the previous process crashed and left a stale lock, you can retry with `--force` (e.g. `multicodex run --force -- ...`).

## What happens when you run codex through multicodex

For commands that run `codex` (including passthrough, `run`, `status`, and `limits`):

1) Acquire the auth lock
2) Replace `~/.codex/auth.json` with the selected account’s snapshot (or delete it if that account has no snapshot yet)
3) Spawn `codex ...` normally (no `CODEX_HOME` override)
4) After `codex` exits, copy the resulting `~/.codex/auth.json` back into the selected account’s snapshot (keeps refreshed tokens)
5) Release the lock

### The `--temp` flag

`multicodex run --temp -- ...` restores the previous `~/.codex/auth.json` after the command completes.

Use this for one-off commands where you don’t want to permanently switch your default Codex login.

## Commands

### Accounts

- `multicodex accounts add <name>`: create an account entry (no login happens yet)
- `multicodex accounts list`: list accounts (with cached status/metadata)
- `multicodex accounts use <name>`: set default account and apply its auth snapshot to `~/.codex/auth.json`
- `multicodex accounts current`: print current account
- `multicodex accounts import [<name>]`: snapshot current `~/.codex/auth.json` into an account

Aliases: `ls`, `add`, `rm`, `rename`, `use`, `switch`, `current`, `which`, `import`.

### Running codex

- `multicodex codex`: runs interactive `codex` using the current account
- `multicodex run [<name>] -- <codex args...>`: run `codex` for an account
- `multicodex run --temp -- ...`: run without changing your default login

### Limits

`multicodex limits [<name>]` supports provider modes:

- `--provider auto` (default): OpenUsage-style usage API first, then RPC fallback.
- `--provider api`: only `GET https://chatgpt.com/backend-api/wham/usage`.
- `--provider rpc`: only Codex app-server RPC.

API mode refreshes OAuth tokens with:

- `POST https://auth.openai.com/oauth/token`

Under the hood it runs:

- `codex -s read-only -a untrusted app-server`
- JSON-RPC methods: `initialize`, `initialized`, and `account/rateLimits/read`

If Codex app-server isn’t available in your installed `codex`, `--provider rpc` fails, while `--provider auto` can still succeed via API.

Caching: results are cached for 300 seconds by default. Use `--refresh` to force live refetch, `--no-cache` to disable cache usage, or `--ttl <seconds>` to change the TTL.

## Autocomplete

`multicodex` can print shell completion scripts:

- Bash: `multicodex completion bash`
- Zsh: `multicodex completion zsh` (native zsh completion; requires `compinit`)
  - Install helper: `multicodex completion zsh --install`
- Fish: `multicodex completion fish`

## Requirements

- `codex` must be installed and available in `PATH` (multicodex shells out to it).
- Node.js is required to run the published npm package.
