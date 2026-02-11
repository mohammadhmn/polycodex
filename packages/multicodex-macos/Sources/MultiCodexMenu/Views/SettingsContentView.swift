import SwiftUI

struct SettingsContentView: View {
    @ObservedObject var viewModel: UsageMenuViewModel
    @State private var nodePathDraft = ""
    @State private var newProfileName = ""
    @State private var renameDrafts: [String: String] = [:]

    var body: some View {
        ZStack {
            Color(nsColor: .windowBackgroundColor)
                .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    headerCard
                    profilesCard
                    runtimeCard
                    preferencesCard
                    diagnosticsCard
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollIndicators(.hidden)
        }
        .onAppear {
            nodePathDraft = viewModel.customNodePath
            syncRenameDrafts()
        }
        .onChange(of: viewModel.customNodePath) { nodePathDraft = $0 }
        .onChange(of: viewModel.profiles.map(\.name)) { _ in
            syncRenameDrafts()
        }
    }

    private var headerCard: some View {
        SettingsCard {
            VStack(alignment: .leading, spacing: 6) {
                Text("Settings")
                    .font(.title3.weight(.semibold))

                Text("Manage profiles, login flows, runtime path, and refresh behavior.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                HStack(spacing: 8) {
                    simpleActionButton("Refresh", symbol: "arrow.clockwise") {
                        viewModel.refresh()
                    }

                    simpleActionButton("Refresh Live", symbol: "bolt.horizontal.fill", prominent: true) {
                        viewModel.refreshLive()
                    }
                }
            }
        }
    }

