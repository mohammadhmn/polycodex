import fs from "node:fs/promises";
import { Command } from "commander";

import { ensureAccountExists, loadConfig, resolveAccountName, saveConfig, normalizeAccountName } from "./config";
import { addAccount, currentAccount, listAccounts, removeAccount, renameAccount } from "./profiles";
import { applyAccountAuthToDefault, importDefaultAuthToAccount } from "./auth-swap";
import { runCodex, runCodexCapture } from "./run-codex";
import { accountAuthPath } from "./paths";
import { readAccountMeta, updateAccountMeta } from "./account-meta";
import { completeMulticodex } from "./completion";
import { renderLimitsTable } from "./limits";
import { executeLimitsQuery, type LimitsJsonEnvelope } from "./limits-service";
import { LIMITS_PROVIDERS, type LimitsProvider } from "./command-spec";
import { padRight, toErrorMessage, truncateOneLine, wantsJsonArgv, writeJson, type JsonEnvelope } from "./cli-output";

const DEFAULT_LIMITS_CACHE_TTL_SECONDS = 300;

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveExistingAccount(requested?: string): Promise<string> {
  const config = await loadConfig();
  const name = resolveAccountName(config, requested);
  if (!(name in config.accounts)) throw new Error(`Unknown account: ${name}`);
  return name;
}

async function setCurrentAccountAndApplyAuth(
  name: string,
  opts: { forceLock: boolean },
): Promise<void> {
  const account = normalizeAccountName(name);
  const config = await loadConfig();
  await ensureAccountExists(config, account);
  await applyAccountAuthToDefault(account, opts.forceLock);
  config.currentAccount = account;
  await saveConfig(config);
  await updateAccountMeta(account, { lastUsedAt: new Date().toISOString() });
}

async function runCodexWithAccount({
  account,
  codexArgs,
  forceLock,
  restorePreviousAuth,
}: {
  account?: string;
  codexArgs: string[];
  forceLock: boolean;
  restorePreviousAuth: boolean;
}): Promise<never> {
  const resolved = await resolveExistingAccount(account);
  await updateAccountMeta(resolved, { lastUsedAt: new Date().toISOString() });
  const exitCode = await runCodex({ account: resolved, codexArgs, forceLock, restorePreviousAuth });
  process.exit(exitCode);
}

type AccountsListEntry = {
  name: string;
  isCurrent: boolean;
  hasAuth: boolean;
  lastUsedAt?: string;
  lastLoginStatus?: string;
};

async function listAccountsDetailed(): Promise<{ currentAccount?: string; accounts: AccountsListEntry[] }> {
  const { accounts } = await listAccounts();
  const detailed = await Promise.all(
    accounts.map(async (a) => {
      const [meta, hasAuth] = await Promise.all([readAccountMeta(a.name), fileExists(accountAuthPath(a.name))]);
      return {
        name: a.name,
        isCurrent: a.isCurrent,
        hasAuth,
        lastUsedAt: meta?.lastUsedAt,
        lastLoginStatus: meta?.lastLoginStatus,
      } satisfies AccountsListEntry;
    }),
  );

  return { currentAccount: accounts.find((a) => a.isCurrent)?.name, accounts: detailed };
}

