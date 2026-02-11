import AppKit
import Foundation

@MainActor
final class UsageMenuViewModel: ObservableObject {
    @Published private(set) var profiles: [ProfileUsage] = []
    @Published private(set) var isRefreshing = false
    @Published private(set) var lastRefreshError: String?
    @Published private(set) var lastUpdatedAt: Date?
    @Published private(set) var switchingProfileName: String?
    @Published private(set) var cliResolutionHint: String?
    @Published private(set) var profileActionInFlightName: String?
    @Published private(set) var profileActionMessage: String?
    @Published private(set) var profileActionError: String?
    @Published var customNodePath: String
    @Published var resetDisplayMode: ResetDisplayMode

    private let cli = MultiCodexCLI()
    private let defaults = UserDefaults.standard
    private let customNodePathKey = "multicodexMenu.customNodePath"
    private let legacyCustomExecutableKey = "multicodexMenu.customExecutablePath"
    private let resetDisplayModeKey = "multicodexMenu.resetDisplayMode"
    private var refreshLoopTask: Task<Void, Never>?

    init() {
        customNodePath =
            defaults.string(forKey: customNodePathKey)
            ?? defaults.string(forKey: legacyCustomExecutableKey)
            ?? ""
        let rawResetMode = defaults.string(forKey: resetDisplayModeKey)
        resetDisplayMode = ResetDisplayMode(rawValue: rawResetMode ?? "") ?? .relative
        cli.customNodePath = customNodePath.isEmpty ? nil : customNodePath
        start()
    }

    deinit {
        refreshLoopTask?.cancel()
    }

    var currentProfile: ProfileUsage? {
        profiles.first(where: { $0.isCurrent })
    }

    var menuBarTitle: String {
        guard let current = currentProfile else {
            return profiles.isEmpty ? "mcx" : "mcx ?"
        }

        if let percent = current.primaryPercentText {
            return "mcx \(percent)"
        }

        return "mcx \(current.name)"
    }

    var menuBarSymbol: String {
        if lastRefreshError != nil {
            return "exclamationmark.triangle.fill"
        }

        guard let usage = currentProfile?.usage.fiveHour.usedPercent else {
            return "person.2.circle"
        }

        if usage >= 95 {
            return "flame.fill"
        }
        if usage >= 80 {
            return "gauge.with.dots.needle.67percent"
        }
        return "person.2.circle"
    }

    var subtitle: String {
        if let current = currentProfile {
            return "Current profile: \(current.name)"
        }
        return "No current profile selected"
    }

    var currentFiveHourFraction: Double {
        currentProfile?.usage.fiveHour.normalizedFraction ?? 0
    }

    var currentWeeklyFraction: Double {
        currentProfile?.usage.weekly.normalizedFraction ?? 0
    }

    var lastUpdatedLabel: String {
        guard let lastUpdatedAt else {
            return "Not refreshed yet"
        }
        return "Updated \(UsageFormatter.relativeDateFormatter.localizedString(for: lastUpdatedAt, relativeTo: Date()))"
    }

