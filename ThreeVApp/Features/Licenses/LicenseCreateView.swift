import SwiftUI

struct LicenseCreateView: View {
    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss

    var packages: [Package]
    var preselected: Package?
    var onCreated: ([String]) -> Void

    @State private var loadedPackages: [Package] = []
    @State private var selectedPackageId: Int?
    @State private var quantity = "1"
    @State private var maxDevices = "1"
    @State private var isLifetime = true
    @State private var durationDays = "30"
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var createdKeys: [String] = []

    private var allPackages: [Package] {
        loadedPackages.isEmpty ? packages : loadedPackages
    }

    var body: some View {
        NavigationStack {
            Form {
                if createdKeys.isEmpty {
                    Section("Pacote") {
                        if allPackages.isEmpty {
                            Text("Nenhum pacote disponível. Crie um pacote primeiro.")
                                .foregroundColor(Theme.muted)
                        } else {
                            Picker("Pacote", selection: $selectedPackageId) {
                                Text("Selecione…").tag(Int?.none)
                                ForEach(allPackages) { package in
                                    Text(package.name).tag(Int?.some(package.id))
                                }
                            }
                        }
                    }

                    Section("Chaves") {
                        HStack {
                            Text("Quantidade")
                            Spacer()
                            TextField("1", text: $quantity)
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 80)
                        }
                        HStack {
                            Text("Dispositivos por chave")
                            Spacer()
                            TextField("1", text: $maxDevices)
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 80)
                        }
                    }

                    Section("Validade") {
                        Toggle("Licença vitalícia", isOn: $isLifetime)
                            .tint(Theme.accent)
                        if !isLifetime {
                            HStack {
                                Text("Dias")
                                Spacer()
                                TextField("30", text: $durationDays)
                                    .keyboardType(.numberPad)
                                    .multilineTextAlignment(.trailing)
                                    .frame(width: 80)
                            }
                        }
                    }

                    if let errorMessage = errorMessage {
                        Section {
                            ErrorBanner(message: errorMessage)
                                .listRowBackground(Color.clear)
                        }
                    }

                    Section {
                        Button {
                            create()
                        } label: {
                            Text(isLoading ? "Gerando…" : "Gerar licenças")
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(isLoading || selectedPackageId == nil)
                        .listRowBackground(Color.clear)
                    }
                } else {
                    Section("Chaves geradas") {
                        ForEach(createdKeys, id: \.self) { key in
                            HStack {
                                Text(key)
                                    .font(.system(size: 13, design: .monospaced))
                                    .textSelection(.enabled)
                                Spacer()
                                Button {
                                    Clipboard.copy(key)
                                } label: {
                                    Image(systemName: "doc.on.doc")
                                }
                                .buttonStyle(.plain)
                                .foregroundColor(Theme.text2)
                            }
                        }
                    }
                    Section {
                        Button {
                            Clipboard.copy(createdKeys.joined(separator: "\n"))
                        } label: {
                            Label("Copiar todas", systemImage: "doc.on.doc.fill")
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .listRowBackground(Color.clear)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .screenBackground()
            .navigationTitle("Gerar licenças")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(createdKeys.isEmpty ? "Cancelar" : "Fechar") { dismiss() }
                        .foregroundColor(Theme.text2)
                }
                if !createdKeys.isEmpty {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Pronto") {
                            onCreated(createdKeys)
                            dismiss()
                        }
                        .foregroundColor(Theme.accent)
                    }
                }
            }
            .task { await loadPackages() }
        }
    }

    private func loadPackages() async {
        if let preselected = preselected {
            selectedPackageId = preselected.id
        }
        guard packages.isEmpty else { return }
        do {
            let response: PackagesResponse = try await APIClient.shared.get("/api/packages")
            loadedPackages = response.packages ?? []
            if selectedPackageId == nil, let first = loadedPackages.first {
                selectedPackageId = first.id
            }
        } catch let error {
            errorMessage = error.localizedDescription
        }
    }

    private func create() {
        guard let packageId = selectedPackageId else { return }
        errorMessage = nil
        isLoading = true

        var body: [String: Any] = [
            "package_id": packageId,
            "count": Int(quantity) ?? 1,
            "max_devices": Int(maxDevices) ?? 1
        ]
        if !isLifetime, let days = Int(durationDays) {
            body["duration_days"] = days
        }

        Task {
            do {
                let response: CreatedKeysResponse = try await APIClient.shared.post("/api/licenses/create", body: body)
                createdKeys = response.keys ?? []
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}
