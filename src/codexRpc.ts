import { spawn } from "node:child_process";

export type RateLimitWindow = {
  usedPercent?: number;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
};

export type CreditsSnapshot = {
  hasCredits?: boolean;
  unlimited?: boolean;
  balance?: string | null;
};

export type RateLimitSnapshot = {
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
  credits?: CreditsSnapshot | null;
};

type RateLimitsResponse = {
  rateLimits?: RateLimitSnapshot | null;
};

type RpcMessage = {
  id?: number;
  method?: string;
  result?: unknown;
  error?: { message?: string };
};

class MessageQueue {
  private queue: RpcMessage[] = [];
  private waiters: Array<(msg: RpcMessage) => void> = [];

  push(msg: RpcMessage): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(msg);
      return;
    }
    this.queue.push(msg);
  }

  async next(): Promise<RpcMessage> {
    if (this.queue.length) return this.queue.shift() as RpcMessage;
    return await new Promise<RpcMessage>((resolve) => this.waiters.push(resolve));
  }
}

export class CodexRpcClient {
  private process: ReturnType<typeof spawn>;
  private queue = new MessageQueue();
  private nextId = 1;
  private closedReason: string | null = null;
  private closedResolve!: () => void;
  private closed = new Promise<void>((resolve) => {
    this.closedResolve = resolve;
  });

  constructor(
    executable = "codex",
    args: string[] = ["-s", "read-only", "-a", "untrusted", "app-server"],
  ) {
    this.process = spawn(executable, args, { stdio: ["pipe", "pipe", "pipe"] });

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error("Failed to start Codex RPC (missing stdio)");
    }

    let buffer = "";
    this.process.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let idx = buffer.indexOf("\n");
      while (idx !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const trimmed = line.trim();
        if (trimmed) {
          try {
            const msg = JSON.parse(trimmed) as RpcMessage;
            this.queue.push(msg);
          } catch {
            // Ignore non-JSON lines.
          }
        }
        idx = buffer.indexOf("\n");
      }
    });

    this.process.on("error", (err) => {
      this.closedReason = err.message;
      this.closedResolve();
    });
    this.process.on("exit", (code, signal) => {
      const reason = signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`;
      this.closedReason = `Codex RPC closed (${reason})`;
      this.closedResolve();
    });
  }

  shutdown(): void {
    if (!this.process.killed) {
      this.process.kill();
    }
  }

  async initialize(clientName: string, clientVersion: string): Promise<void> {
    await this.request("initialize", { clientInfo: { name: clientName, version: clientVersion } });
    this.notify("initialized", {});
  }

  async fetchRateLimits(): Promise<RateLimitSnapshot> {
    const msg = await this.request("account/rateLimits/read");
    const result = (msg.result ?? {}) as RateLimitsResponse;
    return result.rateLimits ?? {};
  }

  private notify(method: string, params?: Record<string, unknown>): void {
    this.sendPayload({ method, params: params ?? {} });
  }

  private async request(method: string, params?: Record<string, unknown>): Promise<RpcMessage> {
    const id = this.nextId++;
    this.sendPayload({ id, method, params: params ?? {} });

    while (true) {
      const msg = await this.nextMessage();
      if (!msg.id && msg.method) continue;
      if (msg.id !== id) continue;
      if (msg.error?.message) throw new Error(`Codex RPC error: ${msg.error.message}`);
      return msg;
    }
  }

  private sendPayload(payload: Record<string, unknown>): void {
    const body = JSON.stringify(payload);
    this.process.stdin?.write(body + "\n");
  }

  private async nextMessage(timeoutMs = 10_000): Promise<RpcMessage> {
    return await Promise.race([
      this.queue.next(),
      this.closed.then(() => {
        throw new Error(this.closedReason ?? "Codex RPC closed");
      }),
      new Promise<RpcMessage>((_, reject) =>
        setTimeout(() => reject(new Error("Codex RPC timed out")), timeoutMs),
      ),
    ]);
  }
}

export async function fetchRateLimitsViaRpc(): Promise<RateLimitSnapshot> {
  const client = new CodexRpcClient();
  try {
    await client.initialize("multicodex", "dev");
    return await client.fetchRateLimits();
  } finally {
    client.shutdown();
  }
}
