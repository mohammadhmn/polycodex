import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { CreditsSnapshot, RateLimitSnapshot, RateLimitWindow } from "./codex-rpc";
import { defaultCodexAuthPath } from "./paths";

const execFileAsync = promisify(execFile);

const KEYCHAIN_SERVICE = "Codex Auth";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const REFRESH_URL = "https://auth.openai.com/oauth/token";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const REFRESH_AGE_MS = 8 * 24 * 60 * 60 * 1000;

const FIVE_HOURS_MINS = 300;
const WEEKLY_MINS = 7 * 24 * 60;

type JsonRecord = Record<string, unknown>;
export type FetchLike = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>;

type CodexTokens = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  account_id?: string;
};

type CodexAuthPayload = {
  OPENAI_API_KEY?: string | null;
  tokens?: CodexTokens;
  last_refresh?: string;
} & JsonRecord;

type AuthSource =
  | { kind: "file"; path: string }
  | { kind: "keychain" };

type LoadedAuth = {
  auth: CodexAuthPayload;
  source: AuthSource;
};

export type UsageApiResponseData = {
  rate_limit?: {
    primary_window?: JsonRecord;
    secondary_window?: JsonRecord;
  };
  code_review_rate_limit?: {
    primary_window?: JsonRecord;
  };
  credits?: JsonRecord;
};

export function parseUsageSnapshotFromWhamResponse(args: {
  headers: Headers;
  data: UsageApiResponseData;
  nowMs?: number;
}): RateLimitSnapshot {
  const nowSec = Math.floor((args.nowMs ?? Date.now()) / 1000);
  const rateLimit = asRecord(args.data.rate_limit);
  const primaryWindow = asRecord(rateLimit?.primary_window);
  const secondaryWindow = asRecord(rateLimit?.secondary_window);
  const reviewWindow = asRecord(asRecord(args.data.code_review_rate_limit)?.primary_window);

  const headerPrimary = readNumber(args.headers.get("x-codex-primary-used-percent"));
  const headerSecondary = readNumber(args.headers.get("x-codex-secondary-used-percent"));

  const primary = buildWindow({
    usedPercent: headerPrimary ?? readNumber(primaryWindow?.used_percent),
    windowDurationMins: readDurationMins(primaryWindow, FIVE_HOURS_MINS),
    resetsAt: readResetsAt(primaryWindow, nowSec),
  });

  const secondaryCandidate = secondaryWindow ?? reviewWindow;
  const secondary = buildWindow({
    usedPercent: headerSecondary ?? readNumber(secondaryWindow?.used_percent) ?? readNumber(reviewWindow?.used_percent),
    windowDurationMins: readDurationMins(secondaryCandidate, WEEKLY_MINS),
    resetsAt: readResetsAt(secondaryCandidate, nowSec),
  });

  const bodyCredits = asRecord(args.data.credits);
  const creditsFromHeader = readNumber(args.headers.get("x-codex-credits-balance"));
  const creditsFromBody = readNumber(bodyCredits?.balance);
  const hasCredits = readBoolean(bodyCredits?.has_credits);
  const unlimited = readBoolean(bodyCredits?.unlimited);

  let credits: CreditsSnapshot | null = null;
  if (
    typeof creditsFromHeader === "number"
    || typeof creditsFromBody === "number"
    || typeof hasCredits === "boolean"
    || typeof unlimited === "boolean"
  ) {
    credits = {
      hasCredits,
      unlimited,
      balance:
        typeof creditsFromHeader === "number"
          ? String(creditsFromHeader)
          : typeof creditsFromBody === "number"
            ? String(creditsFromBody)
            : null,
    };
  }

  return {
    primary,
    secondary,
    credits,
  };
}

function buildWindow(window: {
  usedPercent?: number | null;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
}): RateLimitWindow | null {
  if (
    typeof window.usedPercent !== "number"
    && typeof window.windowDurationMins !== "number"
    && typeof window.resetsAt !== "number"
  ) {
    return null;
  }

  return {
    usedPercent: window.usedPercent ?? undefined,
    windowDurationMins: window.windowDurationMins ?? undefined,
    resetsAt: window.resetsAt ?? undefined,
  };
}

function readDurationMins(window: JsonRecord | null | undefined, fallbackMins: number): number | null {
  const seconds = readNumber(window?.limit_window_seconds);
  if (typeof seconds === "number" && seconds > 0) {
    return Math.max(1, Math.round(seconds / 60));
  }
  return fallbackMins;
}

