set shell := ["bash", "-euo", "pipefail", "-c"]

app_name := "MultiCodex"
resource_bundle := "macos_MultiCodexMenu.bundle"
build_root := "build"
dist_dir := "build/dist"
dmg_staging := "build/dmg-staging"
app_bundle := "build/dist/MultiCodex.app"
dmg_path := "build/dist/MultiCodex.dmg"
default_bundle_id := "org.swift.swiftpm.macos.MultiCodex"
app_iconset := "Assets/AppIcon.appiconset"
app_icon_icns := "Assets/AppIcon.icns"

_bundle configuration:
    if [[ "{{configuration}}" != "debug" && "{{configuration}}" != "release" ]]; then echo "Invalid configuration: {{configuration}} (use debug|release)"; exit 2; fi
    bun run sync:cli
    bash scripts/generate-app-icon.sh "{{app_iconset}}" "{{app_icon_icns}}"
    swift build -c "{{configuration}}"
    if [[ ! -x ".build/{{configuration}}/{{app_name}}" ]]; then echo "Expected executable not found: .build/{{configuration}}/{{app_name}}"; exit 1; fi
    if [[ ! -d ".build/{{configuration}}/{{resource_bundle}}" ]]; then echo "Expected resource bundle not found: .build/{{configuration}}/{{resource_bundle}}"; exit 1; fi
    if [[ ! -f "{{app_icon_icns}}" ]]; then echo "Expected icon not found: {{app_icon_icns}}"; exit 1; fi
    mkdir -p "{{app_bundle}}/Contents/MacOS" "{{app_bundle}}/Contents/Resources"
    if [[ -d "{{app_bundle}}/Contents/MacOS" ]]; then find "{{app_bundle}}/Contents/MacOS" -mindepth 1 -delete; fi
    if [[ -d "{{app_bundle}}/Contents/Resources" ]]; then find "{{app_bundle}}/Contents/Resources" -mindepth 1 -delete; fi
    cp ".build/{{configuration}}/{{app_name}}" "{{app_bundle}}/Contents/MacOS/{{app_name}}"
    chmod +x "{{app_bundle}}/Contents/MacOS/{{app_name}}"
    if [[ -d "{{app_bundle}}/{{resource_bundle}}" ]]; then find "{{app_bundle}}/{{resource_bundle}}" -mindepth 1 -delete; fi
    ditto ".build/{{configuration}}/{{resource_bundle}}" "{{app_bundle}}/{{resource_bundle}}"
    rm -f "{{app_bundle}}/Contents/Info.plist"
    printf '%s\n' '<?xml version="1.0" encoding="UTF-8"?>' '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">' '<plist version="1.0"><dict/></plist>' > "{{app_bundle}}/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Add :CFBundleDevelopmentRegion string en" "{{app_bundle}}/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Add :CFBundleExecutable string {{app_name}}" "{{app_bundle}}/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string {{default_bundle_id}}" "{{app_bundle}}/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Add :CFBundleInfoDictionaryVersion string 6.0" "{{app_bundle}}/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string AppIcon" "{{app_bundle}}/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Add :CFBundleName string {{app_name}}" "{{app_bundle}}/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Add :CFBundlePackageType string APPL" "{{app_bundle}}/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string 0.1.0" "{{app_bundle}}/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Add :CFBundleVersion string 1" "{{app_bundle}}/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Add :LSMinimumSystemVersion string 13.0" "{{app_bundle}}/Contents/Info.plist"
    if [[ "{{configuration}}" == "debug" ]]; then /usr/libexec/PlistBuddy -c "Add :LSUIElement bool false" "{{app_bundle}}/Contents/Info.plist"; else /usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "{{app_bundle}}/Contents/Info.plist"; fi
    cp "{{app_icon_icns}}" "{{app_bundle}}/Contents/Resources/AppIcon.icns"
    @echo "Created {{app_bundle}}"

default:
    @just list

list:
    @echo "Common commands:"
    @echo "  just dev               Build + run debug app"
    @echo "  just dmg               Build release DMG"
    @echo "  just ci                Local CI checks"
    @echo "  just doctor            Verify toolchain and bundled CLI"
    @echo "  just release minor     Create/push macos-v tag"
    @echo "  just kickoff-release   Patch bump + release tag"
    @echo "  just clean             Clean build artifacts"

doctor:
    swift --version
    bun --version
    if command -v node >/dev/null 2>&1; then node --version; else echo "node not found in PATH (required at runtime)"; fi
    bun run sync:cli
    bash scripts/generate-app-icon.sh "{{app_iconset}}" "{{app_icon_icns}}"
    test -f Sources/MultiCodexMenu/Resources/multicodex-cli.js
    test -f "{{app_icon_icns}}"
    @echo "doctor: bundled CLI resource is ready"

dev:
    just _bundle debug
    pkill -x "{{app_name}}" || true
    open "{{app_bundle}}"

dmg:
    just _bundle release
    mkdir -p "{{dist_dir}}" "{{dmg_staging}}"
    if [[ -d "{{dmg_staging}}" ]]; then find "{{dmg_staging}}" -mindepth 1 -delete; fi
    ditto "{{app_bundle}}" "{{dmg_staging}}/{{app_name}}.app"
    ln -snf /Applications "{{dmg_staging}}/Applications"
    hdiutil create -volname "{{app_name}}" -srcfolder "{{dmg_staging}}" -ov -format UDZO "{{dmg_path}}"
    @echo "Created {{dmg_path}}"

ci:
    just doctor
    swift build -c debug
    bun run test
    bun run typecheck

clean:
    swift package clean || true
    swift package reset || true
    if [[ -d "{{build_root}}" ]]; then find "{{build_root}}" -mindepth 1 -delete; fi

release version:
    bash ./scripts/release.sh "{{version}}"

kickoff-release version="patch":
    scripts/release.sh --bump "{{version}}"
