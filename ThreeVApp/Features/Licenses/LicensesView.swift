import SwiftUI

struct LicensesView: View {
    @EnvironmentObject private var store: Store

    var packageFilter: Package?

    @State private var licenses: [License] = []
    @State private var packages: [Package] = []
    @State private var selectedPackageId: Int?
    @State private var search = ""
    @State private var statusFilter = "todas"
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showCreator = false
    @State private var createdKeys: [String]?

    init(packageFilter: Package? = nil) {
        self.packageFilter = packageFilter
    }

    private var filtered: [License] {
        var result = licenses
        if statusFilter != "todas" {
            result = result.filter { $0.status == statusFilter }
        }
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !term.isEmpty {
            result = result.filter {
                $0.licenseKey.lowercased().contains(term)
                || ($0.packageName ?? "").lowercased().contains(term)
            }
        }
        return result
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                filters
                content
            }
            .screenBackground()
            .navigationTitle(packageFilter?.name ?? "Licenças")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, prompt: "Buscar chave ou pacote")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showCreator = true
                    } label: {
                        Image(systemName: "plus")
                            .foregroundColor(Theme.accent)
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .sheet(isPresented: $showCreator) {
                LicenseCreateView(packages: packages, preselected: packageFilter) { keys in
                    createdKeys = keys
                    Task { await load() }
                }
                .environmentObject(store)
            }
            .sheet(item: Binding(
                get: { createdKeys.map { KeysWrapper(keys: $0) } },
                set: { if $0 == nil { createdKeys = nil } }
            )) { wrapper in
                CreatedKeysSheet(keys: wrapper.keys)
            }
        }
    }

    private var filters: some View {
        VStack(spacing: 10) {
            if packageFilter == nil && !packages.isEmpty {
                Menu {
                    Button("Todos os pacotes") { selectedPackageId = nil; Task { await load() } }
                    ForEach(packages) { package in
                        Button(package.name) {
                            selectedPackageId = package.id
                            Task { await load() }
                        }
                    }
                } label: {
                    HStack {
                        Image(systemName: "shippingbox")
                        Text(packages.first { $0.id == selectedPackageId }?.name ?? "Todos os pacotes")
                        Spacer()
                        Image(systemName: "chevron.down")
                    }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Theme.text2)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface))
                }
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(["todas", "active", "paused", "banned"], id: \.self) { status in
                        Button {
                            statusFilter = status
                        } label: {
                            Text(status == "todas" ? "Todas" : statusLabel(status))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(statusFilter == status ? .white : Theme.text2)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 7)
                                .background(
                                    Capsule().fill(statusFilter == status ? Theme.accent : Theme.surface)
                                )
                        }
                    }
                }
            }
        }
        .padding(.horizontal, Theme.padding)
        .padding(.bottom, 8)
    }

    private var content: some View {
        Group {
            if isLoading && licenses.isEmpty {
                LoadingView(text: "Carregando licenças…")
            } else if filtered.isEmpty {
                ScrollView {
                    EmptyStateView(icon: "key", title: "Nenhuma licença",
                                   message: "Gere chaves em lote para um dos seus pacotes.")
                        .cardStyle()
                        .padding(Theme.padding)
                }
            } else {
                ScrollView {
                    VStack(spacing: 10) {
                        if let errorMessage = errorMessage {
                            ErrorBanner(message: errorMessage)
                        }
                        ForEach(filtered) { license in
                            LicenseRow(license: license, onAction: { action in
                                handle(action, license: license)
                            })
                        }
                    }
                    .padding(.horizontal, Theme.padding)
                    .padding(.bottom, 20)
                }
            }
        }
    }

    private func statusLabel(_ status: String) -> String {
        switch status {
        case "active": return "Ativas"
        case "paused": return "Pausadas"
        case "banned": return "Banidas"
        default: return status.capitalized
        }
    }

    private func load() async {
        isLoading = licenses.isEmpty
        errorMessage = nil
        do {
            if packages.isEmpty {
                let packagesResponse: PackagesResponse = try await APIClient.shared.get("/api/packages")
                packages = packagesResponse.packages ?? []
            }
            var query: [URLQueryItem] = []
            if let packageId = packageFilter?.id ?? selectedPackageId {
                query.append(URLQueryItem(name: "package_id", value: "\(packageId)"))
            }
            let response: LicensesResponse = try await APIClient.shared.get("/api/licenses", query: query)
            licenses = response.licenses ?? []
        } catch let error {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func handle(_ action: LicenseRow.Action, license: License) {
        Task {
            do {
                switch action {
                case .copy:
                    Clipboard.copy(license.licenseKey)
                case .pause:
                    try await APIClient.shared.postOK("/api/licenses/set-status", body: ["id": license.id, "status": "paused"])
                case .activate:
                    try await APIClient.shared.postOK("/api/licenses/set-status", body: ["id": license.id, "status": "active"])
                case .ban:
                    try await APIClient.shared.postOK("/api/licenses/set-status", body: ["id": license.id, "status": "banned"])
                case .resetDevice:
                    try await APIClient.shared.postOK("/api/licenses/reset-device", body: ["license_id": license.id])
                case .delete:
                    try await APIClient.shared.postOK("/api/licenses/delete", body: ["id": license.id])
                }
                if action != .copy {
                    await load()
                }
            } catch let error {
                errorMessage = error.localizedDescription
            }
        }
    }
}

struct KeysWrapper: Identifiable {
    let keys: [String]
    var id: String { keys.first ?? "keys" }
}

struct LicenseRow: View {
    enum Action {
        case copy, pause, activate, ban, resetDevice, delete
    }

    let license: License
    var onAction: (Action) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(license.licenseKey)
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
                    .textSelection(.enabled)
                Spacer()
                StatusBadge(status: license.status)
            }
            HStack(spacing: 12) {
                Label(license.packageName ?? "—", systemImage: "shippingbox")
                Label("\(license.devicesUsed ?? 0)/\(license.maxDevices ?? 1)", systemImage: "iphone")
                Spacer()
            }
            .font(.system(size: 11))
            .foregroundColor(Theme.muted)
            .lineLimit(1)

            HStack {
                if let days = license.durationDays {
                    Text("\(days) dias")
                        .font(.system(size: 10))
                        .foregroundColor(Theme.muted)
                } else {
                    Text("Vitalícia")
                        .font(.system(size: 10))
                        .foregroundColor(Theme.muted)
                }
                Spacer()
                Menu {
                    Button { onAction(.copy) } label: { Label("Copiar chave", systemImage: "doc.on.doc") }
                    if license.status == "active" {
                        Button { onAction(.pause) } label: { Label("Pausar", systemImage: "pause.circle") }
                    } else {
                        Button { onAction(.activate) } label: { Label("Ativar", systemImage: "play.circle") }
                    }
                    Button { onAction(.ban) } label: { Label("Banir", systemImage: "hand.raised") }
                    Button { onAction(.resetDevice) } label: { Label("Resetar aparelho", systemImage: "arrow.counterclockwise") }
                    Button(role: .destructive) { onAction(.delete) } label: { Label("Excluir", systemImage: "trash") }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.system(size: 18))
                        .foregroundColor(Theme.text2)
                }
            }
        }
        .cardStyle(padding: 14)
    }
}

struct CreatedKeysSheet: View {
    @Environment(\.dismiss) private var dismiss
    let keys: [String]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    Text("\(keys.count) chave(s) criada(s)")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(Theme.text)

                    ForEach(keys, id: \.self) { key in
                        HStack {
                            Text(key)
                                .font(.system(size: 13, design: .monospaced))
                                .foregroundColor(Theme.text)
                                .textSelection(.enabled)
                            Spacer()
                            Button {
                                Clipboard.copy(key)
                            } label: {
                                Image(systemName: "doc.on.doc")
                                    .foregroundColor(Theme.text2)
                            }
                        }
                        .cardStyle(padding: 12)
                    }

                    Button {
                        Clipboard.copy(keys.joined(separator: "\n"))
                    } label: {
                        Label("Copiar todas", systemImage: "doc.on.doc.fill")
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(.top, 6)
                }
                .padding(20)
            }
            .screenBackground()
            .navigationTitle("Licenças geradas")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Pronto") { dismiss() }
                        .foregroundColor(Theme.accent)
                }
            }
        }
    }
}
