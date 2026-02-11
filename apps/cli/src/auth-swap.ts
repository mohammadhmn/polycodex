import fs from "node:fs/promises";
import { acquireAuthLock } from "./lock";
import { accountAuthPath, defaultCodexAuthPath } from "./paths";
import { safeReadFileBytes, safeUnlink, writeFileAtomicBytes } from "./lib/fs-atomic";

async function copyFileAtomic(src: string, dest: string): Promise<void> {
  const data = await fs.readFile(src);
  await writeFileAtomicBytes(dest, data);
}

async function setDefaultAuthFromAccount(account: string): Promise<void> {
  const src = accountAuthPath(account);
  const dest = defaultCodexAuthPath();
  const exists = await safeReadFileBytes(src);
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
  const data = await safeReadFileBytes(src);
  if (!data) {
    await safeUnlink(dest);
    return;
  }
  await writeFileAtomicBytes(dest, data);
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
  const previous = opts.restorePreviousAuth ? await safeReadFileBytes(defaultAuthPath) : undefined;

  try {
    await setDefaultAuthFromAccount(opts.account);
    const result = await fn();
    // Persist any refreshed tokens back into the account store.
    await snapshotDefaultAuthToAccount(opts.account);
    if (opts.restorePreviousAuth) {
      if (previous) await writeFileAtomicBytes(defaultAuthPath, previous);
      else await safeUnlink(defaultAuthPath);
    }
    return result;
  } finally {
    await lock.release();
  }
}

export async function importDefaultAuthToAccount(account: string, forceLock = false): Promise<void> {
  const lock = await acquireAuthLock({ account, force: forceLock });
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
