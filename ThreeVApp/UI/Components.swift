import SwiftUI
import UIKit

/// Etiqueta de status colorida (active, paused, banned...).
struct StatusBadge: View {
    let status: String

    private var info: (String, Color) {
        switch status.lowercased() {
        case "active", "ok", "success", "valid": return ("Ativo", Theme.success)
        case "paused", "queued", "uploaded": return ("Pausado", Theme.warn)
        case "banned", "failed", "invalid", "denied": return ("Banido", Theme.danger)
        case "expired": return ("Expirado", Theme.muted)
        case "building", "running": return ("Compilando", Theme.purple)
        case "succeeded", "complete", "completed": return ("Concluído", Theme.success)
        default: return (status.isEmpty ? "—" : status.capitalized, Theme.text2)
        }
    }

    var body: some View {
        let (label, color) = info
        Text(label.uppercased())
            .font(.system(size: 10, weight: .bold))
            .tracking(0.6)
            .foregroundColor(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule().fill(color.opacity(0.14))
            )
            .overlay(Capsule().stroke(color.opacity(0.35), lineWidth: 1))
    }
}

/// Cartão de número do painel.
struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    var tint: Color = Theme.accent

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(tint)
                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Theme.text2)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            Text(value)
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .foregroundColor(Theme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .cardStyle(padding: 14)
    }
}

/// Linha de campo chave/valor.
struct InfoRow: View {
    let label: String
    let value: String
    var mono: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label)
                .font(.system(size: 13))
                .foregroundColor(Theme.muted)
            Spacer(minLength: 8)
            Text(value.isEmpty ? "—" : value)
                .font(mono ? .system(size: 13, design: .monospaced) : .system(size: 13))
                .foregroundColor(Theme.text)
                .multilineTextAlignment(.trailing)
        }
    }
}

/// Estado vazio com ícone e texto.
struct EmptyStateView: View {
    let icon: String
    let title: String
    var message: String = ""

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 34, weight: .light))
                .foregroundColor(Theme.muted)
            Text(title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(Theme.text)
            if !message.isEmpty {
                Text(message)
                    .font(.system(size: 13))
                    .foregroundColor(Theme.muted)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 36)
    }
}

/// Faixa de erro.
struct ErrorBanner: View {
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(Theme.danger)
            Text(message)
                .font(.system(size: 13))
                .foregroundColor(Theme.text)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous)
                .fill(Theme.danger.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous)
                .stroke(Theme.danger.opacity(0.3), lineWidth: 1)
        )
    }
}

/// Indicador de carregamento centralizado.
struct LoadingView: View {
    var text: String = "Carregando…"

    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
                .tint(Theme.text)
            Text(text)
                .font(.system(size: 13))
                .foregroundColor(Theme.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(40)
    }
}

/// Título de seção.
struct SectionTitle: View {
    let text: String
    var trailing: String? = nil

    var body: some View {
        HStack {
            Text(text.uppercased())
                .font(.system(size: 11, weight: .bold))
                .tracking(0.8)
                .foregroundColor(Theme.muted)
            Spacer()
            if let trailing = trailing {
                Text(trailing)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Theme.muted)
            }
        }
    }
}

/// Campo de texto estilizado para formulários.
struct LabeledField: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    var isSecure: Bool = false
    var keyboard: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .never

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Theme.text2)
            Group {
                if isSecure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                }
            }
            .textInputAutocapitalization(autocapitalization)
            .autocorrectionDisabled(true)
            .keyboardType(keyboard)
            .font(.system(size: 15))
            .foregroundColor(Theme.text)
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .background(
                RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous)
                    .fill(Theme.surface2)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
        }
    }
}

/// Cabeçalho de uma tela em lista.
struct ScreenHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(Theme.text)
            Text(subtitle)
                .font(.system(size: 13))
                .foregroundColor(Theme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Theme.padding)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }
}
