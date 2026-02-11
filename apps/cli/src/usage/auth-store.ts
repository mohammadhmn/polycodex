import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { writeFileAtomicText } from "../lib/fs-atomic";
import { defaultCodexAuthPath } from "../paths";
import { parseAuthPayload, hasTokenLikeAuth } from "./parser";
import type { LoadedAuth } from "./types";

const execFileAsync = promisify(execFile);
const KEYCHAIN_SERVICE = "Codex Auth";

function resolveAuthPaths(): string[] {
  // Keep swapped account auth first for multicodex account isolation.
  const candidates: string[] = [defaultCodexAuthPath()];

  const codexHome = process.env.CODEX_HOME?.trim();
  if (codexHome) {
    candidates.push(path.join(codexHome, "auth.json"));
  }

  const home = process.env.HOME?.trim() || os.homedir();
  candidates.push(path.join(home, ".config", "codex", "auth.json"));
  candidates.push(path.join(home, ".codex", "auth.json"));

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    deduped.push(resolved);
  }
  return deduped;
}

async function loadAuthFromFiles(preferredAuthPath?: string): Promise<LoadedAuth | null> {
  const authPaths = preferredAuthPath
    ? [
      path.resolve(preferredAuthPath),
      ...resolveAuthPaths().filter((candidate) => candidate !== path.resolve(preferredAuthPath)),
    ]
    : resolveAuthPaths();

  for (const authPath of authPaths) {
    try {
      const text = await fs.readFile(authPath, "utf8");
      const auth = parseAuthPayload(text);
      if (!hasTokenLikeAuth(auth)) continue;
      return { auth, source: { kind: "file", path: authPath } };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") continue;
      throw error;
    }
  }

  return null;
}

async function readKeychainAuth(): Promise<LoadedAuth | null> {
  if (process.platform !== "darwin") return null;
  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-w",
    ]);
    const auth = parseAuthPayload(stdout);
    if (!hasTokenLikeAuth(auth)) return null;
    return { auth, source: { kind: "keychain" } };
  } catch {
    return null;
  }
}

export async function loadAuth(): Promise<LoadedAuth | null> {
  const fromFile = await loadAuthFromFiles();
  if (fromFile) return fromFile;
  return await readKeychainAuth();
}

export async function loadAuthFromPreferredPath(authPath: string): Promise<LoadedAuth | null> {
  return await loadAuthFromFiles(authPath);
}

export async function persistAuth(authState: LoadedAuth): Promise<void> {
  const serialized = JSON.stringify(authState.auth, null, 2) + "\n";
  if (authState.source.kind === "file") {
    await writeFileAtomicText(authState.source.path, serialized);
    return;
  }

  if (process.platform !== "darwin") return;
  try {
    await execFileAsync("security", [
      "add-generic-password",
      "-U",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      KEYCHAIN_SERVICE,
      "-w",
      JSON.stringify(authState.auth),
    ]);
  } catch {
    // Non-fatal: callers still have in-memory refreshed token.
  }
}
