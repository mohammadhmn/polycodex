import { loadConfig, resolveAccountName } from "./config";
import { addAccount, currentAccount, listAccounts, removeAccount, useAccount } from "./profiles";
import { applyAccountAuthToDefault, importDefaultAuthToAccount } from "./authSwap";
import { runCodex } from "./runCodex";

function printHelp(): void {
  // Keep this concise; README is the main docs.
  console.log(`polycodex - multi-account wrapper for Codex CLI

Usage:
  polycodex profile add <name>
  polycodex profile list
  polycodex profile use <name>
  polycodex profile current
  polycodex profile rm <name> [--delete-data]

  polycodex auth import [--account <name>]
  polycodex auth apply <name> [--force]

  polycodex login  [--account <name>] [--] <codex login args...>
  polycodex logout [--account <name>] [--] <codex logout args...>
  polycodex status [--account <name>]

  polycodex run [--account <name>] [--force] [--restore] -- <codex args...>

Passthrough:
  polycodex <codex args...>    (runs codex using the current account)

Notes:
  - Use --account for polycodex account selection. Codex itself uses --profile, so polycodex avoids that flag.
  - polycodex only swaps ~/.codex/auth.json; everything else remains in ~/.codex (rules, skills, config, sessions, history).
`);
}

function die(message: string, exitCode = 1): never {
  console.error(message);
  process.exit(exitCode);
}

function popFlag(args: string[], flag: string): boolean {
  const idx = args.indexOf(flag);
  if (idx === -1) return false;
  args.splice(idx, 1);
  return true;
}

function popFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith("-")) die(`Missing value for ${flag}`);
  args.splice(idx, 2);
  return value;
}

function splitAtDoubleDash(args: string[]): { before: string[]; after: string[] } {
  const idx = args.indexOf("--");
  if (idx === -1) return { before: args.slice(), after: [] };
  return { before: args.slice(0, idx), after: args.slice(idx + 1) };
}

async function cmdProfile(rest: string[]): Promise<void> {
  const [action, ...tail] = rest;
  if (!action) die("Missing profile action. Try `polycodex profile list`.");

  if (action === "list") {
    const { accounts } = await listAccounts();
    if (!accounts.length) {
      console.log("No accounts configured.");
      return;
    }
    for (const a of accounts) {
      console.log(`${a.isCurrent ? "*" : " "} ${a.name}`);
    }
    return;
  }

  if (action === "add") {
    const name = tail[0];
    if (!name) die("Missing account name. Usage: `polycodex profile add <name>`");
    await addAccount({ name });
    console.log(`Added account: ${name}`);
    return;
  }

  if (action === "use") {
    const name = tail[0];
    if (!name) die("Missing account name. Usage: `polycodex profile use <name>`");
    await useAccount(name);
    await applyAccountAuthToDefault(name, false);
    console.log(`Current account: ${name}`);
    return;
  }

  if (action === "current") {
    const name = await currentAccount();
    if (!name) die("No current account set. Run `polycodex profile add <name>`.", 2);
    console.log(name);
    return;
  }

  if (action === "rm") {
    const name = tail[0];
    if (!name) die("Missing account name. Usage: `polycodex profile rm <name>`");
    const deleteData = popFlag(tail, "--delete-data");
    await removeAccount({ name, deleteData });
    console.log(`Removed account: ${name}`);
    return;
  }

  die(`Unknown profile action: ${action}`);
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
}): Promise<void> {
  const config = await loadConfig();
  const resolvedAccount = resolveAccountName(config, account);
  if (!(resolvedAccount in config.accounts)) die(`Unknown account: ${resolvedAccount}`);

  const exitCode = await runCodex({
    account: resolvedAccount,
    codexArgs,
    forceLock,
    restorePreviousAuth,
  });
  process.exit(exitCode);
}

