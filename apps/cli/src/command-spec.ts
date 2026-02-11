export const LIMITS_PROVIDERS = ["auto", "api", "rpc"] as const;
export type LimitsProvider = (typeof LIMITS_PROVIDERS)[number];

export const TOP_LEVEL_COMMAND_SUGGESTIONS = [
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
] as const;

export const ACCOUNT_SUBCOMMAND_SUGGESTIONS = [
  "list",
  "add",
  "remove",
  "rm",
  "rename",
  "use",
  "switch",
  "current",
  "which",
  "import",
] as const;
