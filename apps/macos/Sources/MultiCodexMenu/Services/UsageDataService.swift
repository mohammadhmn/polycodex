import Foundation

enum UsageDataService {
    static func mergeProfiles(accounts: AccountsListPayload, limits: LimitsPayload) -> [ProfileUsage] {
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
