import SwiftUI
import UniformTypeIdentifiers

struct BuilderView: View {
    @State private var builds: [ProjectBuild] = []
    @State private var quota: BuildQuota?
    @State private var githubConfigured = true
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showUpload = false
    @State private var pollTask: Task<Void, Never>?
    @State private var downloadedFile: DownloadedFile?

    struct DownloadedFile: Identifiable {
        let id = UUID()
        let url: URL
        let name: String
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let errorMessage = errorMessage {
                    ErrorBanner(message: errorMessage)
                }
                if !githubConfigured {
                    warningCard
                }
                if let quota = quota {
                    quotaCard(quota)
                }
                if builds.isEmpty && !isLoading {
                    EmptyStateView(icon: "hammer", title: "Nenhum projeto enviado",
                                   message: "Envie o ZIP do seu projeto Theos e compile direto pelo GitHub Actions.")
                        .cardStyle()
                } else {
                    ForEach(builds) { build in
                        buildCard(build)
                    }
                }
            }
            .padding(Theme.padding)
        }
        .screenBackground()
        .navigationTitle("Construtor")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showUpload = true
                } label: {
                    Image(systemName: "square.and.arrow.up").foregroundColor(Theme.accent)
                }
            }
        }
        .task {
            await load()
            startPollingIfNeeded()
        }
        .refreshable { await load() }
        .onDisappear { pollTask?.cancel() }
        .sheet(isPresented: $showUpload) {
            UploadProjectView { Task { await load() } }
        }
        .sheet(item: $downloadedFile) { file in
            ShareFileSheet(url: file.url, name: file.name)
        }
    }

    private var warningCard: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundColor(Theme.warn)
            VStack(alignment: .leading, spacing: 4) {
                Text("Compilador não configurado")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.text)
                Text("O backend ainda não está conectado ao GitHub Actions. Confira GITHUB_TOKEN e GITHUB_REPO no Render.")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: Theme.radius).fill(Theme.warn.opacity(0.12)))
    }

    private func quotaCard(_ quota: BuildQuota) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "gauge.with.dots.needle.33percent")
                .foregroundColor(Theme.purple)
            Text(quota.summary)
                .font(.system(size: 12))
                .foregroundColor(Theme.text2)
            Spacer()
        }
        .cardStyle(padding: 12)
    }

    private func buildCard(_ build: ProjectBuild) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(build.projectName ?? build.originalFilename ?? "Projeto")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Theme.text)
                    .lineLimit(1)
                Spacer()
                StatusBadge(status: build.status)
            }
            InfoRow(label: "Pacote", value: build.packageName ?? "—")
            InfoRow(label: "Bundle ID", value: build.bundleId ?? "—", mono: true)
            if let message = build.message, !message.isEmpty {
                Text(message)
                    .font(.system(size: 11))
                    .foregroundColor(Theme.muted)
                    .lineLimit(3)
            }

            HStack(spacing: 10) {
                if !build.isRunning {
                    Button(build.status == "uploaded" ? "Compilar" : "Compilar de novo") {
                        trigger(build)
                    }
                    .buttonStyle(SecondaryButtonStyle())
                } else {
                    HStack(spacing: 8) {
                        ProgressView().tint(Theme.text2)
                        Text(build.stage ?? "compilando…")
                            .font(.system(size: 12))
                            .foregroundColor(Theme.text2)
                    }
                    .frame(maxWidth: .infinity)
                }

                Menu {
                    ForEach(build.artifacts ?? []) { artifact in
                        Button {
                            download(build, artifact: artifact)
                        } label: {
                            Label(artifact.name, systemImage: "arrow.down.circle")
                        }
                    }
                    Button(role: .destructive) {
                        remove(build)
                    } label: {
                        Label("Excluir projeto", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.system(size: 18))
                        .foregroundColor(Theme.text2)
                }
            }
        }
        .cardStyle(padding: 14)
    }

    private func load() async {
        isLoading = builds.isEmpty
        errorMessage = nil
        do {
            let response: ProjectBuildListResponse = try await APIClient.shared.get("/api/project-builder")
            builds = response.builds ?? []
            quota = response.quota
            githubConfigured = response.githubConfigured ?? true
        } catch let error {
            errorMessage = error.localizedDescription
        }
        isLoading = false
        startPollingIfNeeded()
    }

    private func trigger(_ build: ProjectBuild) {
        Task {
            do {
                try await APIClient.shared.postOK("/api/project-builder/\(build.id)/build")
                await load()
            } catch let error {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func remove(_ build: ProjectBuild) {
        Task {
            do {
                try await APIClient.shared.postOK("/api/project-builder/\(build.id)/delete")
                await load()
            } catch let error {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func download(_ build: ProjectBuild, artifact: BuildArtifact) {
        Task {
            do {
                let url = try await APIClient.shared.download(
                    "/api/project-builder/\(build.id)/artifacts/\(artifact.name)",
                    filename: artifact.name
                )
                downloadedFile = DownloadedFile(url: url, name: artifact.name)
            } catch let error {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func startPollingIfNeeded() {
        pollTask?.cancel()
        guard builds.contains(where: { $0.isRunning }) else { return }
        pollTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 6_000_000_000)
                if Task.isCancelled { return }
                await load()
                if !builds.contains(where: { $0.isRunning }) { return }
            }
        }
    }
}

struct ShareFileSheet: View {
    @Environment(\.dismiss) private var dismiss
    let url: URL
    let name: String

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "doc.zipper")
                    .font(.system(size: 40))
                    .foregroundColor(Theme.success)
                Text(name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Theme.text)
                Text("Arquivo baixado para a pasta do app.")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.muted)
                ShareLink(item: url) {
                    Label("Salvar em Arquivos / Compartilhar", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(PrimaryButtonStyle(color: Theme.success))
            }
            .padding(24)
            .screenBackground()
            .navigationTitle("Download")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fechar") { dismiss() }.foregroundColor(Theme.text2)
                }
            }
        }
    }
}

