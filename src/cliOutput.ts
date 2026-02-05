export type JsonEnvelope<T> = {
  schemaVersion: 1;
  command: string;
  ok: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
};

export function wantsJsonArgv(argv = process.argv.slice(2)): boolean {
  return argv.includes("--json");
}

export function writeJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function truncateOneLine(value: string, maxLen: number): string {
  const line = value.split("\n")[0]?.trim() ?? "";
  if (line.length <= maxLen) return line;
  return line.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

export function padRight(value: string, width: number): string {
  if (value.length >= width) return value;
  return value + " ".repeat(width - value.length);
}

