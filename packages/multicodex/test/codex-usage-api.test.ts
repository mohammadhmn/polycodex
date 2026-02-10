import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  fetchRateLimitsViaApi,
  fetchRateLimitsViaApiForAuthPath,
  parseUsageSnapshotFromWhamResponse,
  type FetchLike,
} from "../src/codex-usage-api";

function getUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function readHeader(headers: ConstructorParameters<typeof Headers>[0] | undefined, name: string): string | null {
  if (!headers) return null;
  return new Headers(headers).get(name);
}

let originalHome = process.env.HOME;
let originalCodexHome = process.env.CODEX_HOME;
let tmpRoot: string | undefined;

afterEach(async () => {
  if (tmpRoot) {
    await fs.rm(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  }

  if (typeof originalHome === "string") process.env.HOME = originalHome;
  else delete process.env.HOME;

  if (typeof originalCodexHome === "string") process.env.CODEX_HOME = originalCodexHome;
  else delete process.env.CODEX_HOME;

  originalHome = process.env.HOME;
  originalCodexHome = process.env.CODEX_HOME;
});

describe("codex usage api", () => {
  test("prefers response headers for used percentages", () => {
    const snapshot = parseUsageSnapshotFromWhamResponse({
      headers: new Headers({
        "x-codex-primary-used-percent": "25",
        "x-codex-secondary-used-percent": "50",
        "x-codex-credits-balance": "100",
      }),
      data: {
        rate_limit: {
          primary_window: {
            used_percent: 10,
            reset_at: 1_700_001_800,
            limit_window_seconds: 18_000,
          },
          secondary_window: {
            used_percent: 20,
            reset_at: 1_700_604_800,
            limit_window_seconds: 604_800,
          },
        },
        credits: {
          has_credits: true,
          unlimited: false,
          balance: 5.39,
        },
      },
      nowMs: 1_700_000_000_000,
    });

    expect(snapshot.primary?.usedPercent).toBe(25);
    expect(snapshot.primary?.windowDurationMins).toBe(300);
    expect(snapshot.primary?.resetsAt).toBe(1_700_001_800);

    expect(snapshot.secondary?.usedPercent).toBe(50);
    expect(snapshot.secondary?.windowDurationMins).toBe(10_080);
    expect(snapshot.secondary?.resetsAt).toBe(1_700_604_800);

    expect(snapshot.credits?.hasCredits).toBe(true);
    expect(snapshot.credits?.unlimited).toBe(false);
    expect(snapshot.credits?.balance).toBe("100");
  });

  test("falls back to body values when headers are missing", () => {
    const snapshot = parseUsageSnapshotFromWhamResponse({
      headers: new Headers(),
      data: {
        rate_limit: {
          primary_window: {
            used_percent: 6,
            reset_after_seconds: 600,
            limit_window_seconds: 18_000,
          },
        },
        code_review_rate_limit: {
          primary_window: {
            used_percent: 30,
            reset_after_seconds: 900,
            limit_window_seconds: 604_800,
          },
        },
        credits: {
          balance: 5.39,
        },
      },
      nowMs: 1_700_000_000_000,
    });

    expect(snapshot.primary?.usedPercent).toBe(6);
    expect(snapshot.primary?.resetsAt).toBe(1_700_000_600);
    expect(snapshot.secondary?.usedPercent).toBe(30);
    expect(snapshot.secondary?.resetsAt).toBe(1_700_000_900);
    expect(snapshot.credits?.balance).toBe("5.39");
  });

  test("refreshes token on auth failure and retries usage", async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "multicodex-usage-api-"));
    process.env.HOME = tmpRoot;
    delete process.env.CODEX_HOME;

    const authDir = path.join(tmpRoot, ".codex");
    const authPath = path.join(authDir, "auth.json");
    await fs.mkdir(authDir, { recursive: true });
    await fs.writeFile(
      authPath,
      JSON.stringify(
        {
          tokens: {
            access_token: "old-token",
            refresh_token: "refresh-1",
            account_id: "acct-1",
          },
          last_refresh: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    const usageAuthHeaders: string[] = [];
    let usageCalls = 0;
    let refreshCalls = 0;

    const fetchMock: FetchLike = async (input, init) => {
      const url = getUrl(input);
      if (url.includes("/backend-api/wham/usage")) {
        usageCalls += 1;
        usageAuthHeaders.push(readHeader(init?.headers, "authorization") ?? "");

        if (usageCalls === 1) {
          return new Response("{}", { status: 401 });
        }

        return new Response(
          JSON.stringify({
            rate_limit: {
              primary_window: {
                reset_at: 1_700_001_800,
                limit_window_seconds: 18_000,
              },
              secondary_window: {
                reset_at: 1_700_604_800,
                limit_window_seconds: 604_800,
              },
            },
          }),
          {
            status: 200,
            headers: {
              "x-codex-primary-used-percent": "12",
              "x-codex-secondary-used-percent": "34",
            },
          },
        );
      }

      if (url.includes("/oauth/token")) {
        refreshCalls += 1;
        return new Response(
          JSON.stringify({
            access_token: "new-token",
            refresh_token: "refresh-2",
          }),
          { status: 200 },
        );
      }

      return new Response("not found", { status: 404 });
    };

    const snapshot = await fetchRateLimitsViaApi(fetchMock);

    expect(snapshot.primary?.usedPercent).toBe(12);
    expect(snapshot.secondary?.usedPercent).toBe(34);
    expect(usageCalls).toBe(2);
    expect(refreshCalls).toBe(1);
    expect(usageAuthHeaders[0]).toBe("Bearer old-token");
    expect(usageAuthHeaders[1]).toBe("Bearer new-token");

    const persistedRaw = await fs.readFile(authPath, "utf8");
    const persisted = JSON.parse(persistedRaw) as { tokens?: { access_token?: string; refresh_token?: string }; last_refresh?: string };

    expect(persisted.tokens?.access_token).toBe("new-token");
    expect(persisted.tokens?.refresh_token).toBe("refresh-2");
    expect(typeof persisted.last_refresh).toBe("string");
  });

  test("uses provided auth file path when fetching limits", async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "multicodex-usage-api-"));
    process.env.HOME = tmpRoot;
    delete process.env.CODEX_HOME;

    const defaultAuthDir = path.join(tmpRoot, ".codex");
    const accountAuthPath = path.join(tmpRoot, "acct-auth.json");
    await fs.mkdir(defaultAuthDir, { recursive: true });
    await fs.writeFile(
      path.join(defaultAuthDir, "auth.json"),
      JSON.stringify(
        {
          tokens: {
            access_token: "default-token",
            refresh_token: "refresh-default",
            account_id: "acct-default",
          },
          last_refresh: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    await fs.writeFile(
      accountAuthPath,
      JSON.stringify(
        {
          tokens: {
            access_token: "account-token",
            refresh_token: "refresh-account",
            account_id: "acct-account",
          },
          last_refresh: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    let usageAuthHeader = "";
    const fetchMock: FetchLike = async (input, init) => {
      const url = getUrl(input);
      if (url.includes("/backend-api/wham/usage")) {
        usageAuthHeader = readHeader(init?.headers, "authorization") ?? "";
        return new Response(
          JSON.stringify({
            rate_limit: {
              primary_window: {
                reset_at: 1_700_001_800,
                limit_window_seconds: 18_000,
              },
            },
          }),
          {
            status: 200,
            headers: {
              "x-codex-primary-used-percent": "10",
            },
          },
        );
      }
      return new Response("not found", { status: 404 });
    };

    await fetchRateLimitsViaApiForAuthPath(accountAuthPath, fetchMock);
    expect(usageAuthHeader).toBe("Bearer account-token");
  });
});
