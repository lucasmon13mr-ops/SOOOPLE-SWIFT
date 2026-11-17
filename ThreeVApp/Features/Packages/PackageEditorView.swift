import SwiftUI

struct PackageEditorView: View {
    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss

    let package: Package?
    var onSaved: (CreatedPackageInfo) -> Void

    @State private var name = ""
    @State private var telegram = ""
    @State private var allowInject = true
    @State private var maxDylibs = 3
    @State private var latestVersion = ""
    @State private var updateUrl = ""
    @State private var note = ""
    @State private var status = "active"
    @State private var isLoading = false
    @State private var errorMessage: String?

    private var isEditing: Bool { package != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section("Identificação") {
                    TextField("Nome do pacote", text: $name)
                    TextField("Telegram do suporte (@usuario)", text: $telegram)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Section("Proteção") {
                    Toggle("Permitir injeção de dylib", isOn: $allowInject)
                        .tint(Theme.accent)
                    Stepper("Máximo de dylibs: \(maxDylibs)", value: $maxDylibs, in: 0...20)
                }

                Section("Atualização (opcional)") {
                    TextField("Última versão (ex: 1.4.2)", text: $latestVersion)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("URL de atualização", text: $updateUrl)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Observação", text: $note, axis: .vertical)
                        .lineLimit(2...4)
                }

                if isEditing {
                    Section("Status") {
                        Picker("Status", selection: $status) {
                            Text("Ativo").tag("active")
                            Text("Pausado").tag("paused")
                            Text("Banido").tag("banned")
                        }
                        .pickerStyle(.segmented)
                    }
                }

                if let errorMessage = errorMessage {
                    Section {
                        ErrorBanner(message: errorMessage)
                            .listRowBackground(Color.clear)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .screenBackground()
            .navigationTitle(isEditing ? "Editar pacote" : "Novo pacote")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .foregroundColor(Theme.text2)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isLoading ? "Salvando…" : "Salvar") {
                        save()
                    }
                    .disabled(isLoading || name.trimmingCharacters(in: .whitespaces).isEmpty)
                    .foregroundColor(Theme.accent)
                }
            }
            .onAppear(perform: fill)
        }
    }

    private func fill() {
        guard let package = package else { return }
        name = package.name
        telegram = package.telegramUsername ?? ""
        allowInject = package.allowInject ?? true
        maxDylibs = package.maxDylibs ?? 3
        latestVersion = package.latestVersion ?? ""
        updateUrl = package.updateUrl ?? ""
        note = package.note ?? ""
        status = package.status
    }

    private func save() {
        errorMessage = nil
        isLoading = true
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)

        Task {
            do {
                if let package = package {
                    var body: [String: Any] = [
                        "id": package.id,
                        "name": trimmedName,
                        "status": status,
                        "allow_inject": allowInject,
                        "max_dylibs": maxDylibs,
                        "device_id_mode": "container",
                        "note": note,
                        "telegram_username": telegram
                    ]
                    if !latestVersion.isEmpty { body["latest_version"] = latestVersion }
                    if !updateUrl.isEmpty { body["update_url"] = updateUrl }
                    try await APIClient.shared.postOK("/api/packages/update", body: body)
                    onSaved(CreatedPackageInfo(name: trimmedName, token: "", secret: ""))
                } else {
                    let response: PackageCreateResponse = try await APIClient.shared.post("/api/packages", body: [
                        "name": trimmedName,
                        "allow_inject": allowInject,
                        "max_dylibs": maxDylibs,
                        "telegram_username": telegram
                    ])
                    onSaved(CreatedPackageInfo(
                        name: trimmedName,
                        token: response.token ?? "",
                        secret: response.hmacSecret ?? ""
                    ))
                }
                dismiss()
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}

struct PackageCreateResponse: Decodable {
    let id: Int?
    let token: String?
    let hmacSecret: String?

    enum CodingKeys: String, CodingKey {
        case id, token
        case hmacSecret = "hmac_secret"
    }
}
