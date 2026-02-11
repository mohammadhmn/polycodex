import Foundation

struct NodeRuntime {
    let executableURL: URL
    let prefixArguments: [String]
    let display: String
}

struct ResolvedCommand {
    let runtime: NodeRuntime
    let bundledCLIURL: URL

    var commandDisplay: String {
        "\(runtime.display) \(bundledCLIURL.path)"
    }
}

enum CLIRuntimeResolver {
    static func resolveCommand(
        fileManager: FileManager,
        customNodePath: String?
    ) throws -> ResolvedCommand {
        let bundledCLIURL = try resolveBundledCLI(fileManager: fileManager)
        let runtime = try resolveNodeRuntime(fileManager: fileManager, customNodePath: customNodePath)
        return ResolvedCommand(runtime: runtime, bundledCLIURL: bundledCLIURL)
    }

    static func resolveBundledCLI(fileManager: FileManager) throws -> URL {
        let candidates: [URL?] = [
            Bundle.module.url(forResource: "multicodex-cli", withExtension: "js", subdirectory: "Resources"),
            Bundle.module.url(forResource: "multicodex-cli", withExtension: "js"),
            Bundle.module.resourceURL?.appendingPathComponent("Resources/multicodex-cli.js"),
            Bundle.main.url(forResource: "multicodex-cli", withExtension: "js", subdirectory: "Resources"),
            Bundle.main.url(forResource: "multicodex-cli", withExtension: "js"),
        ]

        for case let url? in candidates where fileManager.fileExists(atPath: url.path) {
            return url
        }

        throw MultiCodexCLIError(
            message: "Bundled multicodex CLI is missing. Rebuild app package so Resources/multicodex-cli.js is embedded."
        )
    }

    static func resolveNodeRuntime(
        fileManager: FileManager,
        customNodePath: String?
    ) throws -> NodeRuntime {
        if let raw = customNodePath?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty {
            return try resolveNodeCandidate(fileManager: fileManager, raw: raw, source: "custom")
        }

        if let raw = ProcessInfo.processInfo.environment["MULTICODEX_NODE"]?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty {
            return try resolveNodeCandidate(fileManager: fileManager, raw: raw, source: "MULTICODEX_NODE")
        }

        if let raw = ProcessInfo.processInfo.environment["NODE_BINARY"]?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty {
            return try resolveNodeCandidate(fileManager: fileManager, raw: raw, source: "NODE_BINARY")
        }

        let knownPaths = [
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ]

        for nodePath in knownPaths where fileManager.isExecutableFile(atPath: nodePath) {
            return NodeRuntime(
                executableURL: URL(fileURLWithPath: nodePath),
                prefixArguments: [],
                display: nodePath
            )
        }

        return NodeRuntime(
            executableURL: URL(fileURLWithPath: "/usr/bin/env"),
            prefixArguments: ["node"],
            display: "node (from PATH)"
        )
    }

    private static func resolveNodeCandidate(
        fileManager: FileManager,
        raw: String,
        source: String
    ) throws -> NodeRuntime {
        let expanded = (raw as NSString).expandingTildeInPath
        if expanded.contains("/") {
            if fileManager.isExecutableFile(atPath: expanded) {
                return NodeRuntime(
                    executableURL: URL(fileURLWithPath: expanded),
                    prefixArguments: [],
                    display: "\(expanded) [\(source)]"
                )
            }
            throw MultiCodexCLIError(message: "Configured Node executable is not executable: \(expanded)")
        }

        return NodeRuntime(
            executableURL: URL(fileURLWithPath: "/usr/bin/env"),
            prefixArguments: [expanded],
            display: "\(expanded) (from PATH, \(source))"
        )
    }
}
