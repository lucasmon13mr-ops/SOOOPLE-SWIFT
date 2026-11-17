import SwiftUI

struct AuditView: View {
    @State private var entries: [AuditEntry] = []
    @State private var search = ""
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var filtered: [AuditEntry] {
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return entries }
        return entries.filter {
            ($0.actor ?? "").lowercased().contains(term)
            || ($0.action ?? "").lowercased().contains(term)
            || ($0.detail ?? "").lowercased().contains(term)
        }
    }

    var body: some View {
        Group {
            if isLoading && entries.isEmpty {
                LoadingView(text: "Carregando auditoria…")
            } else if filtered.isEmpty {
                ScrollView {
                    EmptyStateView(icon: "list.bullet.rectangle", title: "Nenhum registro",
                                   message: "Ações administrativas aparecem aqui.")
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
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: icon(for: entry.action))
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(Theme.purple)
                                    .frame(width: 26, height: 26)
                                    .background(Circle().fill(Theme.purple.opacity(0.12)))
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(actionLabel(entry.action))
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(Theme.text)
                                    Text("\(entry.actor ?? "—")\(entry.detail.map { " · \($0)" } ?? "")")
                                        .font(.system(size: 11))
                                        .foregroundColor(Theme.muted)
                                        .lineLimit(2)
                                }
                                Spacer(minLength: 0)
                                Text(Formatters.relative(entry.createdAt))
                                    .font(.system(size: 10))
                                    .foregroundColor(Theme.muted)
                            }
                            .cardStyle(padding: 12)
                        }
                    }
                    .padding(Theme.padding)
                }
            }
        }
        .screenBackground()
        .navigationTitle("Auditoria")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Buscar ação")
        .task { await load() }
        .refreshable { await load() }
    }

    private func icon(for action: String?) -> String {
        switch action ?? "" {
        case "login": return "person.fill.checkmark"
        case "signup": return "person.badge.plus"
        case "package_create", "project_upload": return "shippingbox.fill"
        case "plan_change": return "creditcard.fill"
        case "reseller_create": return "person.2.fill"
        default: return "bolt.fill"
        }
    }

    private func actionLabel(_ action: String?) -> String {
        switch action ?? "" {
        case "login": return "Login"
        case "logout": return "Logout"
        case "signup": return "Nova conta"
        case "package_create": return "Pacote criado"
        case "project_upload": return "Projeto enviado"
        case "plan_change": return "Plano alterado"
        case "reseller_create": return "Revendedor criado"
        default: return (action ?? "—").replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    private func load() async {
        isLoading = entries.isEmpty
        errorMessage = nil
        do {
            let response: AuditResponse = try await APIClient.shared.get("/api/audit")
            entries = response.log ?? []
        } catch let error {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
