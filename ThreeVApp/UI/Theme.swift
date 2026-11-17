import SwiftUI

/// Paleta e medidas do painel web da ZOLMEA, trazidas para o SwiftUI.
enum Theme {
    static let bg = Color(hex: 0x06090F)
    static let bg2 = Color(hex: 0x0A0F18)
    static let surface = Color(hex: 0x10151F)
    static let surface2 = Color(hex: 0x161D2A)
    static let surface3 = Color(hex: 0x1D2535)
    static let border = Color(hex: 0x222B3B)
    static let borderStrong = Color(hex: 0x2C3850)

    static let text = Color(hex: 0xE8EDF5)
    static let text2 = Color(hex: 0xAAB4C4)
    static let muted = Color(hex: 0x6B7688)

    static let accent = Color(hex: 0xFF3B3B)
    static let accent2 = Color(hex: 0xFF6B6B)
    static let success = Color(hex: 0x2DD4A0)
    static let warn = Color(hex: 0xFFB454)
    static let danger = Color(hex: 0xFF6B6B)
    static let purple = Color(hex: 0xB78BFF)

    static let radius: CGFloat = 14
    static let radiusSmall: CGFloat = 10
    static let padding: CGFloat = 16
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}

extension View {
    /// Fundo padrão do app, aplicado por tela.
    func screenBackground() -> some View {
        self.background(Theme.bg.ignoresSafeArea())
    }

    func cardStyle(padding: CGFloat = Theme.padding) -> some View {
        self
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .fill(Theme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
    }
}

/// Botão principal (vermelho da marca).
struct PrimaryButtonStyle: ButtonStyle {
    var color: Color = Theme.accent

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(
                RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous)
                    .fill(color.opacity(configuration.isPressed ? 0.75 : 1))
            )
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
    }
}

/// Botão secundário (contorno).
struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundColor(Theme.text)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous)
                    .fill(Theme.surface2.opacity(configuration.isPressed ? 0.6 : 1))
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radiusSmall, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
    }
}
