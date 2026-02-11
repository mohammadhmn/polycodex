import { withAccountAuth } from "./auth-swap";
import type { RateLimitSnapshot } from "./codex-rpc";
import { fetchRateLimitsViaRpc } from "./codex-rpc";
import { fetchRateLimitsViaApi, fetchRateLimitsViaApiForAuthPath } from "./codex-usage-api";
import { toErrorMessage, type JsonEnvelope } from "./cli-output";
import { accountAuthPath } from "./paths";
import { getCachedLimits, setCachedLimits } from "./limits-cache";
import { rateLimitsToRow, type LimitsRow } from "./limits";
import type { LimitsProvider } from "./command-spec";

type LiveLimitsSource = "live-api" | "live-rpc";

export type LimitsResultEntry = {
  account: string;
  source: string;
  provider: LimitsProvider | "cached";
  snapshot?: unknown;
  ageSec?: number;
};

export type LimitsErrorEntry = { account: string; message: string };

type AccountLimitsOutcome = {
  account: string;
  row?: LimitsRow;
  result?: LimitsResultEntry;
  cacheWrite?: { snapshot: RateLimitSnapshot; source: LiveLimitsSource };
  apiError?: unknown;
  error?: string;
};

export type LimitsExecution = {
  rows: LimitsRow[];
  results: LimitsResultEntry[];
  errors: LimitsErrorEntry[];
  hadError: boolean;
};

async function fetchLiveLimits(
  provider: LimitsProvider,
): Promise<{ snapshot: RateLimitSnapshot; source: LiveLimitsSource }> {
  if (provider === "api") {
    return { snapshot: await fetchRateLimitsViaApi(), source: "live-api" };
  }
  if (provider === "rpc") {
    return { snapshot: await fetchRateLimitsViaRpc(), source: "live-rpc" };
  }

  let apiError: unknown;
  try {
    return { snapshot: await fetchRateLimitsViaApi(), source: "live-api" };
  } catch (error) {
    apiError = error;
  }

  try {
    return { snapshot: await fetchRateLimitsViaRpc(), source: "live-rpc" };
  } catch (rpcError) {
    const apiMessage = toErrorMessage(apiError);
    const rpcMessage = toErrorMessage(rpcError);
    throw new Error(`API failed (${apiMessage}); RPC fallback failed (${rpcMessage})`);
  }
}

export async function executeLimitsQuery(args: {
  provider: LimitsProvider;
  targets: string[];
  forceLock: boolean;
  useCache: boolean;
  ttlMs: number;
  onFetching?: (account: string) => void;
}): Promise<LimitsExecution> {
  const { provider, targets, forceLock, useCache, ttlMs } = args;

  const outcomes = new Map<string, AccountLimitsOutcome>();

  if (provider === "rpc") {
    // RPC mode executes per-account under swapped auth and never attempts API fallback.
    for (const account of targets) {
      try {
        if (useCache) {
          const cached = await getCachedLimits(account, ttlMs);
          if (cached) {
            const ageSec = Math.round(cached.ageMs / 1000);
            const cachedProvider = cached.provider ?? "cached";
            outcomes.set(account, {
              account,
              row: rateLimitsToRow(cached.snapshot, account, `cached ${cachedProvider} ${ageSec}s`),
              result: { account, source: "cached", provider: cachedProvider, snapshot: cached.snapshot, ageSec },
            });
            continue;
          }
        }

        args.onFetching?.(account);
        const live = await withAccountAuth(
          { account, forceLock, restorePreviousAuth: true },
          async () => await fetchLiveLimits(provider),
        );
        outcomes.set(account, {
          account,
          row: rateLimitsToRow(live.snapshot, account, live.source),
          result: {
            account,
            source: live.source,
            provider: live.source === "live-api" ? "api" : "rpc",
            snapshot: live.snapshot,
          },
          cacheWrite: { snapshot: live.snapshot, source: live.source },
        });
      } catch (error) {
        outcomes.set(account, { account, error: toErrorMessage(error) });
      }
    }
  } else {
    // API and auto mode can fetch API results in parallel, then fallback to RPC only for failed accounts.
    const apiOutcomes = await Promise.all(
      targets.map(async (account): Promise<AccountLimitsOutcome> => {
        try {
          if (useCache) {
            const cached = await getCachedLimits(account, ttlMs);
            if (cached) {
              const ageSec = Math.round(cached.ageMs / 1000);
              const cachedProvider = cached.provider ?? "cached";
              return {
                account,
                row: rateLimitsToRow(cached.snapshot, account, `cached ${cachedProvider} ${ageSec}s`),
                result: { account, source: "cached", provider: cachedProvider, snapshot: cached.snapshot, ageSec },
              };
            }
          }

          args.onFetching?.(account);
          const snapshot = await fetchRateLimitsViaApiForAuthPath(accountAuthPath(account));
          return {
            account,
            row: rateLimitsToRow(snapshot, account, "live-api"),
            result: { account, source: "live-api", provider: "api", snapshot },
            cacheWrite: { snapshot, source: "live-api" },
          };
        } catch (error) {
          if (provider === "auto") return { account, apiError: error };
          return { account, error: toErrorMessage(error) };
        }
      }),
    );

    for (const outcome of apiOutcomes) outcomes.set(outcome.account, outcome);

    if (provider === "auto") {
      for (const account of targets) {
        const current = outcomes.get(account);
        if (!current?.apiError) continue;

        try {
          const snapshot = await withAccountAuth(
            { account, forceLock, restorePreviousAuth: true },
            async () => await fetchRateLimitsViaRpc(),
          );
          outcomes.set(account, {
            account,
            row: rateLimitsToRow(snapshot, account, "live-rpc"),
            result: { account, source: "live-rpc", provider: "rpc", snapshot },
            cacheWrite: { snapshot, source: "live-rpc" },
          });
        } catch (rpcError) {
          const apiMessage = toErrorMessage(current.apiError);
          const rpcMessage = toErrorMessage(rpcError);
          outcomes.set(account, {
            account,
            error: `API failed (${apiMessage}); RPC fallback failed (${rpcMessage})`,
          });
        }
      }
    }
  }

  let hadError = false;
  const rows: LimitsRow[] = [];
  const results: LimitsResultEntry[] = [];
  const errors: LimitsErrorEntry[] = [];

  for (const account of targets) {
    const outcome = outcomes.get(account);
    if (!outcome) continue;
    if (outcome.cacheWrite) {
      await setCachedLimits(account, outcome.cacheWrite.snapshot, outcome.cacheWrite.source);
    }
    if (outcome.row) rows.push(outcome.row);
    if (outcome.result) results.push(outcome.result);
    if (outcome.error) {
      hadError = true;
      errors.push({ account, message: outcome.error });
    }
  }

  return { rows, results, errors, hadError };
}

export type LimitsJsonEnvelope = JsonEnvelope<{
  results: LimitsResultEntry[];
  errors: LimitsErrorEntry[];
}>;
