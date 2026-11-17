import SwiftUI

struct DevicesView: View {
    @State private var devices: [Device] = []
    @State private var search = ""
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var filtered: [Device] {
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return devices }
        return devices.filter {
            ($0.licenseKey ?? "").lowercased().contains(term)
            || ($0.packageName ?? "").lowercased().contains(term)
            || ($0.deviceIdHash ?? "").lowercased().contains(term)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && devices.isEmpty {
                    LoadingView(text: "Carregando aparelhos…")
                } else if filtered.isEmpty {
                    ScrollView {
                        EmptyStateView(icon: "iphone", title: "Nenhum aparelho vinculado",
                                       message: "Quando um app protegido validar uma chave, o aparelho aparece aqui.")
                            .cardStyle()
                            .padding(Theme.padding)
                    }
                } else {
                    ScrollView {
                        VStack(spacing: 10) {
                            if let errorMessage = errorMessage {
                                ErrorBanner(message: errorMessage)
                            }
                            ForEach(filtered) { device in
                                DeviceRow(device: device) {
                                    ban(device)
                                }
                            }
                        }
                        .padding(.horizontal, Theme.padding)
                        .padding(.vertical, 10)
                    }
                }
            }
            .screenBackground()
            .navigationTitle("Aparelhos")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, prompt: "Buscar por chave ou pacote")
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func load() async {
        isLoading = devices.isEmpty
        errorMessage = nil
        do {
            let response: DevicesResponse = try await APIClient.shared.get("/api/devices")
            devices = response.devices ?? []
        } catch let error {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func ban(_ device: Device) {
        Task {
            do {
                try await APIClient.shared.postOK("/api/devices/ban", body: ["id": device.id, "ban": true])
                await load()
            } catch let error {
                errorMessage = error.localizedDescription
            }
        }
    }
}

struct DeviceRow: View {
    let device: Device
    var onBan: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(Formatters.shorten(device.deviceIdHash, to: 20))
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
                Spacer()
                if let ban = device.banOverride, !ban.isEmpty, ban != "0" {
                    StatusBadge(status: "banned")
                } else {
                    StatusBadge(status: "active")
                }
            }
            HStack(spacing: 12) {
                Label(device.packageName ?? "—", systemImage: "shippingbox")
                Label(Formatters.shorten(device.licenseKey, to: 10), systemImage: "key")
            }
            .font(.system(size: 11))
            .foregroundColor(Theme.muted)
            .lineLimit(1)

            HStack(spacing: 12) {
                Text("iOS \(device.lastOsSeen ?? "—")")
                Text("\(device.checkCount ?? 0) verificações")
                Spacer()
                Text(Formatters.relative(device.lastSeenAt))
            }
            .font(.system(size: 10))
            .foregroundColor(Theme.muted)

            HStack {
                Spacer()
                Button("Banir aparelho") { onBan() }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Theme.danger)
            }
        }
        .cardStyle(padding: 14)
    }
}
