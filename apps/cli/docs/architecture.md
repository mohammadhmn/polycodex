# CLI Architecture

This document outlines the internal module boundaries for `multicodex` CLI.

## Entry and Command Wiring

- `src/cli.ts`: Commander setup, command handlers, and top-level process exit behavior.
- `src/command-spec.ts`: shared command/provider constants used by completion and CLI parsing.

## Account Management

- `src/config.ts`: config loading, validation, migration, and account resolution.
- `src/profiles.ts`: account CRUD operations.
- `src/account-meta.ts`: per-account metadata reads/writes.
- `src/auth-swap.ts`: lock-protected auth swapping and snapshot import/export.
- `src/lock.ts`: lock acquisition and stale lock detection.

## Usage / Limits

- `src/limits-service.ts`: orchestration layer for cache, provider selection, and fallback behavior.
- `src/limits.ts`: output row formatting and table rendering.
- `src/limits-cache.ts`: persisted usage cache.
- `src/codex-rpc.ts`: Codex RPC client and rate-limit fetch.
- `src/codex-usage-api.ts`: compatibility facade for API-based usage fetching.
- `src/usage/`: internals for API usage fetch:
  - `json.ts`: JSON coercion helpers
  - `parser.ts`: response/auth payload parsing
  - `auth-store.ts`: auth source loading and persistence
  - `token-refresh.ts`: refresh and timeout flow
  - `client.ts`: end-to-end API fetch flow

## Utilities

- `src/lib/fs-atomic.ts`: safe read helpers and atomic file writes.
- `src/cli-output.ts`: shared CLI JSON/output helpers.
- `src/completion.ts`: shell completion suggestion engine.
- `src/run-codex.ts`: `codex` process execution wrappers.

## Stability Contract

- Public CLI commands, aliases, flags, JSON envelope shape, and exit code behavior should remain backward compatible.
- `src/codex-usage-api.ts` exports are kept stable for callers/tests even as internals evolve.
