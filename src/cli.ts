import fs from "node:fs/promises";
import { Command } from "commander";

import { loadConfig, resolveAccountName } from "./config";
import { addAccount, currentAccount, listAccounts, removeAccount, renameAccount, useAccount } from "./profiles";
import { applyAccountAuthToDefault, importDefaultAuthToAccount, withAccountAuth } from "./authSwap";
import { runCodex, runCodexCapture } from "./runCodex";
import { accountAuthPath } from "./paths";
import { readAccountMeta, updateAccountMeta } from "./accountMeta";
import { completePolycodex } from "./completion";
import { fetchRateLimitsViaRpc } from "./codexRpc";
import { rateLimitsToRow, renderLimitsTable, type LimitsRow } from "./limits";
import { getCachedLimits, setCachedLimits } from "./limitsCache";

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

async function listAccountsCommand(): Promise<void> {
  const { accounts } = await listAccounts();
  if (!accounts.length) {
    console.log("No accounts configured. Run: polycodex accounts add <name>");
    return;
  }

  for (const a of accounts) {
    const meta = await readAccountMeta(a.name);
    const hasAuth = await fileExists(accountAuthPath(a.name));
    const status = meta?.lastLoginStatus ? meta.lastLoginStatus : hasAuth ? "auth saved" : "no auth";
    const last = meta?.lastUsedAt ?? "never";
    console.log(`${a.isCurrent ? "*" : " "} ${a.name}  ${status}  last used: ${last}`);
  }
}

