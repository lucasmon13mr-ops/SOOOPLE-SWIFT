import SwiftUI

struct PackageDetailView: View {
    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss

    let package: Package
    var onChange: () -> Void

    @State private var token: String?
    @State private var showToken = false
    @State private var status: String
    @State private var showEditor = false
    @State private var showDeleteConfirm = false
    @State private var showLicenseCreator = false
    @State private var showSDKSheet = false
    @State private var isWorking = false
    @State private var errorMessage: String?

    init(package: Package, onChange: @escaping () -> Void) {
        self.package = package
        self.onChange = onChange
        _status = State(initialValue: package.status)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let errorMessage = errorMessage {
                    ErrorBanner(message: errorMessage)
                }
                headerCard
                actionsCard
                linksCard
            }
            .padding(Theme.padding)
        }
        .screenBackground()
        .navigationTitle(package.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Editar") { showEditor = true }
                    .foregroundColor(Theme.accent)
            }
        }
        .sheet(isPresented: $showEditor) {
            PackageEditorView(package: package) { _ in
                onChange()
            }
            .environmentObject(store)
        }
        .sheet(isPresented: $showLicenseCreator) {
            LicenseCreateView(packages: [], preselected: package) { _ in
                onChange()
            }
            .environmentObject(store)
        }
        .sheet(isPresented: $showSDKSheet) {
            SDKDownloadSheet(package: package)
                .environmentObject(store)
        }
        .confirmationDialog("Excluir “\(package.name)”?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Excluir pacote e licenças", role: .destructive) { deletePackage() }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Todas as licenças ligadas a este pacote também serão apagadas.")
        }
        .onAppear { status = package.status }
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(package.name)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(Theme.text)
                Spacer()
                StatusBadge(status: status)
            }

            InfoRow(label: "Token", value: showToken ? (token ?? package.tokenMasked ?? "—") : (package.tokenMasked ?? "—"), mono: true)
            InfoRow(label: "Dispositivos por licença", value: "\(package.maxDevices ?? 1)")
            InfoRow(label: "Máx. dylibs", value: "\(package.maxDylibs ?? 3)")
            InfoRow(label: "Injeção de dylib", value: (package.allowInject ?? true) ? "Permitida" : "Bloqueada")
            if let version = package.latestVersion, !version.isEmpty {
                InfoRow(label: "Última versão", value: version)
            }
            if let url = package.updateUrl, !url.isEmpty {
                InfoRow(label: "URL de atualização", value: url)
            }
            if let telegram = package.telegramUsername, !telegram.isEmpty {
                InfoRow(label: "Telegram", value: telegram)
            }
            if let note = package.note, !note.isEmpty {
                InfoRow(label: "Observação", value: note)
            }
            InfoRow(label: "Criado em", value: Formatters.dateTime(package.createdAt))

            HStack(spacing: 10) {
                Button(showToken ? "Ocultar token" : "Mostrar token") {
                    if showToken {
                        showToken = false
                    } else {
                        loadToken()
                    }
                }
                .buttonStyle(SecondaryButtonStyle())

                Button("Copiar token") {
                    if let token = token {
                        Clipboard.copy(token)
                    } else {
                        loadToken(copyAfter: true)
                    }
                }
                .buttonStyle(SecondaryButtonStyle())
            }
        }
        .cardStyle()
    }

    private var actionsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: "Ações")
            HStack(spacing: 10) {
                Button(status == "active" ? "Pausar" : "Ativar") {
                    setStatus(status == "active" ? "paused" : "active")
                }
                .buttonStyle(SecondaryButtonStyle())

                Button("Banir") { setStatus("banned") }
                    .buttonStyle(SecondaryButtonStyle())
            }
            Button {
                showLicenseCreator = true
            } label: {
                Label("Gerar licenças", systemImage: "key.fill")
            }
            .buttonStyle(PrimaryButtonStyle(color: Theme.purple))

            Button {
                showSDKSheet = true
            } label: {
                Label("Baixar SDK (.zip)", systemImage: "square.and.arrow.down")
            }
            .buttonStyle(SecondaryButtonStyle())

            Button {
                showDeleteConfirm = true
            } label: {
                Label("Excluir pacote", systemImage: "trash")
                    .foregroundColor(Theme.danger)
            }
            .buttonStyle(SecondaryButtonStyle())
            .disabled(isWorking)
        }
        .cardStyle()
    }

    private var linksCard: some View {
        VStack(spacing: 10) {
            NavigationLink {
                LicensesView(packageFilter: package)
            } label: {
                HStack {
                    Label("Ver licenças deste pacote", systemImage: "key.horizontal.fill")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Theme.text)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Theme.muted)
                }
                .cardStyle(padding: 14)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Ações de rede

    private func loadToken(copyAfter: Bool = false) {
        errorMessage = nil
        Task {
            do {
                let response: PackageTokenResponse = try await APIClient.shared.get(
                    "/api/packages/token",
                    query: [URLQueryItem(name: "id", value: "\(package.id)")]
                )
                token = response.token
                showToken = true
                if copyAfter, let token = response.token { Clipboard.copy(token) }
            } catch let error {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func setStatus(_ newStatus: String) {
        errorMessage = nil
        isWorking = true
        Task {
            do {
                try await APIClient.shared.postOK("/api/packages/update", body: [
                    "id": package.id,
                    "status": newStatus,
                    "name": package.name,
                    "allow_inject": package.allowInject ?? true,
                    "max_dylibs": package.maxDylibs ?? 3,
                    "device_id_mode": "container",
                    "note": package.note ?? "",
                    "telegram_username": package.telegramUsername ?? "",
                    "latest_version": package.latestVersion ?? "",
                    "update_url": package.updateUrl ?? ""
                ])
                status = newStatus
                onChange()
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isWorking = false
        }
    }

    private func deletePackage() {
        isWorking = true
        Task {
            do {
                try await APIClient.shared.postOK("/api/packages/delete", body: ["id": package.id])
                onChange()
                dismiss()
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isWorking = false
        }
    }
}

/// Pede o Bundle ID e baixa o ZIP do SDK gerado pelo backend.
struct SDKDownloadSheet: View {
    @Environment(\.dismiss) private var dismiss
    let package: Package

    @State private var bundleId = ""
    @State private var fileURL: URL?
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    Text("O backend monta um ZIP com o header, o plist e o Makefile já configurados para o pacote “\(package.name)”.")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.text2)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    LabeledField(label: "Bundle ID do seu app", placeholder: "com.empresa.app", text: $bundleId)

                    if let errorMessage = errorMessage {
                        ErrorBanner(message: errorMessage)
                    }

                    Button {
                        download()
                    } label: {
                        Text(isLoading ? "Gerando…" : "Baixar SDK")
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isLoading || bundleId.isEmpty)

                    if let fileURL = fileURL {
                        ShareLink(item: fileURL) {
                            Label("Compartilhar / Salvar em Arquivos", systemImage: "square.and.arrow.up")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(Theme.success)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(RoundedRectangle(cornerRadius: 10).fill(Theme.success.opacity(0.12)))
                        }
                    }
                }
                .padding(20)
            }
            .screenBackground()
            .navigationTitle("SDK ZOLMEA")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fechar") { dismiss() }
                        .foregroundColor(Theme.text2)
                }
            }
        }
    }

    private func download() {
        errorMessage = nil
        isLoading = true
        Task {
            do {
                let url = try await APIClient.shared.download(
                    "/api/sdk-files/\(package.id)/full/download",
                    query: [URLQueryItem(name: "bundle_id", value: bundleId.trimmingCharacters(in: .whitespaces))],
                    filename: "zolmea-sdk-\(package.id).zip"
                )
                fileURL = url
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}
