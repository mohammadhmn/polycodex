import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { addAccount, listAccounts, renameAccount, useAccount } from "../src/profiles";
import { loadConfig } from "../src/config";

let tmpRoot: string | undefined;

async function setup(): Promise<void> {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "polycodex-test-"));
  process.env.POLYCODEX_HOME = tmpRoot;
}

afterEach(async () => {
  if (tmpRoot) {
    await fs.rm(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  }
  delete process.env.POLYCODEX_HOME;
});

describe("profiles", () => {
  test("adds account and sets current when first", async () => {
    await setup();
    await addAccount({ name: "work" });
    const cfg = await loadConfig();
    expect(cfg.currentAccount).toBe("work");
    expect(cfg.accounts.work).toBeTruthy();
  });

  test("lists accounts and marks current", async () => {
    await setup();
    await addAccount({ name: "work" });
    await addAccount({ name: "personal" });
    await useAccount("personal");

    const { accounts } = await listAccounts();
    expect(accounts.map((a) => a.name)).toEqual(["personal", "work"]);
    const current = accounts.find((a) => a.isCurrent);
    expect(current?.name).toBe("personal");
  });

  test("renames account and preserves current pointer", async () => {
    await setup();
    await addAccount({ name: "work" });
    await useAccount("work");
    await renameAccount("work", "work2");
    const cfg = await loadConfig();
    expect(cfg.currentAccount).toBe("work2");
    expect(cfg.accounts.work).toBeUndefined();
    expect(cfg.accounts.work2).toBeTruthy();
  });
});