async function cmdLogin(rest: string[]): Promise<void> {
  const { before, after } = splitAtDoubleDash(rest);
  const account = popFlagValue(before, "--account");
  const codexArgs = ["login", ...before, ...after];
  await runCodexWithAccount({ account, codexArgs, forceLock: false, restorePreviousAuth: false });
}

async function cmdLogout(rest: string[]): Promise<void> {
  const { before, after } = splitAtDoubleDash(rest);
  const account = popFlagValue(before, "--account");
  const codexArgs = ["logout", ...before, ...after];
  await runCodexWithAccount({ account, codexArgs, forceLock: false, restorePreviousAuth: false });
}

async function cmdStatus(rest: string[]): Promise<void> {
  const account = popFlagValue(rest, "--account");
  const codexArgs = ["login", "status", ...rest];
  // Status should not change the currently-active default auth by default.
  await runCodexWithAccount({ account, codexArgs, forceLock: false, restorePreviousAuth: true });
}

async function cmdRun(rest: string[]): Promise<void> {
  const { before, after } = splitAtDoubleDash(rest);
  if (!rest.includes("--")) {
    die("`polycodex run` requires `--` before codex args. Example: polycodex run -- codex --help");
  }
  const account = popFlagValue(before, "--account");
  const force = popFlag(before, "--force");
  const restore = popFlag(before, "--restore");
  if (before.length) die(`Unknown polycodex flag(s): ${before.join(" ")}`);
  await runCodexWithAccount({
    account,
    codexArgs: after,
    forceLock: force,
    restorePreviousAuth: restore,
  });
}

async function cmdAuth(rest: string[]): Promise<void> {
  const [action, ...tail] = rest;
  if (!action) die("Missing auth action. Try `polycodex auth import`.");

  if (action === "import") {
    const account = popFlagValue(tail, "--account");
    if (tail.length) die(`Unknown polycodex flag(s): ${tail.join(" ")}`);

    const config = await loadConfig();
    const resolved = resolveAccountName(config, account);
    if (!(resolved in config.accounts)) die(`Unknown account: ${resolved}`);

    await importDefaultAuthToAccount(resolved);
    console.log(`Imported ~/.codex/auth.json into account: ${resolved}`);
    return;
  }

  if (action === "apply") {
    const name = tail[0];
    if (!name) die("Missing account name. Usage: `polycodex auth apply <name>`");
    const flags = tail.slice(1);
    const force = popFlag(flags, "--force");
    if (flags.length) die(`Unknown polycodex flag(s): ${flags.join(" ")}`);

    const config = await loadConfig();
    if (!(name in config.accounts)) die(`Unknown account: ${name}`);
    await applyAccountAuthToDefault(name, force);
    console.log(`Applied account auth to ~/.codex/auth.json: ${name}`);
    return;
  }

  die(`Unknown auth action: ${action}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (!args.length) {
    // Launch codex interactive with current account.
    await runCodexWithAccount({ codexArgs: [], forceLock: false, restorePreviousAuth: false });
    return;
  }

  const cmd = args[0]!;
  const rest = args.slice(1);

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }

  if (cmd === "--version" || cmd === "-V") {
    console.log("polycodex 0.1.0");
    return;
  }

  if (cmd === "profile") {
    await cmdProfile(rest);
    return;
  }

  if (cmd === "login") {
    await cmdLogin(rest);
    return;
  }

  if (cmd === "logout") {
    await cmdLogout(rest);
    return;
  }

  if (cmd === "status") {
    await cmdStatus(rest);
    return;
  }

  if (cmd === "run") {
    await cmdRun(rest);
    return;
  }

  if (cmd === "auth") {
    await cmdAuth(rest);
    return;
  }

  // Passthrough to codex args (do not parse polycodex flags here to avoid conflicts with codex flags).
  await runCodexWithAccount({ codexArgs: args, forceLock: false, restorePreviousAuth: false });
}

await main().catch(async (error) => {
  // Best-effort: avoid printing huge stacks by default.
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);

  // If shared-state lock was held, it gets released in finally blocks.
  process.exit(1);
});
