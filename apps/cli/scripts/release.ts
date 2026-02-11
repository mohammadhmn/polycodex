import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

type ReleaseType = "patch" | "minor" | "major";

function usage(exitCode: number): never {
  const msg = `
Usage:
  bun run release [--patch|--minor|--major|--type <t>|--version <x.y.z>] [options]

Options:
  --type <patch|minor|major>   Bump by type (default: patch)
  --version <x.y.z>            Set explicit version
  --no-commit                  Skip git commit (default: commit)
  --no-tag                     Skip git tag (default: tag)
  --no-push                    Skip pushing to origin (default: push)
  --no-publish                 Skip npm publish (default: publish)

Examples:
  bun run release
  bun run release --no-publish
  bun run release --minor
  bun run release --major
`.trim();
  console.error(msg);
  process.exit(exitCode);
}

function run(cmd: string): void {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function runCapture(cmd: string): string {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8");
}

function parseArgs(argv: string[]): {
  type: ReleaseType;
  version?: string;
  commit: boolean;
  tag: boolean;
  push: boolean;
  publish: boolean;
} {
  let type: ReleaseType = "patch";
  let version: string | undefined;
  let commit = true;
  let tag = true;
  let push = true;
  let publish = true;

  const args = [...argv];
  while (args.length) {
    const a = args.shift();
    if (!a) break;
    if (a === "-h" || a === "--help") usage(0);
    if (a === "--patch") {
      type = "patch";
      continue;
    }
    if (a === "--minor") {
      type = "minor";
      continue;
    }
    if (a === "--major") {
      type = "major";
      continue;
    }
    if (a === "--type") {
      const t = args.shift();
      if (t !== "patch" && t !== "minor" && t !== "major") usage(2);
      type = t;
      continue;
    }
    if (a === "--version") {
      version = args.shift();
      if (!version) usage(2);
      continue;
    }
    if (a === "--no-commit") {
      commit = false;
      continue;
    }
    if (a === "--no-tag") {
      tag = false;
      continue;
    }
    if (a === "--no-publish") {
      publish = false;
      continue;
    }
    if (a === "--no-push") {
      push = false;
      continue;
    }
    console.error(`Unknown arg: ${a}`);
    usage(2);
  }

  return { type, version, commit, tag, push, publish };
}

function isValidSemver(v: string): boolean {
  return /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(v);
}

function bumpSemver(current: string, type: ReleaseType): string {
  const m = /^([0-9]+)\.([0-9]+)\.([0-9]+)(.*)?$/.exec(current);
  if (!m) throw new Error(`Unsupported current version: ${current}`);
  let major = Number(m[1]);
  let minor = Number(m[2]);
  let patch = Number(m[3]);
  if (type === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (type === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function nextPatchVersion(current: string): string {
  return bumpSemver(current, "patch");
}

function npmVersionExists(packageName: string, version: string): boolean {
  try {
    const cmd = `npm view ${JSON.stringify(`${packageName}@${version}`)} version --json`;
    const out = runCapture(cmd).trim();
    if (!out) return false;
    if (out === "null") return false;
    return true;
  } catch {
    return false;
  }
}

function resolveReleaseVersion(args: {
  packageName: string;
  currentVersion: string;
  explicitVersion?: string;
  releaseType: ReleaseType;
}): { version: string; adjusted: boolean } {
  if (args.explicitVersion) {
    if (npmVersionExists(args.packageName, args.explicitVersion)) {
      throw new Error(
        `Version ${args.explicitVersion} is already published for ${args.packageName}. Choose a different version (e.g. --version ${nextPatchVersion(args.explicitVersion)}).`,
      );
    }
    return { version: args.explicitVersion, adjusted: false };
  }

  let candidate = bumpSemver(args.currentVersion, args.releaseType);
  let adjusted = false;
  while (npmVersionExists(args.packageName, candidate)) {
    candidate = nextPatchVersion(candidate);
    adjusted = true;
  }
  return { version: candidate, adjusted };
}

async function ensureCleanGitTree(): Promise<void> {
  const out = runCapture("git status --porcelain=v1").trim();
  if (out) throw new Error("Working tree not clean. Commit or stash your changes first.");
}

async function updatePackageVersion(newVersion: string): Promise<void> {
  const pkgPath = path.join(process.cwd(), "package.json");
  const raw = await fs.readFile(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { version?: string };
  if (!pkg.version) throw new Error("package.json missing version");
  pkg.version = newVersion;
  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
}

async function updateCliVersion(newVersion: string): Promise<void> {
  const cliPath = path.join(process.cwd(), "src", "cli.ts");
  const raw = await fs.readFile(cliPath, "utf8");
  const next = raw.replace(
    /\.version\(\s*(['"])([^'"]+)\1\s*,/m,
    `.version("${
      newVersion
    }",`,
  );
  if (next === raw) throw new Error("Failed to update src/cli.ts commander .version(...)");
  await fs.writeFile(cliPath, next, "utf8");
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  await ensureCleanGitTree();

  const pkgPath = path.join(process.cwd(), "package.json");
  const pkgRaw = await fs.readFile(pkgPath, "utf8");
  const pkg = JSON.parse(pkgRaw) as { name?: string; version?: string };
  if (!pkg.version) throw new Error("package.json missing version");

  const packageName = pkg.name ?? "package";
  const { version: nextVersion, adjusted } = resolveReleaseVersion({
    packageName,
    currentVersion: pkg.version,
    explicitVersion: opts.version,
    releaseType: opts.type,
  });
  if (!isValidSemver(nextVersion)) throw new Error(`Invalid semver: ${nextVersion}`);

  console.log(`Releasing ${packageName} v${nextVersion}`);
  if (adjusted) {
    console.log(`Note: requested bump was already published; auto-selected next available patch v${nextVersion}.`);
  }

  await updatePackageVersion(nextVersion);
  await updateCliVersion(nextVersion);

  run("bun run typecheck");
  run("bun test");
  run("bun run build");

  const packDir = path.join(process.cwd(), ".release-pack");
  await fs.rm(packDir, { recursive: true, force: true });
  await fs.mkdir(packDir, { recursive: true });
  const packed = runCapture(`npm pack --silent --pack-destination ${JSON.stringify(packDir)}`).trim();
  console.log(`Packed: ${packed}`);
  await fs.rm(packDir, { recursive: true, force: true });

  if (opts.commit) {
    run("git add package.json src/cli.ts");
    run(`git commit -m ${JSON.stringify(`chore: release v${nextVersion}`)}`);
  }

  if (opts.tag) {
    if (!opts.commit) throw new Error("--no-commit cannot be used with tagging enabled.");
    run(`git tag -a v${nextVersion} -m ${JSON.stringify(`v${nextVersion}`)}`);
  }

  if (opts.push) {
    if (!opts.commit) throw new Error("--push requires committing the release.");
    run("git push");
    if (opts.tag) run(`git push origin v${nextVersion}`);
  }

  if (opts.publish) {
    if (!opts.commit) throw new Error("--no-commit cannot be used with publishing enabled.");
    run("npm publish");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
