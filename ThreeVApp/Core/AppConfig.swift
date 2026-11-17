import Foundation

/// Configuração global do app. O endereço do backend é definido pelo usuário na
/// tela de login (ou em Mais → Servidor) e fica salvo no aparelho.
enum AppConfig {
    /// Endereço padrão. Troque aqui pelo seu backend público, ou configure no app.
    static let defaultBaseURL = "https://SEU-BACKEND-AQUI.exemplo.com"

    private static let baseURLKey = "threev.baseURL"

    static var baseURL: String {
        get {
            let stored = UserDefaults.standard.string(forKey: baseURLKey)
            return normalize(stored ?? defaultBaseURL)
        }
        set {
            UserDefaults.standard.set(normalize(newValue), forKey: baseURLKey)
        }
    }

    static var isConfigured: Bool {
        let url = baseURL
        return !url.isEmpty && !url.contains("exemplo.com")
    }

    /// Aceita "meuapp.up.railway.app", "http://192.168.0.10:3000" e afins.
    static func normalize(_ raw: String) -> String {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return "" }
        let lower = value.lowercased()
        if !lower.hasPrefix("http://") && !lower.hasPrefix("https://") {
            let isLocal = lower.hasPrefix("localhost") || lower.hasPrefix("127.0.0.1") || lower.hasPrefix("192.168.") || lower.hasPrefix("10.") || lower.hasPrefix("172.16.")
            value = (isLocal ? "http://" : "https://") + value
        }
        while value.hasSuffix("/") { value.removeLast() }
        return value
    }

    static let appVersion: String = {
        let short = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(short) (\(build))"
    }()
}
