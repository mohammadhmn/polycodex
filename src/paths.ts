import os from "node:os";
import path from "node:path";

function homeDir(): string {
  // Prefer env HOME for predictable behavior in shells/tests.
  const envHome = process.env.HOME;
  if (envHome && envHome.trim()) return envHome;
  return os.homedir();
}

export function defaultCodexHomeDir(): string {
  return path.join(homeDir(), ".codex");
}

export function polycodexHomeDir(): string {
  const override = process.env.POLYCODEX_HOME;
  if (override && override.trim()) return path.resolve(override);

  return path.join(homeDir(), ".config", "polycodex");
}

export function configPath(): string {
  return path.join(polycodexHomeDir(), "config.json");
}

export function accountsDir(): string {
  return path.join(polycodexHomeDir(), "accounts");
}

export function accountDir(accountName: string): string {
  return path.join(accountsDir(), accountName);
}

export function accountAuthPath(accountName: string): string {
  return path.join(accountDir(accountName), "auth.json");
}

export function locksDir(): string {
  return path.join(polycodexHomeDir(), "locks");
}

export function authLockDir(): string {
  return path.join(locksDir(), "auth.lockdir");
}

export function defaultCodexAuthPath(): string {
  return path.join(defaultCodexHomeDir(), "auth.json");
}
