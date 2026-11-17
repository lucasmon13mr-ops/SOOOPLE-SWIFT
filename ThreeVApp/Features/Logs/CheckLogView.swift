import SwiftUI

struct CheckLogView: View {
    @State private var entries: [CheckEntry] = []
    @State private var search = ""
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var filtered: [CheckEntry] {
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return entries }
        return entries.filter {
            ($0.deviceHash ?? "").lowercased().contains(term)
            || ($0.result ?? "").lowercased().contains(term)
            || ($0.detail ?? "").lowercased().contains(term)
        }
    }

    var body: some View {
        Group {
            if isLoading && entries.isEmpty {
                LoadingView(text: "Carregando verificações…")
            } else if filtered.isEmpty {
                ScrollView {
                    EmptyStateView(icon: "shield", title: "Nenhuma verificação",
                                   message: "As chamadas do SDK ao endpoint /api/sdk/verify ficam registradas aqui.")
                        .cardStyle()
                        .padding(Theme.padding)
                }
            } else {
                ScrollView {
                    VStack(spacing: 8) {
                        if let errorMessage = errorMessage {
                            ErrorBanner(message: errorMessage)
                        }
                        ForEach(filtered) { entry in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    StatusBadge(status: entry.result ?? "—")
                                    Spacer()
                                    Text(Formatters.dateTime(entry.createdAt))
                                        .font(.system(size: 10))
                                        .foregroundColor(Theme.muted)
                                }
                                Text(Formatters.shorten(entry.deviceHash, to: 28))
                                    .font(.system(size: 12, design: .monospaced))
                                    .foregroundColor(Theme.text)
                                Text(entry.detail ?? "token \(Formatters.shorten(entry.packageToken, to: 14))")
                                    .font(.system(size: 11))
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
        .navigationTitle("Verificações")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Buscar verificação")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = entries.isEmpty
        errorMessage = nil
        do {
            let response: CheckLogResponse = try await APIClient.shared.get("/api/check-log")
            entries = response.log ?? []
        } catch let error {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
