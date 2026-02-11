import type { CreditsSnapshot, RateLimitSnapshot, RateLimitWindow } from "../codex-rpc";
import { asRecord, parseJsonRecord, readBoolean, readNumber } from "./json";
import type { CodexAuthPayload, JsonRecord, UsageApiResponseData } from "./types";

const FIVE_HOURS_MINS = 300;
const WEEKLY_MINS = 7 * 24 * 60;

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

export function parseAuthPayload(text: string): CodexAuthPayload | null {
  const parsed = parseJsonRecord(text);
  if (parsed) return parsed as CodexAuthPayload;

  const decoded = decodeHexUtf8(text.trim());
  if (!decoded) return null;
  const fromHex = parseJsonRecord(decoded);
  return fromHex as CodexAuthPayload | null;
}

export function hasTokenLikeAuth(auth: CodexAuthPayload | null): auth is CodexAuthPayload {
  if (!auth) return false;
  if (typeof auth.OPENAI_API_KEY === "string" && auth.OPENAI_API_KEY.length > 0) return true;
  const tokens = asRecord(auth.tokens);
  if (!tokens) return false;
  const accessToken = tokens.access_token;
  return typeof accessToken === "string" && accessToken.length > 0;
}
