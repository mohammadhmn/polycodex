import AppKit
import SwiftUI

struct UsageMenuContentView: View {
    @ObservedObject var viewModel: UsageMenuViewModel
    @Environment(\.openWindow) private var openWindow
    private let maxVisibleProfiles = 6

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header

            if let current = viewModel.currentProfile {
                currentStrip(profile: current)
            }

            if let error = viewModel.lastRefreshError {
                errorBanner(message: error)
            }

            profilesList

            footer
        }
        .padding(12)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("MultiCodex")
                    .font(.headline)

                Text(viewModel.lastUpdatedLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            HStack(spacing: 6) {
                ActionPillButton(title: "Cache", symbol: "arrow.clockwise", prominent: false, isDisabled: viewModel.isRefreshing) {
                    viewModel.refresh()
                }

                ActionPillButton(title: "Live", symbol: "bolt.horizontal.fill", prominent: true, isDisabled: viewModel.isRefreshing) {
                    viewModel.refreshLive()
                }
            }
        }
    }

    private func currentStrip(profile: ProfileUsage) -> some View {
        HStack(spacing: 8) {
            Text(profile.name)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)

            Spacer(minLength: 8)

            UsageValueChip(title: "5h", value: profile.usage.fiveHour.percentText)
            UsageValueChip(title: "weekly", value: profile.usage.weekly.percentText)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.accentColor.opacity(0.1))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color.accentColor.opacity(0.22), lineWidth: 1)
        )
    }

    @ViewBuilder
    private var profilesList: some View {
        if viewModel.profiles.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("No profiles")
                    .font(.subheadline.weight(.semibold))
                Text("Add a profile, then run `multicodex run <name> -- codex login`.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        } else {
            VStack(spacing: 8) {
                ForEach(visibleProfiles) { profile in
                    ProfileUsageCardView(
                        profile: profile,
                        resetDisplayMode: viewModel.resetDisplayMode,
                        isSwitching: viewModel.switchingProfileName == profile.name,
                        onSwitch: { viewModel.switchToProfile(named: profile.name) }
                    )
                }

                if hiddenProfilesCount > 0 {
                    Text("+\(hiddenProfilesCount) more profiles in Settings")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 2)
                }
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 10) {
            Button(viewModel.resetDisplayMode.buttonLabel) {
                viewModel.toggleResetDisplayMode()
            }
            .buttonStyle(.plain)
            .font(.caption)

            Spacer()

            Button("Config") {
                viewModel.openMulticodexConfigDirectory()
            }
            .buttonStyle(.plain)
            .font(.caption)

            Button("Settings") {
                openSettingsWindow()
            }
            .buttonStyle(.plain)
            .font(.caption)
        }
    }

    private func errorBanner(message: String) -> some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .font(.caption)
            .foregroundStyle(.red)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func openSettingsWindow() {
        NSApp.setActivationPolicy(.regular)
        openWindow(id: "settings")
        NSApp.activate(ignoringOtherApps: true)
    }

    private var visibleProfiles: [ProfileUsage] {
        Array(viewModel.profiles.prefix(maxVisibleProfiles))
    }

    private var hiddenProfilesCount: Int {
        max(0, viewModel.profiles.count - visibleProfiles.count)
    }
}

private struct UsageValueChip: View {
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: 4) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption.weight(.semibold))
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(Color.primary.opacity(0.06), in: Capsule())
    }
}