struct UploadProjectView: View {
    @Environment(\.dismiss) private var dismiss
    var onUploaded: () -> Void

    @State private var packages: [Package] = []
    @State private var selectedPackageId: Int?
    @State private var bundleId = ""
    @State private var projectName = ""
    @State private var zipURL: URL?
    @State private var zipName = ""
    @State private var showImporter = false
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Projeto") {
                    Button {
                        showImporter = true
                    } label: {
                        HStack {
                            Image(systemName: "doc.zipper")
                            Text(zipName.isEmpty ? "Selecionar ZIP/source do projeto" : zipName)
                                .lineLimit(1)
                            Spacer()
                            Image(systemName: "chevron.right")
                        }
                        .foregroundColor(Theme.text)
                    }
                    TextField("Nome do projeto", text: $projectName)
                    TextField("Bundle ID (com.empresa.app)", text: $bundleId)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Section("Pacote") {
                    Picker("Pacote", selection: $selectedPackageId) {
                        Text("Selecione…").tag(Int?.none)
                        ForEach(packages) { package in
                            Text(package.name).tag(Int?.some(package.id))
                        }
                    }
                }

                if let errorMessage = errorMessage {
                    Section { ErrorBanner(message: errorMessage).listRowBackground(Color.clear) }
                }

                Section {
                    Button {
                        upload()
                    } label: {
                        Text(isLoading ? "Enviando…" : "Enviar e compilar")
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isLoading || zipURL == nil || selectedPackageId == nil || bundleId.isEmpty)
                    .listRowBackground(Color.clear)
                }
            }
            .scrollContentBackground(.hidden)
            .screenBackground()
            .navigationTitle("Novo projeto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }.foregroundColor(Theme.text2)
                }
            }
            .task { await loadPackages() }
            .fileImporter(isPresented: $showImporter, allowedContentTypes: [.zip], allowsMultipleSelection: false) { result in
                switch result {
                case .success(let urls):
                    if let url = urls.first {
                        zipURL = url
                        zipName = url.lastPathComponent
                        if projectName.isEmpty {
                            projectName = url.deletingPathExtension().lastPathComponent
                        }
                    }
                case .failure(let error):
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func loadPackages() async {
        do {
            let response: PackagesResponse = try await APIClient.shared.get("/api/packages")
            packages = response.packages ?? []
            if selectedPackageId == nil { selectedPackageId = packages.first?.id }
        } catch let error {
            errorMessage = error.localizedDescription
        }
    }

    private func upload() {
        guard let url = zipURL, let packageId = selectedPackageId else { return }
        errorMessage = nil
        isLoading = true

        Task {
            do {
                let needsScope = url.startAccessingSecurityScopedResource()
                defer { if needsScope { url.stopAccessingSecurityScopedResource() } }
                let data = try Data(contentsOf: url)

                let headers = [
                    "X-Package-Id": "\(packageId)",
                    "X-Bundle-Id": bundleId.trimmingCharacters(in: .whitespaces),
                    "X-Project-Name": projectName.isEmpty ? url.deletingPathExtension().lastPathComponent : projectName,
                    "X-Original-Filename": url.lastPathComponent
                ]
                let uploaded: ProjectUploadResponse = try await APIClient.shared.postUploadZip("/api/project-builder/upload", zip: data, headers: headers)
                guard let buildId = uploaded.id else { throw APIError.http(status: 500, code: "upload_missing_id", message: "O servidor não retornou o ID do projeto enviado.") }
                _ = try await APIClient.shared.postOK("/api/project-builder/\(buildId)/build")
                onUploaded()
                dismiss()
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}

private struct ProjectUploadResponse: Decodable {
    let ok: Bool?
    let id: Int?
    let message: String?
}
