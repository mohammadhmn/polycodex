import Foundation

final class MultiCodexCLI {
    static let limitsCacheTTLSeconds = 300

    private struct NodeRuntime {
        let executableURL: URL
        let prefixArguments: [String]
        let display: String
    }

    private struct ResolvedCommand {
        let runtime: NodeRuntime
        let bundledCLIURL: URL

        var commandDisplay: String {
            "\(runtime.display) \(bundledCLIURL.path)"
        }
    }

    private struct ProcessResult {
        let exitCode: Int32
        let stdout: String
        let stderr: String
        let commandDisplay: String
    }

    private let fileManager = FileManager.default

    var customNodePath: String?
    private(set) var resolutionHint: String?

    func fetchAccounts() async throws -> AccountsListPayload {
        let envelope: CommandEnvelope<AccountsListPayload> = try await runEnvelope(arguments: ["accounts", "list", "--json"])
        if let data = envelope.data {
            return data
        }
        throw makeCommandError(from: envelope, fallback: "Failed to load accounts.")
    }

    func fetchLimits(refreshLive: Bool) async throws -> LimitsPayload {
        var args = ["limits", "--json", "--ttl", String(Self.limitsCacheTTLSeconds)]
        if refreshLive {
            args.append("--refresh")
        }

        let envelope: CommandEnvelope<LimitsPayload> = try await runEnvelope(arguments: args)
        if let data = envelope.data {
            return data
        }
        throw makeCommandError(from: envelope, fallback: "Failed to load usage limits.")
    }

    func switchAccount(name: String) async throws {
        let envelope: CommandEnvelope<SwitchAccountPayload> = try await runEnvelope(arguments: ["accounts", "use", name, "--json"])
        if envelope.ok {
            return
        }
        throw makeCommandError(from: envelope, fallback: "Failed to switch account to \(name).")
    }

    private func runEnvelope<T: Decodable>(arguments: [String]) async throws -> CommandEnvelope<T> {
        let result = try await run(arguments: arguments)

        let output = result.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
        if output.isEmpty {
            let stderrText = result.stderr.trimmingCharacters(in: .whitespacesAndNewlines)
            let message = stderrText.isEmpty
                ? "No JSON output from command: \(result.commandDisplay)"
                : stderrText
            throw MultiCodexCLIError(message: message)
        }

        do {
            let decoded = try JSONDecoder().decode(CommandEnvelope<T>.self, from: Data(output.utf8))
            return decoded
        } catch {
            throw MultiCodexCLIError(
                message: "Could not parse multicodex JSON output. Command: \(result.commandDisplay). Output: \(output.prefix(200))"
            )
        }
    }

    private func run(arguments: [String]) async throws -> ProcessResult {
        let resolved = try resolveCommand()

        let result: ProcessResult = try await Task.detached(priority: .userInitiated) {
            let process = Process()
            process.executableURL = resolved.runtime.executableURL
            process.arguments = resolved.runtime.prefixArguments + [resolved.bundledCLIURL.path] + arguments

            var env = ProcessInfo.processInfo.environment
            if let existingPath = env["PATH"], !existingPath.contains("/opt/homebrew/bin") {
                env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + existingPath
            }
            process.environment = env

            let stdoutPipe = Pipe()
            let stderrPipe = Pipe()
            process.standardOutput = stdoutPipe
            process.standardError = stderrPipe

            do {
                try process.run()
            } catch {
                throw MultiCodexCLIError(message: "Could not run \(resolved.commandDisplay): \(error.localizedDescription)")
            }

            process.waitUntilExit()

            let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
            let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()

            let stdout = String(data: stdoutData, encoding: .utf8) ?? ""
            let stderr = String(data: stderrData, encoding: .utf8) ?? ""

            return ProcessResult(
                exitCode: process.terminationStatus,
                stdout: stdout,
                stderr: stderr,
                commandDisplay: resolved.commandDisplay
            )
        }.value

        if result.exitCode != 0 && result.stdout.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let stderrText = result.stderr.trimmingCharacters(in: .whitespacesAndNewlines)
            if !stderrText.isEmpty {
                throw MultiCodexCLIError(message: stderrText)
            }
            throw MultiCodexCLIError(message: "Command failed: \(result.commandDisplay) (exit \(result.exitCode))")
        }

        return result
    }

    private func resolveCommand() throws -> ResolvedCommand {
        let bundledCLIURL = try resolveBundledCLI()
        let runtime = try resolveNodeRuntime()
        resolutionHint = "Bundled CLI: \(bundledCLIURL.path) | Node: \(runtime.display)"
        return ResolvedCommand(runtime: runtime, bundledCLIURL: bundledCLIURL)
    }

    private func resolveBundledCLI() throws -> URL {
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

    private func resolveNodeRuntime() throws -> NodeRuntime {
        if let raw = customNodePath?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty {
            return try resolveNodeCandidate(raw, source: "custom")
        }

        if let raw = ProcessInfo.processInfo.environment["MULTICODEX_NODE"]?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty {
            return try resolveNodeCandidate(raw, source: "MULTICODEX_NODE")
        }

        if let raw = ProcessInfo.processInfo.environment["NODE_BINARY"]?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty {
            return try resolveNodeCandidate(raw, source: "NODE_BINARY")
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

    private func resolveNodeCandidate(_ raw: String, source: String) throws -> NodeRuntime {
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

    private func makeCommandError<T>(from envelope: CommandEnvelope<T>, fallback: String) -> Error {
        if let message = envelope.error?.message {
            return MultiCodexCLIError(message: message)
        }
        return MultiCodexCLIError(message: fallback)
    }
}

struct MultiCodexCLIError: LocalizedError {
    let message: String

    var errorDescription: String? {
        message
    }
}
