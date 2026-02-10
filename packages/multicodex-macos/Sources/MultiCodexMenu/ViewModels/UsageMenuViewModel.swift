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
                try? await Task.sleep(for: .seconds(60))
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
        guard switchingProfileName == nil else {
            return
        }

        Task {
            switchingProfileName = name
            defer { switchingProfileName = nil }

            do {
                try await cli.switchAccount(name: name)
                lastRefreshError = nil
                await performRefresh(refreshLive: true)
            } catch {
                lastRefreshError = error.localizedDescription
                cliResolutionHint = cli.resolutionHint
            }
        }
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

            profiles = mergeProfiles(accounts: accounts, limits: limits)
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

    private func mergeProfiles(accounts: AccountsListPayload, limits: LimitsPayload) -> [ProfileUsage] {
        let resultByAccount = Dictionary(uniqueKeysWithValues: limits.results.map { ($0.account, $0) })
        let errorsByAccount = Dictionary(uniqueKeysWithValues: limits.errors.map { ($0.account, $0.message) })

        let mapped = accounts.accounts.map { account in
            let result = resultByAccount[account.name]
            let usage = UsageFormatter.usageSummary(from: result?.snapshot)
            let source = UsageFormatter.sourceLabel(from: result)
            let usageError = errorsByAccount[account.name]

            return ProfileUsage(
                name: account.name,
                isCurrent: account.isCurrent || account.name == accounts.currentAccount,
                hasAuth: account.hasAuth,
                lastUsedAt: account.lastUsedAt,
                lastLoginStatus: account.lastLoginStatus,
                usage: usage,
                source: source,
                usageError: usageError
            )
        }

        return mapped.sorted { lhs, rhs in
            if lhs.isCurrent != rhs.isCurrent {
                return lhs.isCurrent
            }
            return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }
}
