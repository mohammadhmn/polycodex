import type { JsonRecord } from "./types";

export function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

export function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

export function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function parseJsonRecord(text: string): JsonRecord | null {
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}
