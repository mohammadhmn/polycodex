import fs from "node:fs/promises";
import path from "node:path";
import { authLockDir } from "./paths";

export type AuthLockOwner = {
  pid: number;
  startedAt: string;
  account: string;
};

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "EPERM") return true;
    return false;
  }
}

async function readOwner(lockDir: string): Promise<AuthLockOwner | undefined> {
  try {
    const raw = await fs.readFile(path.join(lockDir, "owner.json"), "utf8");
    const parsed = JSON.parse(raw) as Partial<AuthLockOwner>;
    if (typeof parsed.pid !== "number") return undefined;
    if (typeof parsed.startedAt !== "string") return undefined;
    if (typeof parsed.account !== "string") return undefined;
    return { pid: parsed.pid, startedAt: parsed.startedAt, account: parsed.account };
  } catch {
    return undefined;
  }
}

async function writeOwner(lockDir: string, owner: AuthLockOwner): Promise<void> {
  await fs.writeFile(path.join(lockDir, "owner.json"), JSON.stringify(owner, null, 2) + "\n", {
    mode: 0o600,
  });
}

export type AcquireAuthLockOptions = {
  account: string;
  force: boolean;
};

export type AuthLockHandle = {
  owner: AuthLockOwner;
  release: () => Promise<void>;
};

export async function acquireAuthLock(opts: AcquireAuthLockOptions): Promise<AuthLockHandle> {
  const lockDir = authLockDir();
  await fs.mkdir(path.dirname(lockDir), { recursive: true });
  const owner: AuthLockOwner = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    account: opts.account,
  };

  while (true) {
    try {
      await fs.mkdir(lockDir, { recursive: false, mode: 0o700 });
      await writeOwner(lockDir, owner);
      return {
        owner,
        release: async () => {
          await fs.rm(lockDir, { recursive: true, force: true });
        },
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "EEXIST") throw error;

      const existingOwner = await readOwner(lockDir);
      if (existingOwner && !isPidRunning(existingOwner.pid)) {
        await fs.rm(lockDir, { recursive: true, force: true });
        continue;
      }

      if (opts.force) {
        await fs.rm(lockDir, { recursive: true, force: true });
        continue;
      }

      const who = existingOwner
        ? `${existingOwner.account} (pid ${existingOwner.pid}, started ${existingOwner.startedAt})`
        : "unknown owner";
      throw new Error(
        `Auth swap is locked by ${who}. Close the other multicodex-managed Codex session or run again with --force.`,
      );
    }
  }
}
