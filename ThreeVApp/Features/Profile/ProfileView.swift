import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var store: Store

    @State private var email = ""
    @State private var newPassword = ""
    @State private var challengeId: String?
    @State private var code = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var infoMessage: String?

    @State private var twoFactorEnabled = false
    @State private var twoFactorMethod = "email"
    @State private var twoFactorChallenge: String?
    @State private var twoFactorCode = ""
    @State private var recoveryCodes: [String] = []

    @State private var deletePassword = ""
    @State private var deleteChallenge: String?
    @State private var deleteCode = ""
    @State private var showDelete = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let errorMessage = errorMessage { ErrorBanner(message: errorMessage) }
                if let infoMessage = infoMessage {
                    Text(infoMessage)
                        .font(.system(size: 12))
                        .foregroundColor(Theme.success)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.success.opacity(0.12)))
                }

                accountCard
                securityCard
                dangerCard
            }
            .padding(Theme.padding)
        }
        .screenBackground()
        .navigationTitle("Perfil")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadTwoFactor() }
    }

    private var accountCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: "Conta")
            InfoRow(label: "Usuário", value: store.user?.username ?? "—")
            InfoRow(label: "E-mail", value: store.user?.email ?? "não informado")
            InfoRow(label: "Plano", value: store.planLabel)
            InfoRow(label: "Limite de pacotes", value: limitText(store.user?.maxPackages))
            InfoRow(label: "Limite de chaves", value: limitText(store.user?.maxKeys))
        }
        .cardStyle()
    }

    private var securityCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: "Alterar e-mail ou senha")

            if challengeId == nil {
                LabeledField(label: "Novo e-mail (opcional)", placeholder: "voce@email.com", text: $email, keyboard: .emailAddress)
                LabeledField(label: "Nova senha (opcional)", placeholder: "mínimo 8 caracteres", text: $newPassword, isSecure: true)
                Button {
                    requestChange()
                } label: {
                    Text(isLoading ? "Solicitando…" : "Solicitar código")
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isLoading || (email.isEmpty && newPassword.isEmpty))
            } else {
                Text("Enviamos um código de 6 dígitos (no console do backend nesta versão).")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.muted)
                TextField("000000", text: $code)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.center)
                    .font(.system(size: 22, weight: .bold, design: .monospaced))
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))
                Button {
                    confirmChange()
                } label: {
                    Text(isLoading ? "Confirmando…" : "Confirmar alteração")
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isLoading || code.count < 4)
            }

            Divider().background(Theme.border)

            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Verificação em duas etapas")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Theme.text)
                    Text(twoFactorEnabled ? "Ativada via \(twoFactorMethod)" : "Desativada")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.muted)
                }
                Spacer()
                StatusBadge(status: twoFactorEnabled ? "active" : "paused")
            }

            if twoFactorChallenge == nil {
                if twoFactorEnabled {
                    Button("Desativar 2FA") { disableTwoFactor() }
                        .buttonStyle(SecondaryButtonStyle())
                } else {
                    HStack(spacing: 10) {
                        Button("Ativar por e-mail") { setupTwoFactor("email") }
                            .buttonStyle(SecondaryButtonStyle())
                        Button("Telegram") { setupTwoFactor("telegram") }
                            .buttonStyle(SecondaryButtonStyle())
                    }
                }
            } else {
                TextField("Código recebido", text: $twoFactorCode)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.center)
                    .font(.system(size: 22, weight: .bold, design: .monospaced))
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))
                Button("Confirmar 2FA") { confirmTwoFactor() }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(twoFactorCode.count < 4)
            }

            if !recoveryCodes.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Códigos de recuperação (guarde agora)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Theme.warn)
                    Text(recoveryCodes.joined(separator: "  ·  "))
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(Theme.text2)
                    Button("Copiar códigos") { Clipboard.copy(recoveryCodes.joined(separator: "\n")) }
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Theme.text2)
                }
            }
        }
        .cardStyle()
    }

    private var dangerCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: "Zona de risco")

            if deleteChallenge == nil {
                Button {
                    showDelete = true
                } label: {
                    Label("Excluir minha conta", systemImage: "trash")
                        .foregroundColor(Theme.danger)
                }
                .buttonStyle(SecondaryButtonStyle())
                .alert("Excluir conta permanentemente?", isPresented: $showDelete) {
                    SecureField("Senha atual", text: $deletePassword)
                    Button("Solicitar código", role: .destructive) { requestDelete() }
                    Button("Cancelar", role: .cancel) {}
                } message: {
                    Text("Pacotes, licenças e aparelhos vinculados serão apagados.")
                }
            } else {
                Text("Informe o código de 6 dígitos para concluir a exclusão.")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.muted)
                TextField("000000", text: $deleteCode)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.center)
                    .font(.system(size: 22, weight: .bold, design: .monospaced))
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))
                Button("Confirmar exclusão") { confirmDelete() }
                    .buttonStyle(PrimaryButtonStyle(color: Theme.danger))
                    .disabled(deleteCode.count < 4)
            }
        }
        .cardStyle()
    }

    private func limitText(_ value: Int?) -> String {
        guard let value = value else { return "—" }
        return value < 0 ? "ilimitado" : "\(value)"
    }

    // MARK: - Ações

    private func requestChange() {
        errorMessage = nil
        infoMessage = nil
        isLoading = true
        var body: [String: Any] = [:]
        if !email.isEmpty { body["email"] = email }
        if !newPassword.isEmpty { body["password"] = newPassword }

        Task {
            do {
                let response: ChallengeResponse = try await APIClient.shared.post("/api/profile/change/request", body: body)
                challengeId = response.challengeId
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    private func confirmChange() {
        guard let challengeId = challengeId else { return }
        isLoading = true
        errorMessage = nil
        Task {
            do {
                try await APIClient.shared.postOK("/api/profile/change/confirm", body: [
                    "challenge_id": challengeId,
                    "code": code.trimmingCharacters(in: .whitespaces)
                ])
                infoMessage = "Dados atualizados. Entre novamente com as novas credenciais."
                self.challengeId = nil
                code = ""
                email = ""
                newPassword = ""
                await store.logout()
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    private func loadTwoFactor() async {
        do {
            let response: TwoFactorStatus = try await APIClient.shared.get("/api/2fa/status")
            twoFactorEnabled = response.enabled ?? false
            twoFactorMethod = response.method ?? "email"
        } catch {
            // silencioso: nem todos os perfis têm 2FA
        }
    }

    private func setupTwoFactor(_ method: String) {
        errorMessage = nil
        Task {
            do {
                let response: ChallengeResponse = try await APIClient.shared.post("/api/2fa/setup", body: ["method": method])
                twoFactorChallenge = response.challengeId
            } catch let error {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func confirmTwoFactor() {
        guard let challenge = twoFactorChallenge else { return }
        Task {
            do {
                let response: RecoveryCodesResponse = try await APIClient.shared.post("/api/2fa/confirm", body: [
                    "challenge_id": challenge,
                    "code": twoFactorCode.trimmingCharacters(in: .whitespaces)
                ])
                recoveryCodes = response.recoveryCodes ?? []
                twoFactorEnabled = true
                twoFactorChallenge = nil
                twoFactorCode = ""
                await loadTwoFactor()
            } catch let error {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func disableTwoFactor() {
        Task {
            do {
                try await APIClient.shared.postOK("/api/2fa/disable")
                twoFactorEnabled = false
                await loadTwoFactor()
            } catch let error {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func requestDelete() {
        Task {
            do {
                let response: ChallengeResponse = try await APIClient.shared.post("/api/auth/delete-account/request", body: [
                    "password": deletePassword
                ])
                deleteChallenge = response.challengeId
            } catch let error {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func confirmDelete() {
        guard let challenge = deleteChallenge else { return }
        Task {
            do {
                try await APIClient.shared.postOK("/api/auth/delete-account/confirm", body: [
                    "challenge_id": challenge,
                    "code": deleteCode.trimmingCharacters(in: .whitespaces)
                ])
                await store.logout()
            } catch let error {
                errorMessage = error.localizedDescription
            }
        }
    }
}

struct ChallengeResponse: Decodable {
    let ok: Bool?
    let challengeId: String?

    enum CodingKeys: String, CodingKey {
        case ok
        case challengeId = "challenge_id"
    }
}

struct TwoFactorStatus: Decodable {
    let enabled: Bool?
    let method: String?
}

struct RecoveryCodesResponse: Decodable {
    let ok: Bool?
    let recoveryCodes: [String]?

    enum CodingKeys: String, CodingKey {
        case ok
        case recoveryCodes = "recovery_codes"
    }
}
