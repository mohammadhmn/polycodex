import path from "node:path";
import type { RateLimitSnapshot } from "./codex-rpc";
import { multicodexHomeDir } from "./paths";
import { safeReadFileUtf8, writeFileAtomicText } from "./lib/fs-atomic";

export type CachedLimitsProvider = "api" | "rpc";

type LimitsCache = {
  version: 1;
  accounts: Record<
    string,
    {
      snapshot: RateLimitSnapshot;
      fetchedAt: number;
      provider?: CachedLimitsProvider;
    }
  >;
};

function cachePath(): string {
  return path.join(multicodexHomeDir(), "limits-cache.json");
}

async function loadCache(): Promise<LimitsCache> {
  const raw = await safeReadFileUtf8(cachePath());
  if (!raw) return { version: 1, accounts: {} };
  try {
    const parsed = JSON.parse(raw) as LimitsCache;
    if (parsed && parsed.version === 1 && parsed.accounts) return parsed;
  } catch {
    // fallthrough
  }
  return { version: 1, accounts: {} };
}

async function saveCache(cache: LimitsCache): Promise<void> {
  await writeFileAtomicText(cachePath(), JSON.stringify(cache, null, 2) + "\n");
}

export async function getCachedLimits(
  account: string,
  ttlMs: number,
): Promise<{ snapshot: RateLimitSnapshot; ageMs: number; provider?: CachedLimitsProvider } | null> {
  const cache = await loadCache();
  const entry = cache.accounts[account];
  if (!entry) return null;
  const ageMs = Date.now() - entry.fetchedAt;
  if (ageMs > ttlMs) return null;
  return { snapshot: entry.snapshot, ageMs, provider: entry.provider };
}

export async function setCachedLimits(
  account: string,
  snapshot: RateLimitSnapshot,
  source: "live-api" | "live-rpc",
): Promise<void> {
  const cache = await loadCache();
  cache.accounts[account] = {
    snapshot,
    fetchedAt: Date.now(),
    provider: source === "live-api" ? "api" : "rpc",
  };
  await saveCache(cache);
}
