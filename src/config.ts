import fs from "node:fs/promises";
import path from "node:path";
import { configPath, polycodexHomeDir } from "./paths";
import type { PolyConfigAny, PolyConfigV1Legacy, PolyConfigV2 } from "./types";

function defaultConfig(): PolyConfigV2 {
  return {
    version: 2,
    accounts: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateConfig(maybe: unknown): PolyConfigAny {
  if (!isRecord(maybe)) return defaultConfig();

  if (maybe.version === 2) {
    const currentAccount =
      typeof maybe.currentAccount === "string" && maybe.currentAccount.trim()
        ? maybe.currentAccount
        : undefined;

    const accounts: PolyConfigV2["accounts"] = {};
    if (isRecord(maybe.accounts)) {
      for (const [name, raw] of Object.entries(maybe.accounts)) {
        // Keep account objects extensible; ignore unknown/legacy keys.
        accounts[name] = isRecord(raw) ? {} : {};
      }
    }

    return { version: 2, currentAccount, accounts };
  }

  if (maybe.version === 1) {
    const sharedState = typeof maybe.sharedState === "boolean" ? maybe.sharedState : true;
    const currentAccount =
      typeof maybe.currentAccount === "string" && maybe.currentAccount.trim()
        ? maybe.currentAccount
        : undefined;

    const accounts: PolyConfigV1Legacy["accounts"] = {};
    if (isRecord(maybe.accounts)) {
      for (const [name, raw] of Object.entries(maybe.accounts)) {
        if (!isRecord(raw)) continue;
        const codexHome = typeof raw.codexHome === "string" ? raw.codexHome : "";
        if (!codexHome.trim()) continue;
        accounts[name] = { codexHome };
      }
    }

    return { version: 1, sharedState, currentAccount, accounts };
  }

  return defaultConfig();
}

function migrateToV2(anyConfig: PolyConfigAny): PolyConfigV2 {
  if (anyConfig.version === 2) return anyConfig;

  // Migrate legacy v1 to v2 (auth-only is the only supported mode).
  const accounts: PolyConfigV2["accounts"] = {};
  for (const [name] of Object.entries(anyConfig.accounts)) {
    accounts[name] = {};
  }

  return {
    version: 2,
    currentAccount: anyConfig.currentAccount,
    accounts,
  };
}

export async function loadConfig(): Promise<PolyConfigV2> {
  const filePath = configPath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return migrateToV2(validateConfig(JSON.parse(raw)));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return defaultConfig();
    throw error;
  }
}

export async function saveConfig(config: PolyConfigV2): Promise<void> {
  const root = polycodexHomeDir();
  await fs.mkdir(root, { recursive: true });

  const filePath = configPath();
  const tmpPath = `${filePath}.tmp`;
  const data = JSON.stringify(config, null, 2) + "\n";

  await fs.writeFile(tmpPath, data, { mode: 0o600 });
  await fs.rename(tmpPath, filePath);
}

export function resolveAccountName(config: PolyConfigV2, requested?: string): string {
  if (requested && requested.trim()) return requested;
  if (config.currentAccount && config.currentAccount in config.accounts) return config.currentAccount;

  const first = Object.keys(config.accounts)[0];
  if (first) return first;

  throw new Error(
    "No account configured. Run `polycodex accounts add <name>` and then `polycodex accounts use <name>`.",
  );
}

export async function ensureAccountExists(config: PolyConfigV2, accountName: string): Promise<void> {
  if (accountName in config.accounts) return;
  throw new Error(`Unknown account: ${accountName}. Run \`polycodex accounts list\`.`);
}

export function isValidAccountName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

export function normalizeAccountName(name: string): string {
  return name.trim();
}

export function isSamePath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}
