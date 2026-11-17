import SwiftUI

struct SignupView: View {
    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss

    @State private var username = ""
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var step: Step = .form
    @State private var isLoading = false
    @State private var errorMessage: String?

    private enum Step {
        case form
        case verification
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if let errorMessage = errorMessage {
                        ErrorBanner(message: errorMessage)
                    }

                    if step == .form {
                        form
                    } else {
                        verification
                    }
                }
                .padding(20)
            }
            .screenBackground()
            .navigationTitle("Criar conta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fechar") { dismiss() }
                        .foregroundColor(Theme.text2)
                }
            }
        }
    }

    private var form: some View {
        VStack(spacing: 14) {
            LabeledField(label: "Usuário", placeholder: "seu_usuario", text: $username)
            LabeledField(label: "E-mail", placeholder: "voce@email.com", text: $email, keyboard: .emailAddress)
            LabeledField(label: "Senha", placeholder: "mínimo 8 caracteres", text: $password, isSecure: true)

            Button {
                request()
            } label: {
                Text(isLoading ? "Enviando…" : "Receber código")
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isLoading || username.isEmpty || password.count < 8)

            Text("O código de 6 dígitos aparece no console do backend nesta versão (ainda sem envio de e-mail).")
                .font(.system(size: 11))
                .foregroundColor(Theme.muted)
                .multilineTextAlignment(.center)
        }
        .cardStyle(padding: 18)
    }

    private var verification: some View {
        VStack(spacing: 14) {
            Image(systemName: "envelope.badge.fill")
                .font(.system(size: 30))
                .foregroundColor(Theme.accent)
            Text("Confirme seu cadastro")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.text)
            TextField("000000", text: $code)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(.system(size: 26, weight: .bold, design: .monospaced))
                .foregroundColor(Theme.text)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))

            Button {
                verify()
            } label: {
                Text(isLoading ? "Verificando…" : "Confirmar")
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isLoading || code.count < 4)

            Button("Voltar") { step = .form }
                .font(.system(size: 13))
                .foregroundColor(Theme.text2)
        }
        .cardStyle(padding: 18)
    }

    private func request() {
        errorMessage = nil
        isLoading = true
        Task {
            do {
                try await APIClient.shared.postOK("/api/auth/signup/request", body: [
                    "username": username.trimmingCharacters(in: .whitespacesAndNewlines),
                    "email": email.trimmingCharacters(in: .whitespacesAndNewlines),
                    "password": password
                ])
                step = .verification
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    private func verify() {
        errorMessage = nil
        isLoading = true
        Task {
            do {
                try await APIClient.shared.postOK("/api/auth/signup/verify", body: [
                    "code": code.trimmingCharacters(in: .whitespacesAndNewlines)
                ])
                await store.bootstrap()
                dismiss()
            } catch let error {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}