async function listAccountsCommand(opts: { json: boolean }): Promise<void> {
  const { accounts, currentAccount } = await listAccountsDetailed();
  if (!accounts.length) {
    if (opts.json) {
      const payload: JsonEnvelope<{ accounts: AccountsListEntry[]; currentAccount?: string }> = {
        schemaVersion: 1,
        command: "accounts.list",
        ok: true,
        data: { accounts: [], currentAccount },
      };
      writeJson(payload);
      return;
    }
    console.log("No accounts configured. Run: multicodex accounts add <name>");
    return;
  }

  if (opts.json) {
    const payload: JsonEnvelope<{ accounts: AccountsListEntry[]; currentAccount?: string }> = {
      schemaVersion: 1,
      command: "accounts.list",
      ok: true,
      data: { accounts, currentAccount },
    };
    writeJson(payload);
    return;
  }

  const nameWidth = Math.max(...accounts.map((a) => a.name.length), 4);
  const statusWidth = 22;
  for (const a of accounts) {
    const rawStatus = a.lastLoginStatus ? truncateOneLine(a.lastLoginStatus, statusWidth) : a.hasAuth ? "auth saved" : "no auth";
    const last = a.lastUsedAt ?? "never";
    const marker = a.isCurrent ? "*" : " ";
    console.log(
      `${marker} ${padRight(a.name, nameWidth)}  ${padRight(rawStatus, statusWidth)}  last used: ${last}`,
    );
  }
}

