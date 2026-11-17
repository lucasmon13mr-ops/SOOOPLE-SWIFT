import SwiftUI

struct MoreView: View {
    @EnvironmentObject private var store: Store
    @State private var showLogoutConfirm = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    profileCard

                    VStack(spacing: 10) {
                        SectionTitle(text: "Módulos")

                        NavigationLink { CheckLogView() } label: {
                            row(icon: "shield.lefthalf.filled", title: "Verificações do SDK", subtitle: "Log de validações", tint: Theme.success)
                        }

                        NavigationLink { IPBansView() } label: {
                            row(icon: "hand.raised.fill", title: "IPs bloqueados", subtitle: "Bloquear e liberar IPs", tint: Theme.danger)
                        }

                        if store.canUseBuilder {
                            NavigationLink { BuilderView() } label: {
                                row(icon: "hammer.fill", title: "Construtor de projetos", subtitle: "Compilar .deb e .dylib", tint: Theme.warn)
                            }
                        }

                        if store.canManageResellers {
                            NavigationLink { ResellersView() } label: {
                                row(icon: "person.2.fill", title: "Revendedores", subtitle: "Contas e cotas de chaves", tint: Theme.purple)
                            }
                        }

                        if store.isOwner {
                            NavigationLink { AuditView() } label: {
                                row(icon: "list.bullet.rectangle", title: "Auditoria", subtitle: "Histórico de ações", tint: Theme.text2)
                            }

                            NavigationLink { AdminView() } label: {
                                row(icon: "crown.fill", title: "Administração", subtitle: "Usuários, planos e estatísticas", tint: Theme.accent)
                            }
                        }
                    }

                    VStack(spacing: 10) {
                        SectionTitle(text: "Conta")
                        NavigationLink { ProfileView() } label: {
                            row(icon: "person.crop.circle", title: "Perfil e segurança", subtitle: "E-mail, senha, 2FA", tint: Theme.text2)
                        }
                        NavigationLink { ServerSettingsView() } label: {
                            row(icon: "server.rack", title: "Servidor", subtitle: AppConfig.baseURL, tint: Theme.text2)
                        }
                    }

                    Button {
                        showLogoutConfirm = true
                    } label: {
                        Label("Sair da conta", systemImage: "rectangle.portrait.and.arrow.right")
                            .foregroundColor(Theme.danger)
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    .padding(.top, 4)

                    Text("ZOLMEA API · versão \(AppConfig.appVersion)")
                        .font(.system(size: 10))
                        .foregroundColor(Theme.muted)
                        .padding(.top, 6)
                }
                .padding(Theme.padding)
            }
            .screenBackground()
            .navigationTitle("Mais")
            .navigationBarTitleDisplayMode(.inline)
            .confirmationDialog("Sair da conta?", isPresented: $showLogoutConfirm, titleVisibility: .visible) {
                Button("Sair", role: .destructive) {
                    Task { await store.logout() }
                }
                Button("Cancelar", role: .cancel) {}
            }
        }
    }

    private var profileCard: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(LinearGradient(colors: [Theme.accent, Color(hex: 0x7A0C0C)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 52, height: 52)
                Text(store.user?.initials ?? "?")
                    .font(.system(size: 21, weight: .bold))
                    .foregroundColor(.white)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(store.user?.username ?? "—")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Theme.text)
                Text(store.user?.email ?? "sem e-mail")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.muted)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    StatusBadge(status: store.user?.role == "owner" ? "active" : "paused")
                    Text(store.roleLabel)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Theme.text2)
                    Text("· plano \(store.planLabel)")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.muted)
                }
            }
            Spacer()
        }
        .cardStyle()
    }

    private func row(icon: String, title: String, subtitle: String, tint: Color) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(tint)
                .frame(width: 32, height: 32)
                .background(Circle().fill(tint.opacity(0.12)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Theme.text)
                Text(subtitle)
                    .font(.system(size: 11))
                    .foregroundColor(Theme.muted)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Theme.muted)
        }
        .cardStyle(padding: 12)
    }
}

struct ServerSettingsView: View {
    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss

    @State private var field = AppConfig.baseURL
    @State private var saved = false

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                LabeledField(label: "Endereço do backend", placeholder: "https://seu-backend.up.railway.app", text: $field, keyboard: .URL)

                Text("Informe a URL pública do backend Node (Railway, Render, VPS…). O app fala com /api/* dessa URL.")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Button {
                    store.saveServer(field)
                    field = AppConfig.baseURL
                    saved = true
                } label: {
                    Text(saved ? "Salvo" : "Salvar")
                }
                .buttonStyle(PrimaryButtonStyle())
            }
            .padding(Theme.padding)
        }
        .screenBackground()
        .navigationTitle("Servidor")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { field = AppConfig.baseURL }
    }
}
