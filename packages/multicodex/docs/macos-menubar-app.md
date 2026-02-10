# macOS menu bar app (native Swift)

This repo includes a native macOS menu bar app at:

- `packages/multicodex-macos`

It provides:

- Profile list from `multicodex accounts list --json`
- Usage for all profiles from `multicodex limits --json`
- One-click switching with `multicodex accounts use <name> --json`
- Progress-card UI with pace indicators and reset timer modes inspired by CodexBar/OpenUsage

## Build

```bash
cd packages/multicodex-macos
swift build
```

## Run

```bash
cd packages/multicodex-macos
swift run MultiCodexMenu
```

## Notes

- Requires macOS 13+.
- The app auto-refreshes every 60 seconds.
- The app bundles the `multicodex` CLI JS and runs it via Node.
- If Node is not auto-detected, use `Choose Node…` from the menu to point to your Node executable.
