import SwiftUI

struct ForgotPasswordView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var token = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var successMessage: String?
    @State private var requested = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if let errorMessage = errorMessage {
                        ErrorBanner(message: errorMessage)
                    }
                    if let successMessage = successMessage {
                        HStack(spacing: 10) {
                            Image(systemName: "checkmark.circle.fill").foregroundColor(Theme.success)
                            Text(successMessage).font(.system(size: 13)).foregroundColor(Theme.text)
                            Spacer(minLength: 0)
                        }
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.success.opacity(0.12)))
                    }

                    VStack(spacing: 14) {
                        LabeledField(label: "E-mail da conta", placeholder: "voce@email.com", text: $email, keyboard: .emailAddress)

                        Button {
                            requestReset()
                        } label: {
                            Text(isLoading && !requested ? "Enviando…" : "Enviar redefinição")
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(isLoading || email.isEmpty)

                        Text("Nesta versão o backend imprime o link de redefinição no console. Copie o token que aparece no link (`?reset=…`).")
                            .font(.system(size: 11))
                            .foregroundColor(Theme.muted)
                            .multilineTextAlignment(.center)
                    }
                    .cardStyle(padding: 18)

                    if requested {
                        VStack(spacing: 14) {
                            SectionTitle(text: "Definir nova senha")
                            LabeledField(label: "Token do link", placeholder: "cole o token aqui", text: $token)
                            LabeledField(label: "Nova senha", placeholder: "mínimo 8 caracteres", text: $password, isSecure: true)
                            Button {
                                resetPassword()
                            } label: {
                                Text(isLoading ? "Salvando…" : "Redefinir senha")
                            }
                            .buttonStyle(PrimaryButtonStyle())
                            .disabled(isLoading || token.isEmpty || password.count < 8)
                        }
                        .cardStyle(padding: 18)
                    }
                }
                .padding(20)
            }
            .screenBackground()
            .navigationTitle("Esqueci a senha")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fechar") { dismiss() }
                        .foregroundColor(Theme.text2)
                }
            }
        }
    }

    private func requestReset() {
        errorMessage = nil
        successMessage = nil
        isLoading = true
        Task {
            do {
                let response: OKResponse = try await APIClient.shared.post(
                    "/api/auth/password/forgot",
                    body: ["email": email.trimmingCharacters(in: .whitespacesAndNewlines)]
                )
                successMessage = response.message ?? "Se este e-mail existir, um link de redefinição foi gerado."
                requested = true
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    private func resetPassword() {
        errorMessage = nil
        successMessage = nil
        isLoading = true
        Task {
            do {
                try await APIClient.shared.postOK("/api/auth/password/reset", body: [
                    "token": token.trimmingCharacters(in: .whitespacesAndNewlines),
                    "password": password
                ])
                successMessage = "Senha redefinida. Você já pode entrar."
                token = ""
                password = ""
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}
