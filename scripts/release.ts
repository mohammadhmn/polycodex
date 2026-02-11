import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

type Mode = "cli" | "macos" | "both";

type MacosOptions = {
  version?: string;
  noPush: boolean;
};

type BothOptions = {
  noPush: boolean;
  cliArgs: string[];
};

const repoRoot = path.resolve(import.meta.dir, "..");

function usage(exitCode: number): never {
  const msg = `
Usage:
  bun run release [cli-release-args...]
  bun run release:cli -- [cli-release-args...]
  bun run release:macos -- [--version <x.y.z>] [--no-push]
  bun run release:both -- [--no-push] [cli-release-args...]

Examples:
  bun run release:cli
  bun run release -- --minor
  bun run release:cli -- --minor
  bun run release:patch
  bun run release:macos
  bun run release:macos -- --version 0.2.0
  bun run release:both
  bun run release:both -- --minor --no-push
  bun run release:both -- --version 0.2.0 --no-publish
  bun run release:both -- --no-push -- --no-push
`.trim();

  console.error(msg);
  process.exit(exitCode);
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function renderCommand(command: string, args: string[]): string {
  return [quote(command), ...args.map(quote)].join(" ");
}

function run(command: string, args: string[]): void {
  const cmd = renderCommand(command, args);
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: repoRoot });
}

function runCapture(command: string, args: string[]): string {
  const cmd = renderCommand(command, args);
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], cwd: repoRoot }).toString("utf8");
}

function isValidSemver(v: string): boolean {
  return /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(v);
}

function parseMacosArgs(args: string[]): MacosOptions {
  let version: string | undefined;
  let noPush = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") usage(0);

    if (arg === "--no-push") {
      noPush = true;
      continue;
    }

    if (arg === "--version") {
      const next = args[i + 1];
      if (!next) throw new Error("Missing value for --version");
      version = next;
      i += 1;
      continue;
    }

    if (arg.startsWith("--version=")) {
      version = arg.slice("--version=".length);
      continue;
    }

    throw new Error(`Unknown arg: ${arg}`);
  }

  if (version && !isValidSemver(version)) throw new Error(`Invalid semver: ${version}`);
  return { version, noPush };
}

function parseBothArgs(args: string[]): BothOptions {
  const separatorIndex = args.indexOf("--");
  const rootArgs = separatorIndex >= 0 ? args.slice(0, separatorIndex) : args;
  const passthroughCliArgs = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : [];

  const cliArgs: string[] = [];
  let noPush = false;

  for (const arg of rootArgs) {
    if (arg === "--help" || arg === "-h") usage(0);
    if (arg === "--no-push") {
      noPush = true;
      continue;
    }
    cliArgs.push(arg);
  }

  return { noPush, cliArgs: [...cliArgs, ...passthroughCliArgs] };
}

function hasLocalTag(tagName: string): boolean {
  try {
    runCapture("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tagName}`]);
    return true;
  } catch {
    return false;
  }
}

function hasRemoteTag(tagName: string): boolean {
  try {
    const out = runCapture("git", ["ls-remote", "--tags", "origin", `refs/tags/${tagName}`]);
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function createMacosTag(version: string, noPush: boolean): void {
  const tag = `macos-v${version}`;
  if (hasLocalTag(tag)) throw new Error(`Tag already exists locally: ${tag}`);
  if (hasRemoteTag(tag)) throw new Error(`Tag already exists on origin: ${tag}`);

  run("git", ["tag", "-a", tag, "-m", tag]);

  if (noPush) {
    console.log(`Created tag ${tag} (not pushed).`);
    console.log(`Push when ready: git push origin ${tag}`);
    return;
  }

  run("git", ["push", "origin", tag]);
}

async function readCliVersion(): Promise<string> {
  const pkgPath = path.join(repoRoot, "apps", "cli", "package.json");
  const raw = await fs.readFile(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { version?: string };
  if (!pkg.version) throw new Error("apps/cli/package.json is missing version");
  return pkg.version;
}

function releaseCli(args: string[]): void {
  run("bun", ["run", "--filter", "multicodex", "release", ...args]);
}

function wantsHelp(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "--help" || argv[0] === "-h") usage(0);

  const first = argv[0];
  const modes = new Set<Mode>(["cli", "macos", "both"]);
  const mode: Mode = first && modes.has(first as Mode) ? (first as Mode) : "cli";
  const rest = mode === "cli" && first && !modes.has(first as Mode) ? argv : argv.slice(1);

  if (mode === "cli") {
    releaseCli(rest);
    return;
  }

  if (mode === "macos") {
    const { version, noPush } = parseMacosArgs(rest);
    const finalVersion = version ?? await readCliVersion();
    createMacosTag(finalVersion, noPush);
    return;
  }

  if (mode === "both") {
    const { noPush, cliArgs } = parseBothArgs(rest);
    releaseCli(cliArgs);

    // If CLI help was requested, skip creating/pushing a macOS tag.
    if (wantsHelp(cliArgs)) return;

    // Read final version from CLI package in case the CLI script normalized it.
    const finalVersion = await readCliVersion();
    createMacosTag(finalVersion, noPush);
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
