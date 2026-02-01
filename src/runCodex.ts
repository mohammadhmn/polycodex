import { withAccountAuth } from "./authSwap";

export type RunCodexOptions = {
  account: string;
  codexArgs: string[];
  forceLock: boolean;
  restorePreviousAuth: boolean;
};

export async function runCodex(opts: RunCodexOptions): Promise<number> {
  return await withAccountAuth(
    {
      account: opts.account,
      forceLock: opts.forceLock,
      restorePreviousAuth: opts.restorePreviousAuth,
    },
    async () => {
      const proc = Bun.spawn({
        cmd: ["codex", ...opts.codexArgs],
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        env: {
          ...process.env,
        },
      });
      return await proc.exited;
    },
  );
}

