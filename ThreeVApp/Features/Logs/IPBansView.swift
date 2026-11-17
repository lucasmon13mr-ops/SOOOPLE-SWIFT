import SwiftUI

struct IPBansView: View {
    @State private var bans: [IPBan] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showAdd = false

    var body: some View {
        Group {
            if isLoading && bans.isEmpty {
                LoadingView(text: "Carregando bloqueios…")
            } else if bans.isEmpty {
                ScrollView {
                    EmptyStateView(icon: "hand.raised", title: "Nenhum IP bloqueado",
                                   message: "Bloqueie IPs que estejam abusando da API.")
                        .cardStyle()
                        .padding(Theme.padding)
                }
            } else {
                ScrollView {
                    VStack(spacing: 8) {
                        if let errorMessage = errorMessage {
                            ErrorBanner(message: errorMessage)
                        }
                        ForEach(bans) { ban in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(Formatters.shorten(ban.ipHash, to: 24))
                                        .font(.system(size: 12, design: .monospaced))
                                        .foregroundColor(Theme.text)
                                    Spacer()
                                    Button {
                                        remove(ban)
                                    } label: {
                                        Image(systemName: "trash")
                                            .foregroundColor(Theme.danger)
                                    }
                                }
                                Text(ban.reason ?? "Sem motivo informado")
                                    .font(.system(size: 11))
                                    .foregroundColor(Theme.muted)
                                Text(ban.expiresAt == nil ? "Bloqueio permanente" : "Até \(Formatters.dateTime(ban.expiresAt))")
                                    .font(.system(size: 10))
                                    .foregroundColor(Theme.muted)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .cardStyle(padding: 12)
                        }
                    }
                    .padding(Theme.padding)
                }
            }
        }
        .screenBackground()
        .navigationTitle("IPs bloqueados")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showAdd = true
                } label: {
                    Image(systemName: "plus")
                        .foregroundColor(Theme.accent)
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showAdd) {
            AddIPBanView { Task { await load() } }
        }
    }

    private func load() async {
        isLoading = bans.isEmpty
        errorMessage = nil
        do {
            let response: IPBansResponse = try await APIClient.shared.get("/api/ip-bans")
            bans = response.bans ?? []
        } catch let error {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func remove(_ ban: IPBan) {
        Task {
            do {
                try await APIClient.shared.postOK("/api/ip-bans/delete", body: ["id": ban.id])
                await load()
            } catch let error {
                errorMessage = error.localizedDescription
            }
        }
    }
}

struct AddIPBanView: View {
    @Environment(\.dismiss) private var dismiss
    var onSaved: () -> Void

    @State private var ip = ""
    @State private var reason = ""
    @State private var hours = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("IP") {
                    TextField("203.0.113.10", text: $ip)
                        .keyboardType(.numbersAndPunctuation)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                Section("Detalhes") {
                    TextField("Motivo", text: $reason)
                    TextField("Duração em horas (vazio = permanente)", text: $hours)
                        .keyboardType(.numberPad)
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
                        Text(isLoading ? "Salvando…" : "Bloquear IP")
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isLoading || ip.isEmpty)
                    .listRowBackground(Color.clear)
                }
            }
            .scrollContentBackground(.hidden)
            .screenBackground()
            .navigationTitle("Bloquear IP")
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
        var body: [String: Any] = ["ip": ip.trimmingCharacters(in: .whitespaces), "reason": reason]
        if let value = Int(hours) { body["duration_hours"] = value }
        Task {
            do {
                try await APIClient.shared.postOK("/api/ip-bans", body: body)
                onSaved()
                dismiss()
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}
