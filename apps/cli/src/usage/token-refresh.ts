import { asRecord, parseJsonRecord } from "./json";
import { persistAuth } from "./auth-store";
import type { CodexAuthPayload, FetchLike, LoadedAuth } from "./types";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const REFRESH_URL = "https://auth.openai.com/oauth/token";
const REFRESH_AGE_MS = 8 * 24 * 60 * 60 * 1000;

export function needsRefresh(auth: CodexAuthPayload, nowMs: number): boolean {
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

export async function fetchWithTimeout(
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

export async function refreshToken(fetchImpl: FetchLike, authState: LoadedAuth): Promise<string | null> {
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
