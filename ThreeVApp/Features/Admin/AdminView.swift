import SwiftUI

struct AdminView: View {
    @State private var stats: AdminStats?
    @State private var users: [AdminUser] = []
    @State private var search = ""
    @State private var isLoading = true
    @State private var errorMessage: String?

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    private var filtered: [AdminUser] {
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return users }
        return users.filter {
            $0.username.lowercased().contains(term) || ($0.email ?? "").lowercased().contains(term)
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let errorMessage = errorMessage {
                    ErrorBanner(message: errorMessage)
                }
                if let stats = stats {
                    LazyVGrid(columns: columns, spacing: 12) {
                        StatCard(title: "Usuários", value: Formatters.number(stats.users), icon: "person.3.fill", tint: Theme.accent)
                        StatCard(title: "Premium", value: Formatters.number(stats.premiumUsers), icon: "star.fill", tint: Theme.warn)
                        StatCard(title: "Free", value: Formatters.number(stats.freeUsers), icon: "person.fill", tint: Theme.text2)
                        StatCard(title: "Licenças", value: Formatters.number(stats.licenses), icon: "key.fill", tint: Theme.purple)
                        StatCard(title: "Ativas", value: Formatters.number(stats.activeLicenses), icon: "checkmark.seal.fill", tint: Theme.success)
                        StatCard(title: "Verificações 24h", value: Formatters.number(stats.checks24h), icon: "shield.fill", tint: Theme.warn)
                    }
                }

                SectionTitle(text: "Usuários")
                VStack(spacing: 10) {
                    ForEach(filtered) { user in
                        HStack(spacing: 12) {
                            ZStack {
                                Circle().fill(Theme.surface2).frame(width: 36, height: 36)
                                Text(String(user.username.prefix(1)).uppercased())
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(Theme.text2)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(user.username)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(Theme.text)
                                Text("\(user.email ?? "sem e-mail") · \(user.maxPackages ?? 0) pacotes / \(user.maxKeys ?? 0) chaves")
                                    .font(.system(size: 10))
                                    .foregroundColor(Theme.muted)
                                    .lineLimit(1)
                            }
                            Spacer()
                            Menu {
                                Button("Free") { setPlan(user, "free") }
                                Button("Premium") { setPlan(user, "premium") }
                            } label: {
                                StatusBadge(status: user.plan == "premium" ? "active" : "paused")
                            }
                        }
                        .cardStyle(padding: 12)
                    }
                }
            }
            .padding(Theme.padding)
        }
        .screenBackground()
        .navigationTitle("Administração")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Buscar usuário")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = users.isEmpty
        errorMessage = nil
        do {
            async let statsTask: AdminStats = APIClient.shared.get("/api/admin/statistics")
            async let usersTask: AdminUsersResponse = APIClient.shared.get("/api/admin/users")
            stats = try await statsTask
            users = try await usersTask.users ?? []
        } catch let error {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func setPlan(_ user: AdminUser, _ plan: String) {
        Task {
            do {
                try await APIClient.shared.postOK("/api/admin/users/plan", body: [
                    "user_id": user.id,
                    "plan": plan
                ])
                await load()
            } catch let error {
                errorMessage = error.localizedDescription
            }
        }
    }
}
