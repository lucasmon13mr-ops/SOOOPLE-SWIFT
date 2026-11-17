import Foundation
import SwiftUI

/// Estado global de sessão (usuário logado, servidor, avisos).
@MainActor
final class Store: ObservableObject {
    @Published private(set) var user: User?
    @Published var isBootstrapping = true
    @Published var serverURL: String = AppConfig.baseURL
    @Published var notice: String?
    @Published var displayName: String = UserDefaults.standard.string(forKey: "threev.displayName") ?? ""
    @Published var menuAccentHex: UInt32 = UInt32(UserDefaults.standard.integer(forKey: "threev.menuAccentHex")) == 0 ? 0xFF3B3B : UInt32(UserDefaults.standard.integer(forKey: "threev.menuAccentHex"))
    @Published var profileImageData: Data? = UserDefaults.standard.data(forKey: "threev.profileImageData")

    private var sessionObserver: NSObjectProtocol?

    init() {
        sessionObserver = NotificationCenter.default.addObserver(
            forName: .threeVSessionExpired,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.handleSessionExpired()
            }
        }
    }

    deinit {
        if let observer = sessionObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // MARK: - Derivados

    var isLoggedIn: Bool { user != nil }
    var isOwner: Bool { user?.role == "owner" }
    var isReseller: Bool { user?.role == "reseller" }
    var canManageResellers: Bool { user != nil && user?.role != "reseller" }
    var canUseBuilder: Bool { user != nil && user?.role != "reseller" }
    var roleLabel: String {
        switch user?.role {
        case "owner": return "Proprietário"
        case "reseller": return "Revendedor"
        case "user": return "Cliente"
        default: return "—"
        }
    }
    var planLabel: String {
        switch user?.plan {
        case "owner": return "Owner"
        case "premium": return "Premium"
        case "reseller": return "Revendedor"
        case "free": return "Free"
        default: return user?.plan.capitalized ?? "—"
        }
    }

    // MARK: - Sessão

    func bootstrap() async {
        guard AppConfig.isConfigured else {
            isBootstrapping = false
            return
        }
        do {
            let response: MeResponse = try await APIClient.shared.get("/api/me")
            user = response.user
        } catch {
            user = nil
        }
        isBootstrapping = false
    }

    @discardableResult
    func login(username: String, password: String) async throws -> LoginResponse {
        let response: LoginResponse = try await APIClient.shared.post(
            "/api/auth/login",
            body: ["username": username, "password": password]
        )
        if response.ok == true, let user = response.user {
            self.user = user
        }
        return response
    }

    func verifyTwoFactor(challengeId: String, code: String) async throws {
        let response: LoginResponse = try await APIClient.shared.post(
            "/api/auth/2fa/verify",
            body: ["challenge_id": challengeId, "code": code]
        )
        if let user = response.user {
            self.user = user
            return
        }
        guard response.ok == true else {
            throw APIError.http(status: 400, code: "invalid_code", message: nil)
        }
        // A rota devolve só { ok: true }: a sessão já está aberta no cookie,
        // então buscamos o usuário em /api/me.
        await refreshMe()
        if user == nil {
            throw APIError.http(status: 400, code: "invalid_code", message: nil)
        }
    }

    func refreshMe() async {
        do {
            let response: MeResponse = try await APIClient.shared.get("/api/me")
            user = response.user
        } catch {
            // mantém o usuário atual; erros de rede não derrubam a sessão
        }
    }

    func logout() async {
        try? await APIClient.shared.postOK("/api/auth/logout")
        user = nil
        clearCookies()
    }

    func saveServer(_ url: String) {
        let normalized = AppConfig.normalize(url)
        AppConfig.baseURL = normalized
        serverURL = AppConfig.baseURL
    }

    var effectiveDisplayName: String {
        displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? (user?.username ?? "Usuário") : displayName
    }

    var menuAccent: Color { Color(hex: menuAccentHex) }

    func saveProfilePreferences(displayName: String, accentHex: UInt32, imageData: Data?) {
        self.displayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        self.menuAccentHex = accentHex
        self.profileImageData = imageData
        UserDefaults.standard.set(self.displayName, forKey: "threev.displayName")
        UserDefaults.standard.set(Int(accentHex), forKey: "threev.menuAccentHex")
        if let imageData { UserDefaults.standard.set(imageData, forKey: "threev.profileImageData") }
        else { UserDefaults.standard.removeObject(forKey: "threev.profileImageData") }
    }

    func handleSessionExpired() {
        guard user != nil else { return }
        user = nil
        notice = "Sua sessão expirou. Entre novamente."
    }

    private func clearCookies() {
        guard let cookies = HTTPCookieStorage.shared.cookies else { return }
        for cookie in cookies {
            HTTPCookieStorage.shared.deleteCookie(cookie)
        }
    }
}