function readResetsAt(window: JsonRecord | null | undefined, nowSec: number): number | null {
  const resetAt = readNumber(window?.reset_at);
  if (typeof resetAt === "number") return Math.floor(resetAt);

  const resetAfter = readNumber(window?.reset_after_seconds);
  if (typeof resetAfter === "number") {
    return Math.floor(nowSec + resetAfter);
  }

  return null;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseJsonRecord(text: string): JsonRecord | null {
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function decodeHexUtf8(hex: string): string | null {
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (!clean || clean.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(clean)) return null;
  try {
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      const byte = Number.parseInt(clean.slice(i, i + 2), 16);
      if (!Number.isFinite(byte)) return null;
      bytes[i / 2] = byte;
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

function parseAuthPayload(text: string): CodexAuthPayload | null {
  const parsed = parseJsonRecord(text);
  if (parsed) return parsed as CodexAuthPayload;

  const decoded = decodeHexUtf8(text.trim());
  if (!decoded) return null;
  const fromHex = parseJsonRecord(decoded);
  return fromHex as CodexAuthPayload | null;
}

function hasTokenLikeAuth(auth: CodexAuthPayload | null): auth is CodexAuthPayload {
  if (!auth) return false;
  if (typeof auth.OPENAI_API_KEY === "string" && auth.OPENAI_API_KEY.length > 0) return true;
  const tokens = asRecord(auth.tokens);
  if (!tokens) return false;
  const accessToken = tokens.access_token;
  return typeof accessToken === "string" && accessToken.length > 0;
}

function resolveAuthPaths(): string[] {
  // Keep swapped account auth first for multicodex account isolation.
  const candidates: string[] = [defaultCodexAuthPath()];

  const codexHome = process.env.CODEX_HOME?.trim();
  if (codexHome) {
    candidates.push(path.join(codexHome, "auth.json"));
  }

  const home = process.env.HOME?.trim() || os.homedir();
  candidates.push(path.join(home, ".config", "codex", "auth.json"));
  candidates.push(path.join(home, ".codex", "auth.json"));

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    deduped.push(resolved);
  }
  return deduped;
}

async function loadAuthFromFiles(preferredAuthPath?: string): Promise<LoadedAuth | null> {
  const authPaths = preferredAuthPath
    ? [
      path.resolve(preferredAuthPath),
      ...resolveAuthPaths().filter((candidate) => candidate !== path.resolve(preferredAuthPath)),
    ]
    : resolveAuthPaths();
  for (const authPath of authPaths) {
    try {
      const text = await fs.readFile(authPath, "utf8");
      const auth = parseAuthPayload(text);
      if (!hasTokenLikeAuth(auth)) continue;
      return { auth, source: { kind: "file", path: authPath } };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") continue;
      throw error;
    }
  }
  return null;
}

async function readKeychainAuth(): Promise<LoadedAuth | null> {
  if (process.platform !== "darwin") return null;
  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-w",
    ]);
    const auth = parseAuthPayload(stdout);
    if (!hasTokenLikeAuth(auth)) return null;
    return { auth, source: { kind: "keychain" } };
  } catch {
    return null;
  }
}

async function loadAuth(): Promise<LoadedAuth | null> {
  const fromFile = await loadAuthFromFiles();
  if (fromFile) return fromFile;
  return await readKeychainAuth();
}

async function loadAuthFromPreferredPath(authPath: string): Promise<LoadedAuth | null> {
  return await loadAuthFromFiles(authPath);
}

