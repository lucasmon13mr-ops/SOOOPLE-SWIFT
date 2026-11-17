import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var store: Store

    @State private var username = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    @State private var showServerSettings = false
    @State private var serverField = AppConfig.baseURL

    @State private var challengeId: String?
    @State private var code = ""
    @State private var method = "email"

    @State private var showSignup = false
    @State private var showForgot = false

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                header
                if let challengeId = challengeId {
                    twoFactorCard(challenge: challengeId)
                } else {
                    credentialsCard
                    if showServerSettings {
                        serverSettings
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
                footer
            }
            .padding(.horizontal, 20)
            .padding(.top, 40)
            .padding(.bottom, 30)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .sheet(isPresented: $showSignup) {
            SignupView().environmentObject(store)
        }
        .sheet(isPresented: $showForgot) {
            ForgotPasswordView()
        }
    }

    // MARK: - Cabeçalho

    private var header: some View {
        VStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(
                        LinearGradient(colors: [Theme.accent, Color(hex: 0x8A0E0E)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    )
                    .frame(width: 74, height: 74)
                    .shadow(color: Theme.accent.opacity(0.4), radius: 18, y: 8)
                Text("3V")
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
                    .foregroundColor(.white)
            }
            Text("ZOLMEA API")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(Theme.text)
                .tracking(1.5)
            Text("Central de controle de licenças")
                .font(.system(size: 13))
                .foregroundColor(Theme.muted)
        }
        .padding(.bottom, 6)
    }

    // MARK: - Login

    private var credentialsCard: some View {
        VStack(spacing: 14) {
            if let errorMessage = errorMessage {
                ErrorBanner(message: errorMessage)
            }

            LabeledField(label: "Usuário ou e-mail", placeholder: "seu_usuario", text: $username)
            LabeledField(label: "Senha", placeholder: "••••••••", text: $password, isSecure: true)

            Button {
                submit()
            } label: {
                HStack(spacing: 8) {
                    if isLoading { ProgressView().tint(.white) }
                    Text(isLoading ? "Entrando…" : "Entrar")
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isLoading || username.isEmpty || password.isEmpty)
            .opacity(username.isEmpty || password.isEmpty ? 0.6 : 1)

            HStack {
                Button("Criar conta") { showSignup = true }
                Spacer()
                Button("Esqueci a senha") { showForgot = true }
            }
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(Theme.text2)
            .padding(.top, 4)
        }
        .cardStyle(padding: 18)
        .overlay(alignment: .topTrailing) {
            Button {
                serverField = AppConfig.baseURL
                withAnimation { showServerSettings.toggle() }
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 13))
                    .foregroundColor(Theme.muted)
                    .padding(12)
            }
        }
    }

    private var serverSettings: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Endereço do backend")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Theme.text2)
            TextField("https://seu-backend.up.railway.app", text: $serverField)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .keyboardType(.URL)
                .font(.system(size: 14, design: .monospaced))
                .foregroundColor(Theme.text)
                .padding(11)
                .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))
            Text("Use a URL pública do backend (Railway, Render, VPS…). Sem barra no final.")
                .font(.system(size: 11))
                .foregroundColor(Theme.muted)
            Text("API oficial: \(AppConfig.defaultBaseURL)")
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(Theme.success)
                .textSelection(.enabled)
            Button("Restaurar API oficial") {
                serverField = AppConfig.defaultBaseURL
                store.saveServer(AppConfig.defaultBaseURL)
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(Theme.text2)
            Button("Salvar servidor") {
                store.saveServer(serverField)
                withAnimation { showServerSettings = false }
            }
            .buttonStyle(SecondaryButtonStyle())
        }
        .cardStyle(padding: 14)
        .background(Theme.surface2)
    }

    // MARK: - 2FA

    private func twoFactorCard(challenge: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 30))
                .foregroundColor(Theme.purple)
            Text("Verificação em duas etapas")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.text)
            Text("Enviamos um código de 6 dígitos via \(method == "telegram" ? "Telegram" : "e-mail").")
                .font(.system(size: 13))
                .foregroundColor(Theme.muted)
                .multilineTextAlignment(.center)

            if let errorMessage = errorMessage {
                ErrorBanner(message: errorMessage)
            }

            TextField("000000", text: $code)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(.system(size: 26, weight: .bold, design: .monospaced))
                .foregroundColor(Theme.text)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))

            Button {
                verify(challenge: challenge)
            } label: {
                Text(isLoading ? "Verificando…" : "Confirmar código")
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isLoading || code.count < 4)

            Button("Voltar") {
                self.challengeId = nil
                self.code = ""
                self.errorMessage = nil
            }
            .font(.system(size: 13))
            .foregroundColor(Theme.text2)
        }
        .cardStyle(padding: 18)
    }

    private var footer: some View {
        VStack(spacing: 6) {
            Text("Conectado em \(AppConfig.baseURL)")
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(Theme.muted)
                .lineLimit(1)
                .truncationMode(.middle)
            Text("versão \(AppConfig.appVersion)")
                .font(.system(size: 10))
                .foregroundColor(Theme.muted.opacity(0.7))
        }
        .padding(.top, 10)
    }

    // MARK: - Ações

    private func submit() {
        errorMessage = nil
        if !AppConfig.isConfigured {
            errorMessage = "Configure o endereço do backend no ícone de engrenagem."
            withAnimation { showServerSettings = true }
            return
        }
        isLoading = true
        let user = username.trimmingCharacters(in: .whitespacesAndNewlines)
        let pass = password
        Task {
            do {
                let response = try await store.login(username: user, password: pass)
                if response.twofaRequired == true {
                    challengeId = response.challengeId
                    method = response.method ?? "email"
                } else if response.ok != true {
                    errorMessage = "Usuário ou senha incorretos."
                } else {
                    password = ""
                }
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    private func verify(challenge: String) {
        errorMessage = nil
        isLoading = true
        let entered = code.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            do {
                try await store.verifyTwoFactor(challengeId: challenge, code: entered)
                password = ""
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}
