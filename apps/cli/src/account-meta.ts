import fs from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";
import { accountMetaPath } from "./paths";
import { safeReadFileUtf8 } from "./lib/fs-atomic";

export type AccountMeta = {
  createdAt: string;
  lastUsedAt?: string;
  lastLoginStatus?: string;
  lastLoginCheckedAt?: string;
  updatedAt?: string;
};

async function safeStat(p: string): Promise<Stats | undefined> {
  try {
    return await fs.stat(p);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return undefined;
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function ensureAccountMeta(accountName: string): Promise<AccountMeta> {
  const p = accountMetaPath(accountName);
  const existing = await safeReadFileUtf8(p);
  if (existing) {
    const parsed = JSON.parse(existing) as unknown;
    if (isRecord(parsed) && typeof parsed.createdAt === "string") return parsed as AccountMeta;
  }

  const meta: AccountMeta = { createdAt: nowIso(), updatedAt: nowIso() };
  await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  await fs.writeFile(p, JSON.stringify(meta, null, 2) + "\n", { mode: 0o600 });
  return meta;
}

export async function readAccountMeta(accountName: string): Promise<AccountMeta | undefined> {
  const p = accountMetaPath(accountName);
  const raw = await safeReadFileUtf8(p);
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) return undefined;
  if (typeof parsed.createdAt !== "string") return undefined;
  return parsed as AccountMeta;
}

export async function writeAccountMeta(accountName: string, meta: AccountMeta): Promise<void> {
  const p = accountMetaPath(accountName);
  await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  const next: AccountMeta = { ...meta, updatedAt: nowIso() };
  await fs.writeFile(p, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
}

export async function updateAccountMeta(
  accountName: string,
  patch: Partial<AccountMeta>,
): Promise<AccountMeta> {
  const current = (await readAccountMeta(accountName)) ?? { createdAt: nowIso() };
  const merged: AccountMeta = { ...current, ...patch, updatedAt: nowIso() };
  await writeAccountMeta(accountName, merged);
  return merged;
}

export async function accountHasMeta(accountName: string): Promise<boolean> {
  return (await safeStat(accountMetaPath(accountName)))?.isFile() ?? false;
}
