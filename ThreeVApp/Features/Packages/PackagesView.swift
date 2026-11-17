import SwiftUI

struct PackagesView: View {
    @EnvironmentObject private var store: Store

    @State private var packages: [Package] = []
    @State private var search = ""
    @State private var isLoading = true
    @State private var errorMessage: String?

    @State private var showEditor = false
    @State private var editingPackage: Package?
    @State private var createdPackage: CreatedPackage?

    struct CreatedPackage: Identifiable {
        let id = UUID()
        let name: String
        let token: String
        let secret: String
    }

    private var filtered: [Package] {
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return packages }
        return packages.filter {
            $0.name.lowercased().contains(term) || $0.status.lowercased().contains(term)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && packages.isEmpty {
                    LoadingView(text: "Carregando pacotes…")
                } else if packages.isEmpty {
                    ScrollView {
                        EmptyStateView(icon: "shippingbox", title: "Nenhum pacote ainda",
                                       message: "Crie um pacote para gerar tokens, chaves de licença e proteger seu app ou tweak.")
                            .cardStyle()
                            .padding(Theme.padding)
                    }
                } else {
                    list
                }
            }
            .screenBackground()
            .navigationTitle("Pacotes")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, prompt: "Buscar pacote")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showEditor = true
                    } label: {
                        Image(systemName: "plus")
                            .foregroundColor(Theme.accent)
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .sheet(isPresented: $showEditor) {
                PackageEditorView(package: nil) { created in
                    createdPackage = CreatedPackage(name: created.name, token: created.token, secret: created.secret)
                    Task { await load() }
                }
                .environmentObject(store)
            }
            .sheet(item: $editingPackage) { package in
                PackageEditorView(package: package) { _ in
                    Task { await load() }
                }
                .environmentObject(store)
            }
            .sheet(item: $createdPackage) { created in
                CreatedPackageSheet(created: created)
            }
        }
    }

    private var list: some View {
        ScrollView {
            VStack(spacing: 10) {
                if let errorMessage = errorMessage {
                    ErrorBanner(message: errorMessage)
                }
                ForEach(filtered) { package in
                    NavigationLink {
                        PackageDetailView(package: package) {
                            Task { await load() }
                        }
                    } label: {
                        PackageRow(package: package)
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button {
                            editingPackage = package
                        } label: {
                            Label("Editar", systemImage: "pencil")
                        }
                        Button(role: .destructive) {
                            Task { await remove(package) }
                        } label: {
                            Label("Excluir", systemImage: "trash")
                        }
                    }
                }
            }
            .padding(.horizontal, Theme.padding)
            .padding(.vertical, 10)
        }
    }

    private func load() async {
        isLoading = packages.isEmpty
        errorMessage = nil
        do {
            let response: PackagesResponse = try await APIClient.shared.get("/api/packages")
            packages = response.packages ?? []
        } catch let error {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func remove(_ package: Package) async {
        do {
            try await APIClient.shared.postOK("/api/packages/delete", body: ["id": package.id])
            await load()
        } catch let error {
            errorMessage = error.localizedDescription
        }
    }
}

struct PackageRow: View {
    let package: Package

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(package.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Theme.text)
                    .lineLimit(1)
                Spacer()
                StatusBadge(status: package.status)
            }
            HStack(spacing: 14) {
                Label(package.tokenMasked ?? "—", systemImage: "number")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(Theme.muted)
                    .lineLimit(1)
                Label("\(package.maxDevices ?? 1) disp.", systemImage: "iphone")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.muted)
                Spacer()
                Text(Formatters.shortDate(package.createdAt))
                    .font(.system(size: 10))
                    .foregroundColor(Theme.muted)
            }
            .labelStyle(.titleAndIcon)
        }
        .cardStyle(padding: 14)
    }
}

/// Mostrada uma única vez, logo após criar o pacote.
struct CreatedPackageSheet: View {
    @Environment(\.dismiss) private var dismiss
    let created: PackagesView.CreatedPackage

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 40))
                        .foregroundColor(Theme.success)
                    Text("Pacote “\(created.name)” criado")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Theme.text)
                        .multilineTextAlignment(.center)

                    secretBox(title: "Token do pacote", value: created.token)
                    secretBox(title: "Segredo HMAC", value: created.secret)

                    Text("Guarde o segredo agora: o painel não mostra o HMAC novamente.")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.warn)
                        .multilineTextAlignment(.center)
                }
                .padding(20)
            }
            .screenBackground()
            .navigationTitle("Novo pacote")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Pronto") { dismiss() }
                        .foregroundColor(Theme.accent)
                }
            }
        }
    }

    private func secretBox(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Theme.muted)
            Text(value)
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(Theme.text)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .cardStyle(padding: 12)
        .onTapGesture { Clipboard.copy(value) }
    }
}