async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Math.random().toString(16).slice(2)}`;
  await fs.writeFile(tmpPath, content, { mode: 0o600 });
  await fs.rename(tmpPath, filePath);
}

async function persistAuth(authState: LoadedAuth): Promise<void> {
  const serialized = JSON.stringify(authState.auth, null, 2) + "\n";
  if (authState.source.kind === "file") {
    await writeFileAtomic(authState.source.path, serialized);
    return;
  }

  if (process.platform !== "darwin") return;
  try {
    await execFileAsync("security", [
      "add-generic-password",
      "-U",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      KEYCHAIN_SERVICE,
      "-w",
      JSON.stringify(authState.auth),
    ]);
  } catch {
    // Non-fatal: callers still have in-memory refreshed token.
  }
}

function needsRefresh(auth: CodexAuthPayload, nowMs: number): boolean {
  const raw = auth.last_refresh;
  if (typeof raw !== "string" || !raw.trim()) return true;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return true;
  return nowMs - parsed > REFRESH_AGE_MS;
}

function tokenErrorFromRefreshCode(code: unknown): string {
  if (code === "refresh_token_expired") return "Session expired. Run `codex` to log in again.";
  if (code === "refresh_token_reused") return "Token conflict. Run `codex` to log in again.";
  if (code === "refresh_token_invalidated") return "Token revoked. Run `codex` to log in again.";
  return "Token expired. Run `codex` to log in again.";
}

function buildRefreshBody(refreshToken: string): string {
  return [
    "grant_type=refresh_token",
    `client_id=${encodeURIComponent(CLIENT_ID)}`,
    `refresh_token=${encodeURIComponent(refreshToken)}`,
  ].join("&");
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function refreshToken(fetchImpl: FetchLike, authState: LoadedAuth): Promise<string | null> {
  const tokens = asRecord(authState.auth.tokens);
  const refreshTokenValue = typeof tokens?.refresh_token === "string" ? tokens.refresh_token : null;
  if (!refreshTokenValue) return null;

  let response: Response;
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      REFRESH_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: buildRefreshBody(refreshTokenValue),
      },
      15_000,
    );
  } catch {
    return null;
  }

  const bodyText = await response.text();
  const body = parseJsonRecord(bodyText);
  if (response.status === 400 || response.status === 401) {
    const code = asRecord(body?.error)?.code ?? body?.error ?? body?.code;
    throw new Error(tokenErrorFromRefreshCode(code));
  }

  if (response.status < 200 || response.status >= 300) return null;
  if (!body) return null;

  const nextAccess = typeof body.access_token === "string" ? body.access_token : null;
  if (!nextAccess) return null;

  const nextTokens = asRecord(authState.auth.tokens) ?? {};
  nextTokens.access_token = nextAccess;

  if (typeof body.refresh_token === "string") {
    nextTokens.refresh_token = body.refresh_token;
  }
  if (typeof body.id_token === "string") {
    nextTokens.id_token = body.id_token;
  }

  authState.auth.tokens = nextTokens;
  authState.auth.last_refresh = new Date().toISOString();

  await persistAuth(authState);
  return nextAccess;
}

async function fetchUsage(
  fetchImpl: FetchLike,
  accessToken: string,
  accountId: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "User-Agent": "multicodex",
  };
  if (accountId) headers["ChatGPT-Account-Id"] = accountId;
  return await fetchWithTimeout(fetchImpl, USAGE_URL, { method: "GET", headers }, 10_000);
}

export async function fetchRateLimitsViaApi(fetchImpl: FetchLike = fetch): Promise<RateLimitSnapshot> {
  const authState = await loadAuth();
  if (!authState) {
    throw new Error("Not logged in. Run `codex` to authenticate.");
  }

  return await fetchRateLimitsViaApiForAuthState(authState, fetchImpl);
}

export async function fetchRateLimitsViaApiForAuthPath(
  authPath: string,
  fetchImpl: FetchLike = fetch,
): Promise<RateLimitSnapshot> {
  const authState = await loadAuthFromPreferredPath(authPath);
  if (!authState) {
    throw new Error("Not logged in. Run `codex` to authenticate.");
  }

  return await fetchRateLimitsViaApiForAuthState(authState, fetchImpl);
}

async function fetchRateLimitsViaApiForAuthState(
  authState: LoadedAuth,
  fetchImpl: FetchLike,
): Promise<RateLimitSnapshot> {

  const auth = authState.auth;
  const tokens = asRecord(auth.tokens);
  const accessTokenValue = typeof tokens?.access_token === "string" ? tokens.access_token : null;

  if (!accessTokenValue) {
    if (typeof auth.OPENAI_API_KEY === "string" && auth.OPENAI_API_KEY.length > 0) {
      throw new Error("Usage not available for API key.");
    }
    throw new Error("Not logged in. Run `codex` to authenticate.");
  }

  let accessToken = accessTokenValue;
  const accountId = typeof tokens?.account_id === "string" ? tokens.account_id : null;

  if (needsRefresh(auth, Date.now())) {
    const refreshed = await refreshToken(fetchImpl, authState);
    if (refreshed) accessToken = refreshed;
  }

  let response = await fetchUsage(fetchImpl, accessToken, accountId);

  if (response.status === 401 || response.status === 403) {
    const refreshed = await refreshToken(fetchImpl, authState);
    if (refreshed) {
      accessToken = refreshed;
      response = await fetchUsage(fetchImpl, accessToken, accountId);
    }
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("Token expired. Run `codex` to log in again.");
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Usage request failed (HTTP ${response.status}). Try again later.`);
  }

  const bodyText = await response.text();
  const body = parseJsonRecord(bodyText);
  if (!body) {
    throw new Error("Usage response invalid. Try again later.");
  }

  const parsed = parseUsageSnapshotFromWhamResponse({
    headers: response.headers,
    data: body as UsageApiResponseData,
  });

  return parsed;
}
