import SwiftUI
import UIKit

struct DashboardView: View {
    @EnvironmentObject private var store: Store

    @State private var stats: Stats?
    @State private var checks: [CheckEntry] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    @State private var showNewPackage = false
    @State private var showNewLicense = false

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    greeting
                    if let errorMessage = errorMessage {
                        ErrorBanner(message: errorMessage)
                    }
                    statsGrid
                    quickActions
                    recentChecks
                }
                .padding(.horizontal, Theme.padding)
                .padding(.bottom, 24)
            }
            .screenBackground()
            .navigationTitle("Painel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task { await load() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .foregroundColor(Theme.text2)
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .sheet(isPresented: $showNewPackage) {
                PackageEditorView(package: nil) { _ in
                    Task { await load() }
                }
                .environmentObject(store)
            }
            .sheet(isPresented: $showNewLicense) {
                LicenseCreateView(packages: []) { _ in
                    Task { await load() }
                }
                .environmentObject(store)
            }
        }
    }

    // MARK: - Partes

    private var greeting: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(LinearGradient(colors: [store.menuAccent, Color(hex: 0x7A0C0C)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 46, height: 46)
                Text(store.user?.initials ?? "?")
                    .font(.system(size: 19, weight: .bold))
                    .foregroundColor(.white)
            }
            .overlay {
                if let data = store.profileImageData, let image = UIImage(data: data) {
                    Image(uiImage: image).resizable().scaledToFill()
                }
            }
            .clipShape(Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text("Olá, \(store.effectiveDisplayName)")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(Theme.text)
                Text("\(store.roleLabel) · plano \(store.planLabel)")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.muted)
            }
            Spacer()
        }
        .padding(.top, 8)
    }

    private var statsGrid: some View {
        VStack(spacing: 12) {
            SectionTitle(text: "Resumo", trailing: isLoading ? "carregando…" : nil)
            LazyVGrid(columns: columns, spacing: 12) {
                StatCard(title: "Pacotes", value: Formatters.number(stats?.packages), icon: "shippingbox.fill", tint: Theme.accent)
                StatCard(title: "Licenças", value: Formatters.number(stats?.licenses), icon: "key.fill", tint: Theme.purple)
                StatCard(title: "Licenças ativas", value: Formatters.number(stats?.activeLicenses), icon: "checkmark.seal.fill", tint: Theme.success)
                StatCard(title: "Aparelhos", value: Formatters.number(stats?.devices), icon: "iphone", tint: Theme.warn)
            }
        }
    }

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle(text: "Ações rápidas")
            VStack(spacing: 10) {
                Button {
                    showNewPackage = true
                } label: {
                    actionRow(icon: "plus.circle.fill", title: "Criar pacote", subtitle: "Um novo app ou tweak para licenciar", tint: Theme.accent)
                }

                Button {
                    showNewLicense = true
                } label: {
                    actionRow(icon: "key.horizontal.fill", title: "Gerar licenças", subtitle: "Chaves em lote para um pacote", tint: Theme.purple)
                }

                if store.canUseBuilder {
                    NavigationLink {
                        BuilderView()
                    } label: {
                        actionRow(icon: "hammer.fill", title: "Construtor de projetos", subtitle: "Compilar .deb/.dylib pelo GitHub Actions", tint: Theme.warn)
                    }
                }

                if store.canManageResellers {
                    NavigationLink {
                        ResellersView()
                    } label: {
                        actionRow(icon: "person.2.fill", title: "Revendedores", subtitle: "Criar e gerenciar revendedores", tint: Theme.success)
                    }
                }
            }
        }
    }

    private func actionRow(icon: String, title: String, subtitle: String, tint: Color) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(tint)
                .frame(width: 34, height: 34)
                .background(Circle().fill(tint.opacity(0.14)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Theme.text)
                Text(subtitle)
                    .font(.system(size: 11))
                    .foregroundColor(Theme.muted)
                    .lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Theme.muted)
        }
        .cardStyle(padding: 12)
    }

    private var recentChecks: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle(text: "Últimas verificações do SDK")
            if checks.isEmpty {
                EmptyStateView(icon: "shield.lefthalf.filled", title: "Nenhuma verificação ainda",
                               message: "As validações feitas pelo SDK dos seus apps aparecem aqui.")
                    .cardStyle(padding: 4)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(checks.prefix(6).enumerated()), id: \.element.id) { index, entry in
                        HStack(spacing: 10) {
                            Circle()
                                .fill(resultColor(entry.result).opacity(0.18))
                                .frame(width: 26, height: 26)
                                .overlay(
                                    Image(systemName: resultIcon(entry.result))
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundColor(resultColor(entry.result))
                                )
                            VStack(alignment: .leading, spacing: 2) {
                                Text(Formatters.shorten(entry.deviceHash, to: 18))
                                    .font(.system(size: 12, design: .monospaced))
                                    .foregroundColor(Theme.text)
                                Text(entry.detail ?? entry.packageToken.map { "token \(Formatters.shorten($0, to: 10))" } ?? "—")
                                    .font(.system(size: 11))
                                    .foregroundColor(Theme.muted)
                                    .lineLimit(1)
                            }
                            Spacer()
                            Text(Formatters.relative(entry.createdAt))
                                .font(.system(size: 10))
                                .foregroundColor(Theme.muted)
                        }
                        .padding(.vertical, 10)
                        if index < min(checks.count, 6) - 1 {
                            Divider().background(Theme.border)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .background(RoundedRectangle(cornerRadius: Theme.radius).fill(Theme.surface))
                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.border, lineWidth: 1))
            }
        }
    }

    // MARK: - Dados

    private func resultColor(_ result: String?) -> Color {
        switch result?.lowercased() {
        case "ok", "valid", "success": return Theme.success
        case "invalid", "denied", "banned": return Theme.danger
        default: return Theme.warn
        }
    }

    private func resultIcon(_ result: String?) -> String {
        switch result?.lowercased() {
        case "ok", "valid", "success": return "checkmark"
        case "invalid", "denied", "banned": return "xmark"
        default: return "questionmark"
        }
    }

    private func load() async {
        isLoading = stats == nil
        errorMessage = nil
        do {
            async let statsTask: Stats = APIClient.shared.get("/api/stats")
            async let checksTask: CheckLogResponse = APIClient.shared.get("/api/check-log")
            stats = try await statsTask
            checks = try await checksTask.log ?? []
        } catch let error {
            if !(error is CancellationError) {
                errorMessage = error.localizedDescription
            }
        }
        isLoading = false
    }
}
