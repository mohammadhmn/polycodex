import { withAccountAuth } from "./authSwap";
import { spawn } from "node:child_process";

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
      return await new Promise<number>((resolve, reject) => {
        const child = spawn("codex", opts.codexArgs, {
          stdio: "inherit",
          env: { ...process.env },
        });
        child.on("error", reject);
        child.on("exit", (code, signal) => {
          if (typeof code === "number") return resolve(code);
          // If terminated by signal, follow common convention.
          return resolve(signal ? 128 : 1);
        });
      });
    },
  );
}