    private var profilesCard: some View {
        SettingsCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Profiles & Login")
                    .font(.headline)

                HStack(spacing: 8) {
                    TextField("new-profile", text: $newProfileName)
                        .textFieldStyle(.roundedBorder)

                    simpleActionButton("Add", symbol: "plus", prominent: true) {
                        viewModel.addProfile(named: newProfileName)
                        newProfileName = ""
                    }
                    .disabled(newProfileName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isProfileActionRunning)
                }

                if let message = viewModel.profileActionMessage {
                    feedbackRow(message, color: .green)
                }

                if let error = viewModel.profileActionError {
                    feedbackRow(error, color: .red)
                }

                if viewModel.profiles.isEmpty {
                    Text("No profiles configured.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 4)
                } else {
                    VStack(spacing: 8) {
                        ForEach(viewModel.profiles) { profile in
                            profileRow(profile)
                        }
                    }
                }
            }
        }
    }

    private func profileRow(_ profile: ProfileUsage) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(profile.name)
                    .font(.subheadline.weight(.semibold))

                if profile.isCurrent {
                    pill("Current", color: .accentColor)
                }
                if !profile.hasAuth {
                    pill("No auth", color: .orange)
                }

                Spacer(minLength: 8)

                if viewModel.profileActionInFlightName == profile.name {
                    ProgressView()
                        .controlSize(.small)
                }
            }

            HStack(spacing: 8) {
                if !profile.isCurrent {
                    simpleActionButton("Use", symbol: "checkmark.circle.fill", prominent: true) {
                        viewModel.switchToProfile(named: profile.name)
                    }
                    .disabled(isProfileActionRunning)
                }

                simpleActionButton("Login", symbol: "person.crop.circle.badge.plus") {
                    viewModel.openLoginInTerminal(for: profile.name)
                }
                .disabled(isProfileActionRunning)

                simpleActionButton("Status", symbol: "person.crop.circle.badge.checkmark") {
                    viewModel.checkLoginStatus(for: profile.name)
                }
                .disabled(isProfileActionRunning)

                Menu("More") {
                    Button("Import current auth") {
                        viewModel.importCurrentAuth(into: profile.name)
                    }

                    Divider()

                    Button("Remove profile", role: .destructive) {
                        viewModel.removeProfile(named: profile.name, deleteData: false)
                    }

                    Button("Remove + delete data", role: .destructive) {
                        viewModel.removeProfile(named: profile.name, deleteData: true)
                    }
                }
                .disabled(isProfileActionRunning)
            }

            HStack(spacing: 8) {
                TextField("rename", text: renameBinding(for: profile.name))
                    .textFieldStyle(.roundedBorder)

                simpleActionButton("Rename", symbol: "pencil") {
                    viewModel.renameProfile(from: profile.name, to: renameDrafts[profile.name] ?? profile.name)
                }
                .disabled(cannotRename(profile.name) || isProfileActionRunning)
            }

            if let status = profile.lastLoginStatusPreview {
                Text(status)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.secondary.opacity(0.07), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var runtimeCard: some View {
        SettingsCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Node Runtime")
                    .font(.headline)

                TextField("/opt/homebrew/bin/node", text: $nodePathDraft)
                    .textFieldStyle(.roundedBorder)

                HStack(spacing: 8) {
                    simpleActionButton("Save", symbol: "checkmark", prominent: true) {
                        viewModel.updateCustomNodePath(nodePathDraft)
                    }
                    .disabled(normalized(nodePathDraft) == viewModel.customNodePath)

                    simpleActionButton("Choose", symbol: "folder") {
                        viewModel.chooseCustomNodePath()
                    }

                    simpleActionButton("Use Auto", symbol: "sparkles") {
                        nodePathDraft = ""
                        viewModel.clearCustomNodePath()
                    }
                    .disabled(viewModel.customNodePath.isEmpty)
                }

                Text("Leave empty to auto-detect Node from env vars, standard install paths, or PATH.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var preferencesCard: some View {
        SettingsCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Preferences")
                    .font(.headline)

                HStack {
                    Text("Reset labels")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    simpleActionButton(viewModel.resetDisplayMode.buttonLabel, symbol: "clock") {
                        viewModel.toggleResetDisplayMode()
                    }
                }
            }
        }
    }

    private var diagnosticsCard: some View {
        SettingsCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Diagnostics")
                    .font(.headline)

                if let hint = viewModel.cliResolutionHint {
                    Text(hint)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                } else {
                    Text("Run a refresh to see command resolution details.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                simpleActionButton("Open multicodex config directory", symbol: "folder.fill") {
                    viewModel.openMulticodexConfigDirectory()
                }
            }
        }
    }

    private func feedbackRow(_ text: String, color: Color) -> some View {
        HStack {
            Text(text)
                .font(.caption)
                .foregroundStyle(color)
            Spacer()
            Button("Dismiss") {
                viewModel.clearProfileActionFeedback()
            }
            .buttonStyle(.plain)
            .font(.caption2)
        }
    }

    private var isProfileActionRunning: Bool {
        viewModel.profileActionInFlightName != nil || viewModel.switchingProfileName != nil
    }

    private func renameBinding(for profileName: String) -> Binding<String> {
        Binding(
            get: { renameDrafts[profileName] ?? profileName },
            set: { renameDrafts[profileName] = $0 }
        )
    }

    private func cannotRename(_ profileName: String) -> Bool {
        let raw = renameDrafts[profileName] ?? profileName
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty || trimmed == profileName
    }

    private func syncRenameDrafts() {
        let names = Set(viewModel.profiles.map(\.name))
        renameDrafts = renameDrafts.filter { names.contains($0.key) }
        for profile in viewModel.profiles where renameDrafts[profile.name] == nil {
            renameDrafts[profile.name] = profile.name
        }
    }

    private func normalized(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func pill(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.14), in: Capsule())
            .foregroundStyle(color)
    }

    private func simpleActionButton(_ title: String, symbol: String, prominent: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.caption.weight(.semibold))
                .labelStyle(.titleAndIcon)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(prominent ? Color.accentColor.opacity(0.9) : Color.secondary.opacity(0.14))
                )
                .foregroundStyle(prominent ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }
}

private struct SettingsCard<Content: View>: View {
    @ViewBuilder let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.secondary.opacity(0.16), lineWidth: 1)
        )
    }
}
