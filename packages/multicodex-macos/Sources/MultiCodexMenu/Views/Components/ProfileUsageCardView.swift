import SwiftUI

struct ProfileUsageCardView: View {
    let profile: ProfileUsage
    let resetDisplayMode: ResetDisplayMode
    let isSwitching: Bool
    let onSwitch: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            rowTop
            rowUsage
            rowMeta

            if let usageError = profile.usageError {
                Text(usageError)
                    .font(.caption2)
                    .foregroundStyle(.red)
                    .lineLimit(1)
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(profile.isCurrent ? Color.accentColor.opacity(0.45) : Color.secondary.opacity(0.16), lineWidth: 1)
        )
    }

    private var rowTop: some View {
        HStack(spacing: 8) {
            Text(profile.name)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)

            if profile.isCurrent {
                Text("Current")
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(Color.accentColor.opacity(0.16), in: Capsule())
            }

            Spacer(minLength: 8)

            if !profile.isCurrent {
                Button {
                    onSwitch()
                } label: {
                    if isSwitching {
                        ProgressView()
                            .controlSize(.small)
                            .frame(width: 44)
                    } else {
                        Text("Switch")
                            .font(.caption.weight(.semibold))
                            .frame(minWidth: 44)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(isSwitching)
            }
        }
    }

    private var rowUsage: some View {
        HStack(spacing: 8) {
            MinimalMetricView(metric: profile.usage.fiveHour, title: "5h", resetDisplayMode: resetDisplayMode)
            MinimalMetricView(metric: profile.usage.weekly, title: "weekly", resetDisplayMode: resetDisplayMode)
        }
    }

    private var rowMeta: some View {
        HStack(spacing: 10) {
            Text(profile.source)
                .font(.caption2)
                .foregroundStyle(.secondary)

            Text(profile.lastUsedLabel)
                .font(.caption2)
                .foregroundStyle(.secondary)

            if !profile.hasAuth {
                Text("Auth needed")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.orange)
            }
        }
        .lineLimit(1)
    }
}

private struct MinimalMetricView: View {
    let metric: UsageMetric
    let title: String
    let resetDisplayMode: ResetDisplayMode

    private var tone: Color {
        let value = metric.usedPercent ?? 0
        if value >= 95 { return .red }
        if value >= 80 { return .orange }
        return .green
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(metric.percentText)
                    .font(.caption.weight(.semibold))
            }

            ProgressView(value: metric.normalizedFraction)
                .tint(tone)

            Text(metric.resetText(mode: resetDisplayMode))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}
