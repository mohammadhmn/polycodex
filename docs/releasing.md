# Releasing

## Checklist

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

