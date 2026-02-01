import fs from "node:fs/promises";
import path from "node:path";
import { acquireAuthLock } from "./lock";
import { accountAuthPath, defaultCodexAuthPath } from "./paths";

async function safeReadFile(p: string): Promise<Uint8Array | undefined> {
  try {
    return await fs.readFile(p);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return undefined;
    throw error;
  }
}

async function safeUnlink(p: string): Promise<void> {
  try {
    await fs.unlink(p);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return;
    throw error;
  }
}

async function writeFileAtomic(p: string, data: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  const tmp = `${p}.tmp.${process.pid}.${Math.random().toString(16).slice(2)}`;
  await fs.writeFile(tmp, data, { mode: 0o600 });
  await fs.rename(tmp, p);
}

async function copyFileAtomic(src: string, dest: string): Promise<void> {
  const data = await fs.readFile(src);
  await writeFileAtomic(dest, data);
}

async function setDefaultAuthFromAccount(account: string): Promise<void> {
  const src = accountAuthPath(account);
  const dest = defaultCodexAuthPath();
  const exists = await safeReadFile(src);
  if (!exists) {
    // Account has no stored auth; treat as logged-out by removing default auth.
    await safeUnlink(dest);
    return;
  }
  await copyFileAtomic(src, dest);
}

async function snapshotDefaultAuthToAccount(account: string): Promise<void> {
  const src = defaultCodexAuthPath();
  const dest = accountAuthPath(account);
  const data = await safeReadFile(src);
  if (!data) {
    await safeUnlink(dest);
    return;
  }
  await writeFileAtomic(dest, data);
}

export type WithAuthOptions = {
  account: string;
  forceLock: boolean;
  restorePreviousAuth: boolean;
};

export async function withAccountAuth<T>(
  opts: WithAuthOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const lock = await acquireAuthLock({ account: opts.account, force: opts.forceLock });
  const defaultAuthPath = defaultCodexAuthPath();

  // Backup existing default auth if we need to restore it later.
  const previous = opts.restorePreviousAuth ? await safeReadFile(defaultAuthPath) : undefined;

  try {
    await setDefaultAuthFromAccount(opts.account);
    const result = await fn();
    // Persist any refreshed tokens back into the account store.
    await snapshotDefaultAuthToAccount(opts.account);
    if (opts.restorePreviousAuth) {
      if (previous) await writeFileAtomic(defaultAuthPath, previous);
      else await safeUnlink(defaultAuthPath);
    }
    return result;
  } finally {
    await lock.release();
  }
}

export async function importDefaultAuthToAccount(account: string): Promise<void> {
  const lock = await acquireAuthLock({ account, force: false });
  try {
    await snapshotDefaultAuthToAccount(account);
  } finally {
    await lock.release();
  }
}

export async function applyAccountAuthToDefault(account: string, forceLock: boolean): Promise<void> {
  const lock = await acquireAuthLock({ account, force: forceLock });
  try {
    await setDefaultAuthFromAccount(account);
  } finally {
    await lock.release();
  }
}
