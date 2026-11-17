import SwiftUI

struct ResellersView: View {
    @State private var resellers: [Reseller] = []
    @State private var packages: [SimplePackage] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var editing: Reseller?
    @State private var showCreate = false
    @State private var resetTarget: Reseller?

    var body: some View {
        Group {
            if isLoading && resellers.isEmpty {
                LoadingView(text: "Carregando revendedores…")
            } else if resellers.isEmpty {
                ScrollView {
                    EmptyStateView(icon: "person.2", title: "Nenhum revendedor",
                                   message: "Crie revendedores com cota de chaves e pacotes liberados.")
                        .cardStyle()
                        .padding(Theme.padding)
                }
            } else {
                ScrollView {
                    VStack(spacing: 10) {
                        if let errorMessage = errorMessage {
                            ErrorBanner(message: errorMessage)
                        }
                        ForEach(resellers) { reseller in
                            resellerCard(reseller)
                        }
                    }
                    .padding(Theme.padding)
                }
            }
        }
        .screenBackground()
        .navigationTitle("Revendedores")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showCreate = true
                } label: {
                    Image(systemName: "plus").foregroundColor(Theme.accent)
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showCreate) {
            ResellerEditorView(reseller: nil, packages: packages) { Task { await load() } }
        }
        .sheet(item: $editing) { reseller in
            ResellerEditorView(reseller: reseller, packages: packages) { Task { await load() } }
        }
        .sheet(item: $resetTarget) { reseller in
            ResetPasswordSheet(reseller: reseller) { Task { await load() } }
        }
    }

    private func resellerCard(_ reseller: Reseller) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(reseller.username)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Theme.text)
                Spacer()
                StatusBadge(status: (reseller.accountStatus ?? "active") == "banned" ? "banned" : "active")
            }
            HStack(spacing: 14) {
                Label("\(reseller.createdKeys ?? 0)/\(reseller.maxKeys ?? 0) chaves", systemImage: "key")
                if let email = reseller.email, !email.isEmpty {
                    Label(email, systemImage: "envelope")
                }
            }
            .font(.system(size: 11))
            .foregroundColor(Theme.muted)
            .lineLimit(1)

            if let packages = reseller.packages, !packages.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(packages) { package in
                            Text(package.name)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(Theme.text2)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Capsule().fill(Theme.surface2))
                        }
                    }
                }
            }

            HStack {
                Spacer()
                Menu {
                    Button { editing = reseller } label: { Label("Editar", systemImage: "pencil") }
                    Button { resetTarget = reseller } label: { Label("Redefinir senha", systemImage: "lock.rotation") }
                    Button(role: .destructive) { remove(reseller) } label: { Label("Excluir", systemImage: "trash") }
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
        isLoading = resellers.isEmpty
        errorMessage = nil
        do {
            async let resellersTask: ResellersResponse = APIClient.shared.get("/api/resellers")
            async let packagesTask: SimplePackagesResponse = APIClient.shared.get("/api/resellers/available-packages")
            resellers = try await resellersTask.resellers ?? []
            packages = try await packagesTask.packages ?? []
        } catch let error {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func remove(_ reseller: Reseller) {
        Task {
            do {
                try await APIClient.shared.postOK("/api/resellers/delete", body: ["id": reseller.id])
                await load()
            } catch let error {
                errorMessage = error.localizedDescription
            }
        }
    }
}

struct ResellerEditorView: View {
    @Environment(\.dismiss) private var dismiss
    let reseller: Reseller?
    let packages: [SimplePackage]
    var onSaved: () -> Void

    @State private var username = ""
    @State private var password = ""
    @State private var maxKeys = "25"
    @State private var accountStatus = "active"
    @State private var selectedPackageIds: Set<Int> = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    private var isEditing: Bool { reseller != nil }

    var body: some View {
        NavigationStack {
            Form {
                if !isEditing {
                    Section("Acesso") {
                        TextField("Usuário", text: $username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        SecureField("Senha (mín. 8 caracteres)", text: $password)
                    }
                } else {
                    Section("Acesso") {
                        Text("Usuário: \(reseller?.username ?? "")")
                            .foregroundColor(Theme.muted)
                        Picker("Situação", selection: $accountStatus) {
                            Text("Ativo").tag("active")
                            Text("Banido").tag("banned")
                        }
                        .pickerStyle(.segmented)
                    }
                }

                Section("Cota") {
                    HStack {
                        Text("Máximo de chaves")
                        Spacer()
                        TextField("25", text: $maxKeys)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 90)
                    }
                }

                Section("Pacotes liberados") {
                    if packages.isEmpty {
                        Text("Nenhum pacote disponível.").foregroundColor(Theme.muted)
                    }
                    ForEach(packages) { package in
                        Button {
                            if selectedPackageIds.contains(package.id) {
                                selectedPackageIds.remove(package.id)
                            } else {
                                selectedPackageIds.insert(package.id)
                            }
                        } label: {
                            HStack {
                                Text(package.name).foregroundColor(Theme.text)
                                Spacer()
                                Image(systemName: selectedPackageIds.contains(package.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundColor(selectedPackageIds.contains(package.id) ? Theme.success : Theme.muted)
                            }
                        }
                    }
                }

                if let errorMessage = errorMessage {
                    Section {
                        ErrorBanner(message: errorMessage).listRowBackground(Color.clear)
                    }
                }

                Section {
                    Button {
                        save()
                    } label: {
                        Text(isLoading ? "Salvando…" : (isEditing ? "Salvar alterações" : "Criar revendedor"))
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isLoading)
                    .listRowBackground(Color.clear)
                }
            }
            .scrollContentBackground(.hidden)
            .screenBackground()
            .navigationTitle(isEditing ? "Editar revendedor" : "Novo revendedor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }.foregroundColor(Theme.text2)
                }
            }
            .onAppear(perform: fill)
        }
    }

    private func fill() {
        guard let reseller = reseller else { return }
        maxKeys = "\(reseller.maxKeys ?? 25)"
        accountStatus = reseller.accountStatus ?? "active"
        selectedPackageIds = Set((reseller.packages ?? []).map { $0.id })
    }

    private func save() {
        errorMessage = nil
        isLoading = true
        Task {
            do {
                if let reseller = reseller {
                    try await APIClient.shared.postOK("/api/resellers/update", body: [
                        "id": reseller.id,
                        "max_keys": Int(maxKeys) ?? 25,
                        "account_status": accountStatus,
                        "package_ids": Array(selectedPackageIds)
                    ])
                } else {
                    try await APIClient.shared.postOK("/api/resellers", body: [
                        "username": username.trimmingCharacters(in: .whitespaces),
                        "password": password,
                        "max_keys": Int(maxKeys) ?? 25,
                        "package_ids": Array(selectedPackageIds)
                    ])
                }
                onSaved()
                dismiss()
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}

struct ResetPasswordSheet: View {
    @Environment(\.dismiss) private var dismiss
    let reseller: Reseller
    var onSaved: () -> Void

    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Nova senha para \(reseller.username)") {
                    SecureField("Mínimo 8 caracteres", text: $password)
                }
                if let errorMessage = errorMessage {
                    Section { ErrorBanner(message: errorMessage).listRowBackground(Color.clear) }
                }
                Section {
                    Button {
                        save()
                    } label: {
                        Text(isLoading ? "Salvando…" : "Redefinir")
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isLoading || password.count < 8)
                    .listRowBackground(Color.clear)
                }
            }
            .scrollContentBackground(.hidden)
            .screenBackground()
            .navigationTitle("Redefinir senha")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }.foregroundColor(Theme.text2)
                }
            }
        }
    }

    private func save() {
        errorMessage = nil
        isLoading = true
        Task {
            do {
                try await APIClient.shared.postOK("/api/resellers/reset-password", body: [
                    "id": reseller.id,
                    "password": password
                ])
                onSaved()
                dismiss()
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}
