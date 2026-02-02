import { loadConfig } from "./config";

export type CompletionContext = {
  words: string[];
  cword: number;
  current: string;
};

function uniqPrefixMatch(candidates: string[], prefix: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (!c.startsWith(prefix)) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out.sort();
}

async function listAccountNames(): Promise<string[]> {
  const cfg = await loadConfig();
  return Object.keys(cfg.accounts).sort();
}

export async function completePolycodex(ctx: CompletionContext): Promise<string[]> {
  const words = ctx.words[0] === "polycodex" ? ctx.words.slice(1) : ctx.words.slice();
  const cword = Math.max(0, Math.min(ctx.cword - (ctx.words[0] === "polycodex" ? 1 : 0), words.length));
  const cur = ctx.current ?? words[cword] ?? "";

  // Do not attempt to complete codex passthrough args after the `run --` delimiter.
  if (words[0] === "run" && words.includes("--")) return [];

  const topLevel = [
    "accounts",
    "account",
    "ls",
    "add",
    "rm",
    "rename",
    "use",
    "switch",
    "current",
    "which",
    "import",
    "run",
    "status",
    "whoami",
    "limits",
    "usage",
    "codex",
    "completion",
    "help",
    "--help",
    "-h",
    "--version",
    "-V",
  ];

  if (cword === 0) return uniqPrefixMatch(topLevel, cur);

  const cmd0 = words[0] ?? "";
  const prev = words[cword - 1] ?? "";

  const accountNames = await listAccountNames();

  // Common: complete account names after --account.
  if (prev === "--account") return uniqPrefixMatch(accountNames, cur);

  if (cmd0 === "accounts" || cmd0 === "account") {
    const subcommands = ["list", "add", "remove", "rm", "rename", "use", "switch", "current", "which", "import"];
    if (cword === 1) return uniqPrefixMatch(subcommands, cur);

    const sub = words[1] ?? "";
    if (sub === "add") return [];
    if (sub === "list" || sub === "current" || sub === "which") return [];

    if (sub === "use" || sub === "switch" || sub === "remove" || sub === "rm" || sub === "import") {
      if (cword === 2) return uniqPrefixMatch(accountNames, cur);
      return [];
    }

    if (sub === "rename") {
      if (cword === 2) return uniqPrefixMatch(accountNames, cur);
      return [];
    }

    return [];
  }

  if (cmd0 === "use" || cmd0 === "switch" || cmd0 === "rm" || cmd0 === "import") {
    if (cword === 1) return uniqPrefixMatch(accountNames, cur);
    return [];
  }

  if (cmd0 === "rename") {
    if (cword === 1) return uniqPrefixMatch(accountNames, cur);
    return [];
  }

  if (cmd0 === "run") {
    const flags = ["--account", "--temp", "--force", "--help", "-h", "--"];
    if (cur.startsWith("-")) return uniqPrefixMatch(flags, cur);
    if (cword === 1) return uniqPrefixMatch(accountNames, cur);
    if (prev === "run" && words[cword - 1] === "run") return uniqPrefixMatch(accountNames, cur);
    return [];
  }

  if (cmd0 === "status" || cmd0 === "whoami" || cmd0 === "limits" || cmd0 === "usage") {
    const flags =
      cmd0 === "limits" || cmd0 === "usage"
        ? ["--force", "--no-cache", "--ttl", "--help", "-h"]
        : ["--help", "-h"];
    if (cur.startsWith("-")) return uniqPrefixMatch(flags, cur);
    if (cword === 1) return uniqPrefixMatch(accountNames, cur);
    return [];
  }

  if (cmd0 === "completion") {
    if (cword === 1) return uniqPrefixMatch(["bash", "zsh", "fish"], cur);
    return [];
  }

  return [];
}