    func start() {
        guard refreshLoopTask == nil else {
            return
        }

        refresh()

        refreshLoopTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(MultiCodexCLI.limitsCacheTTLSeconds))
                if Task.isCancelled {
                    break
                }
                await performRefresh(refreshLive: false)
            }
        }
    }

    func refresh() {
        Task {
            await performRefresh(refreshLive: false)
        }
    }

    func refreshLive() {
        Task {
            await performRefresh(refreshLive: true)
        }
    }

    func switchToProfile(named name: String) {
        runSwitchAction(named: name) {
            try await self.cli.switchAccount(name: name)
            self.lastRefreshError = nil
            self.setProfileFeedback(message: "Now using \(name).", error: nil)
            await self.performRefresh(refreshLive: true)
        }
    }

    func addProfile(named rawName: String) {
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else {
            profileActionError = "Profile name cannot be empty."
            profileActionMessage = nil
            return
        }

        runProfileAction(for: name) {
            _ = try await self.cli.addAccount(name: name)
            return .success("Added profile \(name).")
        }
    }

    func renameProfile(from oldName: String, to rawNewName: String) {
        let newName = rawNewName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !newName.isEmpty else {
            profileActionError = "New profile name cannot be empty."
            profileActionMessage = nil
            return
        }

        guard oldName != newName else {
            profileActionError = nil
            profileActionMessage = "Profile name is unchanged."
            return
        }

        runProfileAction(for: oldName) {
            _ = try await self.cli.renameAccount(from: oldName, to: newName)
            return .success("Renamed \(oldName) to \(newName).")
        }
    }

    func removeProfile(named name: String, deleteData: Bool) {
        runProfileAction(for: name) {
            _ = try await self.cli.removeAccount(name: name, deleteData: deleteData)
            return .success(deleteData ? "Removed \(name) and deleted stored data." : "Removed \(name).")
        }
    }

    func importCurrentAuth(into name: String) {
        runProfileAction(for: name) {
            _ = try await self.cli.importDefaultAuth(into: name)
            return .success("Imported current ~/.codex/auth.json into \(name).")
        }
    }

    func checkLoginStatus(for name: String) {
        runProfileAction(for: name) {
            let status = try await self.cli.fetchStatus(name: name)
            let summary = status.output.trimmingCharacters(in: .whitespacesAndNewlines)
            if status.exitCode == 0 {
                return .success(summary.isEmpty ? "\(name): login status is OK." : "\(name): \(summary)")
            }
            return .failure(summary.isEmpty ? "\(name): login check failed." : "\(name): \(summary)")
        }
    }

    func openLoginInTerminal(for name: String) {
        guard profileActionInFlightName == nil else {
            return
        }

        do {
            try cli.openLoginInTerminal(account: name)
            setProfileFeedback(
                message: "Opened Terminal login for \(name). Complete login there, then refresh.",
                error: nil
            )
        } catch {
            setProfileFeedback(message: nil, error: error.localizedDescription)
        }
    }

    func clearProfileActionFeedback() {
        setProfileFeedback(message: nil, error: nil)
    }

    func toggleResetDisplayMode() {
        let nextMode = resetDisplayMode.next
        resetDisplayMode = nextMode
        defaults.set(nextMode.rawValue, forKey: resetDisplayModeKey)
    }

    func openMulticodexConfigDirectory() {
        let root = ProcessInfo.processInfo.environment["MULTICODEX_HOME"]
            ?? "\(NSHomeDirectory())/.config/multicodex"

        let url = URL(fileURLWithPath: root, isDirectory: true)
        NSWorkspace.shared.open(url)
    }

    func updateCustomNodePath(_ value: String) {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        customNodePath = trimmed
        if trimmed.isEmpty {
            defaults.removeObject(forKey: customNodePathKey)
            defaults.removeObject(forKey: legacyCustomExecutableKey)
            cli.customNodePath = nil
        } else {
            defaults.set(trimmed, forKey: customNodePathKey)
            cli.customNodePath = trimmed
        }
        refresh()
    }

    func clearCustomNodePath() {
        updateCustomNodePath("")
    }

    func chooseCustomNodePath() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.prompt = "Use"
        panel.message = "Choose the Node executable"

        if panel.runModal() == .OK, let path = panel.url?.path {
            updateCustomNodePath(path)
        }
    }

    private func performRefresh(refreshLive: Bool) async {
        if isRefreshing {
            return
        }

        isRefreshing = true
        defer { isRefreshing = false }

        do {
            let accounts = try await cli.fetchAccounts()
            let limits = try await cli.fetchLimits(refreshLive: refreshLive)

            profiles = UsageDataService.mergeProfiles(accounts: accounts, limits: limits)
            lastUpdatedAt = Date()
            cliResolutionHint = cli.resolutionHint

            if limits.errors.isEmpty {
                lastRefreshError = nil
            } else {
                let count = limits.errors.count
                let suffix = count == 1 ? "profile" : "profiles"
                lastRefreshError = "Usage fetch failed for \(count) \(suffix)."
            }
        } catch {
            lastRefreshError = error.localizedDescription
            cliResolutionHint = cli.resolutionHint
        }
    }

    private enum ProfileActionOutcome {
        case success(String)
        case failure(String)
    }

    private func setProfileFeedback(message: String?, error: String?) {
        profileActionMessage = message
        profileActionError = error
    }

    private func runProfileAction(
        for profileName: String,
        operation: @escaping () async throws -> ProfileActionOutcome
    ) {
        guard profileActionInFlightName == nil else {
            return
        }

        Task {
            profileActionInFlightName = profileName
            defer { profileActionInFlightName = nil }

            do {
                switch try await operation() {
                case let .success(message):
                    setProfileFeedback(message: message, error: nil)
                case let .failure(message):
                    setProfileFeedback(message: nil, error: message)
                }
                await performRefresh(refreshLive: false)
            } catch {
                setProfileFeedback(message: nil, error: error.localizedDescription)
            }
        }
    }

    private func runSwitchAction(
        named name: String,
        operation: @escaping () async throws -> Void
    ) {
        guard switchingProfileName == nil else {
            return
        }

        Task {
            switchingProfileName = name
            defer { switchingProfileName = nil }

            do {
                try await operation()
            } catch {
                lastRefreshError = error.localizedDescription
                cliResolutionHint = cli.resolutionHint
            }
        }
    }

}
