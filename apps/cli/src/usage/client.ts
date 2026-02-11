import type { RateLimitSnapshot } from "../codex-rpc";
import { asRecord, parseJsonRecord } from "./json";
import { parseUsageSnapshotFromWhamResponse } from "./parser";
import { loadAuth, loadAuthFromPreferredPath } from "./auth-store";
import { fetchWithTimeout, needsRefresh, refreshToken } from "./token-refresh";
import type { FetchLike, LoadedAuth, UsageApiResponseData } from "./types";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

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

  return parseUsageSnapshotFromWhamResponse({
    headers: response.headers,
    data: body as UsageApiResponseData,
  });
}