async function statusCommand(name?: string): Promise<never> {
  const account = await resolveExistingAccount(name);
  const result = await runCodexCapture({
    account,
    codexArgs: ["login", "status"],
    forceLock: false,
    restorePreviousAuth: true,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const output = (result.stdout + result.stderr).trim();

  await updateAccountMeta(account, {
    lastUsedAt: new Date().toISOString(),
    lastLoginStatus: output || undefined,
    lastLoginCheckedAt: new Date().toISOString(),
  });

  process.exit(result.exitCode);
}

const program = new Command();
program
  .name("polycodex")
  .description("Manage multiple Codex accounts (OAuth)")
  // Keep in sync with package.json manually.
  .version("0.1.5", "-V, --version", "output the version number")
  .enablePositionalOptions()
  .showHelpAfterError(true)
  .showSuggestionAfterError(true);

// accounts
const accounts = program
  .command("accounts")
  .alias("account")
  .description("Manage accounts")
  .action(async () => {
    await listAccountsCommand();
  });

accounts
  .command("list")
  .description("List accounts")
  .action(listAccountsCommand);

accounts
  .command("add <name>")
  .description("Add an account")
  .action(async (name: string) => {
    await addAccount({ name });
    console.log(`Added account: ${name}`);
  });

accounts
  .command("remove <name>")
  .alias("rm")
  .description("Remove an account")
  .option("--delete-data", "delete stored account data")
  .action(async (name: string, opts: { deleteData?: boolean }) => {
    await removeAccount({ name, deleteData: Boolean(opts.deleteData) });
    console.log(`Removed account: ${name}`);
  });

accounts
  .command("rename <old> <new>")
  .description("Rename an account")
  .action(async (oldName: string, newName: string) => {
    await renameAccount(oldName, newName);
    console.log(`Renamed account: ${oldName} -> ${newName}`);
  });

accounts
  .command("use <name>")
  .alias("switch")
  .description("Set current account and apply its auth to ~/.codex/auth.json")
  .action(async (name: string) => {
    await useAccount(name);
    await applyAccountAuthToDefault(name, false);
    console.log(`Now using: ${name}`);
  });

accounts
  .command("current")
  .alias("which")
  .description("Print current account")
  .action(async () => {
    const name = await currentAccount();
    if (!name) {
      console.error("No current account set. Run: polycodex accounts add <name>");
      process.exit(2);
    }
    console.log(name);
  });

accounts
  .command("import [name]")
  .description("Import current ~/.codex/auth.json into an account snapshot")
  .action(async (name?: string) => {
    const account = await resolveExistingAccount(name);
    await importDefaultAuthToAccount(account);
    await updateAccountMeta(account, { lastUsedAt: new Date().toISOString() });
    console.log(`Imported ~/.codex/auth.json into account: ${account}`);
  });

// aliases for common accounts commands
program.command("ls").description("Alias for `accounts list`").action(listAccountsCommand);
program.command("add <name>").description("Alias for `accounts add`").action(async (name: string) => {
  await addAccount({ name });
  console.log(`Added account: ${name}`);
});
program
  .command("rm <name>")
  .description("Alias for `accounts remove`")
  .option("--delete-data", "delete stored account data")
  .action(async (name: string, opts: { deleteData?: boolean }) => {
    await removeAccount({ name, deleteData: Boolean(opts.deleteData) });
    console.log(`Removed account: ${name}`);
  });
program.command("rename <old> <new>").description("Alias for `accounts rename`").action(async (a, b) => {
  await renameAccount(a, b);
  console.log(`Renamed account: ${a} -> ${b}`);
});
program.command("use <name>").description("Alias for `accounts use`").action(async (name: string) => {
  await useAccount(name);
  await applyAccountAuthToDefault(name, false);
  console.log(`Now using: ${name}`);
});
program.command("switch <name>").description("Alias for `accounts use`").action(async (name: string) => {
  await useAccount(name);
  await applyAccountAuthToDefault(name, false);
  console.log(`Now using: ${name}`);
});
program.command("current").description("Alias for `accounts current`").action(async () => {
  const name = await currentAccount();
  if (!name) {
    console.error("No current account set. Run: polycodex accounts add <name>");
    process.exit(2);
  }
  console.log(name);
});
program.command("which").description("Alias for `accounts current`").action(async () => {
  const name = await currentAccount();
  if (!name) {
    console.error("No current account set. Run: polycodex accounts add <name>");
    process.exit(2);
  }
  console.log(name);
});
program.command("import [name]").description("Alias for `accounts import`").action(async (name?: string) => {
  const account = await resolveExistingAccount(name);
  await importDefaultAuthToAccount(account);
  await updateAccountMeta(account, { lastUsedAt: new Date().toISOString() });
  console.log(`Imported ~/.codex/auth.json into account: ${account}`);
});

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
    if (idx === -1) throw new Error("Usage: polycodex run [<name>] [--temp] [--force] -- <codex args...>");
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
  .action(async (name?: string) => {
    await statusCommand(name);
  });

program
  .command("whoami [name]")
  .description("Alias for `status`")
  .action(async (name?: string) => {
    await statusCommand(name);
  });

// limits
program
  .command("limits [name]")
  .alias("usage")
  .description("Show usage limits via Codex RPC")
  .option("--force", "reclaim a stale lock")
  .option("--no-cache", "disable cached results")
  .option("--ttl <seconds>", "cache TTL in seconds (default: 60)", (v: string) => Number.parseFloat(v))
  .action(async (name: string | undefined, opts: { force?: boolean; cache?: boolean; ttl?: number }) => {
    const forceLock = Boolean(opts.force);
    const useCache = opts.cache !== false;
    const ttlSeconds = Number.isFinite(opts.ttl) ? Math.max(0, opts.ttl ?? 0) : 60;
    const ttlMs = ttlSeconds * 1000;
    const targets = name
      ? [await resolveExistingAccount(name)]
      : (await listAccounts()).accounts.map((a) => a.name);

    if (!targets.length) {
      console.log("No accounts configured. Run: polycodex accounts add <name>");
      return;
    }

    let hadError = false;
    const rows: LimitsRow[] = [];
    const errors: Array<{ account: string; message: string }> = [];
    for (const account of targets) {
      try {
        if (useCache) {
          const cached = await getCachedLimits(account, ttlMs);
          if (cached) {
            const ageSec = Math.round(cached.ageMs / 1000);
            rows.push(rateLimitsToRow(cached.snapshot, account, `cached ${ageSec}s`));
            continue;
          }
        }

        console.error(`Fetching limits for ${account}...`);
        const snapshot = await withAccountAuth(
          { account, forceLock, restorePreviousAuth: true },
          async () => await fetchRateLimitsViaRpc(),
        );
        await setCachedLimits(account, snapshot);
        rows.push(rateLimitsToRow(snapshot, account, "live"));
      } catch (error) {
        hadError = true;
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ account, message });
      }
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
          "# bash completion for polycodex",
          "",
          "_polycodex_complete() {",
          "  local IFS=$'\\n'",
          "  local -a suggestions",
          '  suggestions=($(polycodex __complete --cword "$COMP_CWORD" --current "$COMP_WORDS[$COMP_CWORD]" --words "${COMP_WORDS[@]}" 2>/dev/null))',
          '  COMPREPLY=($(compgen -W "${suggestions[*]}" -- "$COMP_WORDS[$COMP_CWORD]"))',
          "}",
          "",
          "complete -F _polycodex_complete polycodex",
          "",
        ].join("\n"),
      );
      return;
    }
    if (shell === "zsh") {
      const script = [
        "#compdef polycodex",
        "",
        "_polycodex_complete() {",
        "  local -a suggestions",
        "  local current=${words[CURRENT]}",
        "  local cword=$((CURRENT - 1))",
        "  suggestions=(${(@f)$(polycodex __complete --cword $cword --current \"$current\" --words \"${words[@]}\")})",
        "  compadd -a suggestions",
        "}",
        "",
        "compdef _polycodex_complete polycodex",
        "",
      ].join("\n");

      if (opts.install) {
        const os = await import("node:os");
        const path = await import("node:path");
        const fs = await import("node:fs/promises");
        const home = os.homedir();
        const targetDir = path.join(home, ".zsh", "completions");
        const targetFile = path.join(targetDir, "_polycodex");
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
          "# fish completion for polycodex",
          "function __polycodex_complete",
          "  set -l words (commandline -opc)",
          "  set -l cword (math (count $words) - 1)",
          "  set -l cur (commandline -ct)",
          "  polycodex __complete --cword $cword --current \"$cur\" --words $words",
          "end",
          "",
          "complete -c polycodex -f -a \"(__polycodex_complete)\"",
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
    const suggestions = await completePolycodex({ words, cword: opts.cword, current });
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
    // Default behavior: show polycodex info (do not start a codex session).
    await listAccountsCommand();
    return;
  }

  await program.parseAsync(process.argv);
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
