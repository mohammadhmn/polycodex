import AppKit

final class MultiCodexAppDelegate: NSObject, NSApplicationDelegate {
    private var observers: [NSObjectProtocol] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        observeWindowLifecycle()
        DispatchQueue.main.async { [weak self] in
            self?.updateActivationPolicyForVisibleWindows()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    private func observeWindowLifecycle() {
        let center = NotificationCenter.default
        let names: [Notification.Name] = [
            NSWindow.didBecomeKeyNotification,
            NSWindow.didResignKeyNotification,
            NSWindow.didMiniaturizeNotification,
            NSWindow.didDeminiaturizeNotification,
            NSWindow.willCloseNotification,
        ]

        observers = names.map { name in
            center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.updateActivationPolicyForVisibleWindows()
            }
        }
    }

    private func updateActivationPolicyForVisibleWindows() {
        let hasRegularWindow = NSApp.windows.contains { window in
            window.isVisible && window.level == .normal && window.styleMask.contains(.titled)
        }

        let target: NSApplication.ActivationPolicy = hasRegularWindow ? .regular : .accessory
        if NSApp.activationPolicy() != target {
            NSApp.setActivationPolicy(target)
        }
    }
}