async function statusCommand(opts: { name?: string; json: boolean }): Promise<never> {
  const account = await resolveExistingAccount(opts.name);
  const result = await runCodexCapture({
    account,
    codexArgs: ["login", "status"],
    forceLock: false,
    restorePreviousAuth: true,
  });

  if (opts.json) {
    const payload: JsonEnvelope<{
      account: string;
      exitCode: number;
      stdout: string;
      stderr: string;
      output: string;
      checkedAt: string;
    }> = {
      schemaVersion: 1,
      command: "status",
      ok: result.exitCode === 0,
      data: {
        account,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        output: (result.stdout + result.stderr).trim(),
        checkedAt: new Date().toISOString(),
      },
    };
    writeJson(payload);
  } else {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  const output = (result.stdout + result.stderr).trim();

  await updateAccountMeta(account, {
    lastUsedAt: new Date().toISOString(),
    lastLoginStatus: output || undefined,
    lastLoginCheckedAt: new Date().toISOString(),
  });

  process.exit(result.exitCode);
}

function parseLimitsProvider(raw: string | undefined): LimitsProvider {
  if (!raw) return "auto";
  if ((LIMITS_PROVIDERS as readonly string[]).includes(raw)) return raw as LimitsProvider;
  throw new Error(`Invalid --provider value: ${raw}. Use one of: ${LIMITS_PROVIDERS.join(", ")}.`);
}

function writeNoCurrentAccountJsonAndExit(): never {
  const payload: JsonEnvelope<null> = {
    schemaVersion: 1,
    command: "accounts.current",
    ok: false,
    error: { message: "No current account set. Run `multicodex accounts add <name>`.", code: "NO_CURRENT_ACCOUNT" },
  };
  writeJson(payload);
  process.exit(2);
}

async function addAccountCommand(name: string, opts: { json?: boolean }): Promise<void> {
  const result = await addAccount({ name });
  if (opts.json) {
    const payload: JsonEnvelope<{ account: string; currentAccount?: string }> = {
      schemaVersion: 1,
      command: "accounts.add",
      ok: true,
      data: { account: result.account, currentAccount: result.config.currentAccount },
    };
    writeJson(payload);
    return;
  }
  console.log(`Added account: ${result.account}`);
}

async function removeAccountCommand(name: string, opts: { deleteData?: boolean; json?: boolean }): Promise<void> {
  const config = await removeAccount({ name, deleteData: Boolean(opts.deleteData) });
  if (opts.json) {
    const payload: JsonEnvelope<{ removedAccount: string; currentAccount?: string }> = {
      schemaVersion: 1,
      command: "accounts.remove",
      ok: true,
      data: { removedAccount: normalizeAccountName(name), currentAccount: config.currentAccount },
    };
    writeJson(payload);
    return;
  }
  console.log(`Removed account: ${normalizeAccountName(name)}`);
}

async function renameAccountCommand(oldName: string, newName: string, opts: { json?: boolean }): Promise<void> {
  const config = await renameAccount(oldName, newName);
  if (opts.json) {
    const payload: JsonEnvelope<{ from: string; to: string; currentAccount?: string }> = {
      schemaVersion: 1,
      command: "accounts.rename",
      ok: true,
      data: { from: normalizeAccountName(oldName), to: normalizeAccountName(newName), currentAccount: config.currentAccount },
    };
    writeJson(payload);
    return;
  }
  console.log(`Renamed account: ${normalizeAccountName(oldName)} -> ${normalizeAccountName(newName)}`);
}

async function useAccountCommand(name: string, opts: { force?: boolean; json?: boolean }): Promise<void> {
  await setCurrentAccountAndApplyAuth(name, { forceLock: Boolean(opts.force) });
  if (opts.json) {
    const payload: JsonEnvelope<{ currentAccount: string }> = {
      schemaVersion: 1,
      command: "accounts.use",
      ok: true,
      data: { currentAccount: normalizeAccountName(name) },
    };
    writeJson(payload);
    return;
  }
  console.log(`Now using: ${normalizeAccountName(name)}`);
}

async function currentAccountCommand(opts: { json?: boolean }): Promise<void> {
  const name = await currentAccount();
  if (!name) {
    if (opts.json) {
      writeNoCurrentAccountJsonAndExit();
    }
    console.error("No current account set. Run: multicodex accounts add <name>");
    process.exit(2);
  }
  if (opts.json) {
    const payload: JsonEnvelope<{ currentAccount: string }> = {
      schemaVersion: 1,
      command: "accounts.current",
      ok: true,
      data: { currentAccount: name },
    };
    writeJson(payload);
    return;
  }
  console.log(name);
}

async function importAccountCommand(name: string | undefined, opts: { force?: boolean; json?: boolean }): Promise<void> {
  const account = await resolveExistingAccount(name);
  await importDefaultAuthToAccount(account, Boolean(opts.force));
  await updateAccountMeta(account, { lastUsedAt: new Date().toISOString() });
  if (opts.json) {
    const payload: JsonEnvelope<{ account: string }> = {
      schemaVersion: 1,
      command: "accounts.import",
      ok: true,
      data: { account },
    };
    writeJson(payload);
    return;
  }
  console.log(`Imported ~/.codex/auth.json into account: ${account}`);
}

const program = new Command();
program
  .name("multicodex")
  .description("Manage multiple Codex accounts (OAuth)")
  // Keep in sync with package.json manually.
  .version("0.1.10", "-V, --version", "output the version number")
  .enablePositionalOptions()
  .showHelpAfterError(true)
  .showSuggestionAfterError(true);

// accounts
const accounts = program
  .command("accounts")
  .alias("account")
  .description("Manage accounts")
  .option("--json", "output JSON")
  .action(async (opts: { json?: boolean }) => {
    await listAccountsCommand({ json: Boolean(opts.json) });
  });

accounts
  .command("list")
  .description("List accounts")
  .option("--json", "output JSON")
  .action(async (opts: { json?: boolean }) => await listAccountsCommand({ json: Boolean(opts.json) }));

accounts
  .command("add <name>")
  .description("Add an account")
  .option("--json", "output JSON")
  .action(async (name: string, opts: { json?: boolean }) => await addAccountCommand(name, opts));

accounts
  .command("remove <name>")
  .alias("rm")
  .description("Remove an account")
  .option("--delete-data", "delete stored account data")
  .option("--json", "output JSON")
  .action(async (name: string, opts: { deleteData?: boolean; json?: boolean }) => await removeAccountCommand(name, opts));

accounts
  .command("rename <old> <new>")
  .description("Rename an account")
  .option("--json", "output JSON")
  .action(async (oldName: string, newName: string, opts: { json?: boolean }) => await renameAccountCommand(oldName, newName, opts));

accounts
  .command("use <name>")
  .alias("switch")
  .description("Set current account and apply its auth to ~/.codex/auth.json")
  .option("--force", "reclaim a stale lock")
  .option("--json", "output JSON")
  .action(async (name: string, opts: { force?: boolean; json?: boolean }) => await useAccountCommand(name, opts));

accounts
  .command("current")
  .alias("which")
  .description("Print current account")
  .option("--json", "output JSON")
  .action(async (opts: { json?: boolean }) => await currentAccountCommand(opts));

accounts
  .command("import [name]")
  .description("Import current ~/.codex/auth.json into an account snapshot")
  .option("--force", "reclaim a stale lock")
  .option("--json", "output JSON")
  .action(async (name: string | undefined, opts: { force?: boolean; json?: boolean }) => await importAccountCommand(name, opts));

// aliases for common accounts commands
program
  .command("ls")
  .description("Alias for `accounts list`")
  .option("--json", "output JSON")
  .action(async (opts: { json?: boolean }) => await listAccountsCommand({ json: Boolean(opts.json) }));
program
  .command("add <name>")
  .description("Alias for `accounts add`")
  .option("--json", "output JSON")
  .action(async (name: string, opts: { json?: boolean }) => await addAccountCommand(name, opts));
program
  .command("rm <name>")
  .description("Alias for `accounts remove`")
  .option("--delete-data", "delete stored account data")
  .option("--json", "output JSON")
  .action(async (name: string, opts: { deleteData?: boolean; json?: boolean }) => await removeAccountCommand(name, opts));
program
  .command("rename <old> <new>")
  .description("Alias for `accounts rename`")
  .option("--json", "output JSON")
  .action(async (a: string, b: string, opts: { json?: boolean }) => await renameAccountCommand(a, b, opts));
program
  .command("use <name>")
  .description("Alias for `accounts use`")
  .option("--force", "reclaim a stale lock")
  .option("--json", "output JSON")
  .action(async (name: string, opts: { force?: boolean; json?: boolean }) => await useAccountCommand(name, opts));
program
  .command("switch <name>")
  .description("Alias for `accounts use`")
  .option("--force", "reclaim a stale lock")
  .option("--json", "output JSON")
  .action(async (name: string, opts: { force?: boolean; json?: boolean }) => await useAccountCommand(name, opts));
program
  .command("current")
  .description("Alias for `accounts current`")
  .option("--json", "output JSON")
  .action(async (opts: { json?: boolean }) => await currentAccountCommand(opts));
program
  .command("which")
  .description("Alias for `accounts current`")
  .option("--json", "output JSON")
  .action(async (opts: { json?: boolean }) => await currentAccountCommand(opts));
program
  .command("import [name]")
  .description("Alias for `accounts import`")
  .option("--force", "reclaim a stale lock")
  .option("--json", "output JSON")
  .action(async (name: string | undefined, opts: { force?: boolean; json?: boolean }) => await importAccountCommand(name, opts));

// run
program
  .command("run [name]")
  .description("Run `codex` for an account (pass codex args after --)")
  .option("--account <name>", "account name (alternative to positional)")
  .option("--temp", "restore previous ~/.codex/auth.json after command finishes")
  .option("--force", "reclaim a stale lock")
  .passThroughOptions()
  .allowUnknownOption(true)
  .action(async (name: string | undefined, opts: { account?: string; temp?: boolean; force?: boolean }) => {
    const account = opts.account ?? name;
    const idx = process.argv.indexOf("--");
    if (idx === -1) throw new Error("Usage: multicodex run [<name>] [--temp] [--force] -- <codex args...>");
    const codexArgs = process.argv.slice(idx + 1);
    const finalCodexArgs = codexArgs[0] === "codex" ? codexArgs.slice(1) : codexArgs;
    await runCodexWithAccount({
      account,
      codexArgs: finalCodexArgs,
      forceLock: Boolean(opts.force),
      restorePreviousAuth: Boolean(opts.temp),
    });
  });

// status / whoami
program
  .command("status [name]")
  .description("Show login status for an account (runs `codex login status`)")
  .option("--account <name>", "account name (alternative to positional)")
  .option("--json", "output JSON")
  .action(async (name: string | undefined, opts: { account?: string; json?: boolean }) => {
    if (opts.account && name) throw new Error("Use either a positional [name] or --account, not both.");
    await statusCommand({ name: opts.account ?? name, json: Boolean(opts.json) });
  });

program
  .command("whoami [name]")
  .description("Alias for `status`")
  .option("--account <name>", "account name (alternative to positional)")
  .option("--json", "output JSON")
  .action(async (name: string | undefined, opts: { account?: string; json?: boolean }) => {
    if (opts.account && name) throw new Error("Use either a positional [name] or --account, not both.");
    await statusCommand({ name: opts.account ?? name, json: Boolean(opts.json) });
  });

// limits
program
  .command("limits [name]")
  .alias("usage")
  .description("Show usage limits via OpenUsage-style API (with RPC fallback)")
  .option("--account <name>", "account name (alternative to positional)")
  .option("--provider <provider>", `usage provider: ${LIMITS_PROVIDERS.join("|")} (default: auto)`)
  .option("--force", "reclaim a stale lock")
  .option("--no-cache", "disable cached results")
  .option("--refresh", "force refetch live values (bypass cache)")
  .option("--ttl <seconds>", `cache TTL in seconds (default: ${DEFAULT_LIMITS_CACHE_TTL_SECONDS})`, (v: string) => Number.parseFloat(v))
  .option("--json", "output JSON")
  .action(async (name: string | undefined, opts: { account?: string; provider?: string; force?: boolean; cache?: boolean; refresh?: boolean; ttl?: number; json?: boolean }) => {
    if (opts.account && name) throw new Error("Use either a positional [name] or --account, not both.");
    const provider = parseLimitsProvider(opts.provider);
    const forceLock = Boolean(opts.force);
    const useCache = opts.cache !== false && opts.refresh !== true;
    const ttlSeconds = Number.isFinite(opts.ttl) ? Math.max(0, opts.ttl ?? 0) : DEFAULT_LIMITS_CACHE_TTL_SECONDS;
    const ttlMs = ttlSeconds * 1000;
    const requested = opts.account ?? name;
    const targets = requested
      ? [await resolveExistingAccount(requested)]
      : (await listAccounts()).accounts.map((a) => a.name);

    if (!targets.length) {
      if (opts.json) {
        const payload: JsonEnvelope<null> = {
          schemaVersion: 1,
          command: "limits",
          ok: false,
          error: { message: "No accounts configured. Run `multicodex accounts add <name>`.", code: "NO_ACCOUNTS" },
        };
        writeJson(payload);
        process.exitCode = 2;
        return;
      }
      console.log("No accounts configured. Run: multicodex accounts add <name>");
      return;
    }

    const { rows, results, errors, hadError } = await executeLimitsQuery({
      provider,
      targets,
      forceLock,
      useCache,
      ttlMs,
      onFetching: opts.json ? undefined : (account) => console.error(`Fetching limits for ${account}...`),
    });
    if (opts.json) {
      const payload: LimitsJsonEnvelope = {
        schemaVersion: 1,
        command: "limits",
        ok: !hadError,
        data: { results, errors },
      };
      writeJson(payload);
      process.exitCode = hadError ? 1 : 0;
      return;
    }

    if (rows.length) {
      const lines = renderLimitsTable(rows);
      for (const line of lines) console.log(line);
    }
    if (errors.length) {
      for (const err of errors) console.error(`${err.account}: ${err.message}`);
    }
    if (hadError) process.exitCode = 1;
  });

program
  .command("completion <shell>")
  .description("Print shell completion script (bash|zsh|fish)")
  .option("--install", "install completion for current user (zsh only)")
  .action(async (shell: string, opts: { install?: boolean }) => {
    if (shell === "bash") {
      process.stdout.write(
        [
          "# bash completion for multicodex",
          "",
          "_multicodex_complete() {",
          "  local IFS=$'\\n'",
          "  local -a suggestions",
          '  suggestions=($(multicodex __complete --cword "$COMP_CWORD" --current "$COMP_WORDS[$COMP_CWORD]" --words "${COMP_WORDS[@]}" 2>/dev/null))',
          '  COMPREPLY=($(compgen -W "${suggestions[*]}" -- "$COMP_WORDS[$COMP_CWORD]"))',
          "}",
          "",
          "complete -F _multicodex_complete multicodex mcodex",
          "",
        ].join("\n"),
      );
      return;
    }
    if (shell === "zsh") {
      const script = [
        "#compdef multicodex mcodex",
        "",
        "_multicodex_complete() {",
        "  local -a suggestions",
        "  local current=${words[CURRENT]}",
        "  local cword=$((CURRENT - 1))",
        "  suggestions=(${(@f)$(multicodex __complete --cword $cword --current \"$current\" --words \"${words[@]}\")})",
        "  compadd -a suggestions",
        "}",
        "",
        "compdef _multicodex_complete multicodex mcodex",
        "",
      ].join("\n");

      if (opts.install) {
        const os = await import("node:os");
        const path = await import("node:path");
        const fs = await import("node:fs/promises");
        const home = os.homedir();
        const targetDir = path.join(home, ".zsh", "completions");
        const targetFile = path.join(targetDir, "_multicodex");
        await fs.mkdir(targetDir, { recursive: true });
        await fs.writeFile(targetFile, script, { mode: 0o644 });
        console.log(`Installed Zsh completion to ${targetFile}`);
        console.log("Add this to ~/.zshrc if not already:");
        console.log(`  fpath=("${targetDir}" $fpath)`);
        console.log("  autoload -Uz compinit && compinit");
        return;
      }

      process.stdout.write(script);
      return;
    }
    if (shell === "fish") {
      process.stdout.write(
        [
          "# fish completion for multicodex",
          "function __multicodex_complete",
          "  set -l words (commandline -opc)",
          "  set -l cword (math (count $words) - 1)",
          "  set -l cur (commandline -ct)",
          "  multicodex __complete --cword $cword --current \"$cur\" --words $words",
          "end",
          "",
          "complete -c multicodex -f -a \"(__multicodex_complete)\"",
          "complete -c mcodex -f -a \"(__multicodex_complete)\"",
          "",
        ].join("\n"),
      );
      return;
    }
    console.error("Unsupported shell. Use: bash, zsh, fish");
    process.exit(2);
  });

// Hidden completion backend used by shell scripts.
program
  .command("__complete", { hidden: true })
  .description("Internal completion command")
  .requiredOption("--cword <n>", "current word index", (v: string) => Number.parseInt(v, 10))
  .option("--current <s>", "current token")
  .option("--words <words...>", "tokenized argv")
  .action(async (opts: { cword: number; current?: string; words?: string[] }) => {
    const words = opts.words ?? [];
    const current = typeof opts.current === "string" ? opts.current : words[opts.cword] ?? "";
    const suggestions = await completeMulticodex({ words, cword: opts.cword, current });
    process.stdout.write(suggestions.join("\n"));
    if (suggestions.length) process.stdout.write("\n");
  });

// passthrough: any unknown command -> treat as codex args
program
  .command("codex [args...]")
  .description("Explicit passthrough to codex using current account")
  .allowUnknownOption(true)
  .action(async (args: string[] | undefined) => {
    await runCodexWithAccount({ codexArgs: args ?? [], forceLock: false, restorePreviousAuth: false });
  });

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    // Default behavior: show multicodex info (do not start a codex session).
    await listAccountsCommand({ json: false });
    return;
  }

  await program.parseAsync(process.argv);
}

await main().catch((error) => {
  const message = toErrorMessage(error);
  if (wantsJsonArgv()) {
    const payload: JsonEnvelope<null> = {
      schemaVersion: 1,
      command: "error",
      ok: false,
      error: { message },
    };
    writeJson(payload);
    process.exit(1);
  }
  console.error(message);
  process.exit(1);
});
