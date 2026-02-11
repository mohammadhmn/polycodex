# Releasing

## Recommended

Use the release helper script. It bumps versions, runs checks, builds, and packs.

- Patch release (default; commit + tag + push + publish): `bun run release`
- Prep without publishing: `bun run release --no-publish`
- Minor bump: `bun run release --minor`
- Major bump: `bun run release --major`
- Full release (explicit version): `bun run release --version X.Y.Z`

Monorepo note:
- CLI tags remain `vX.Y.Z`.
- macOS app releases use a separate tag namespace: `macos-vX.Y.Z`.
- Keeping separate prefixes avoids accidental cross-release triggers.

Notes:
- The script refuses to run if `git status` is not clean.
- `npm publish` may prompt for verification (2FA / browser), depending on your npm setup.

## Manual Checklist (if needed)

1) Update version
- `package.json` version

2) Run checks
- `bun run typecheck`
- `bun test`
- `bun run build`

3) Verify package contents
- `npm pack`

4) Publish to npm
- `npm publish`

5) Tag the release
- `git tag -a vX.Y.Z -m "vX.Y.Z"`
- `git push origin vX.Y.Z`
