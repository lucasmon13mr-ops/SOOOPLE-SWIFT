import Foundation

// MARK: - Usuário

struct User: Codable, Identifiable, Equatable {
    let id: Int
    let username: String
    let email: String?
    let role: String
    let plan: String
    let maxPackages: Int?
    let maxKeys: Int?

    enum CodingKeys: String, CodingKey {
        case id, username, email, role, plan
        case maxPackages = "max_packages"
        case maxKeys = "max_keys"
    }

    var initials: String {
        String(username.prefix(1)).uppercased()
    }
}

struct MeResponse: Decodable {
    let user: User?
}

struct LoginResponse: Decodable {
    let ok: Bool?
    let twofaRequired: Bool?
    let challengeId: String?
    let method: String?
    let user: User?

    enum CodingKeys: String, CodingKey {
        case ok, method, user
        case twofaRequired = "twofa_required"
        case challengeId = "challenge_id"
    }
}

struct OKResponse: Decodable {
    let ok: Bool?
    let message: String?
}

// MARK: - Pacotes

struct Package: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let tokenMasked: String?
    let maxDevices: Int?
    let allowInject: Bool?
    let maxDylibs: Int?
    let status: String
    let createdAt: String?
    let telegramUsername: String?
    let latestVersion: String?
    let updateUrl: String?
    let note: String?

    enum CodingKeys: String, CodingKey {
        case id, name, status, note
        case tokenMasked = "token_masked"
        case maxDevices = "max_devices"
        case allowInject = "allow_inject"
        case maxDylibs = "max_dylibs"
        case createdAt = "created_at"
        case telegramUsername = "telegram_username"
        case latestVersion = "latest_version"
        case updateUrl = "update_url"
    }
}

struct PackagesResponse: Decodable {
    let packages: [Package]?
}

struct SimplePackage: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let status: String?
}

struct SimplePackagesResponse: Decodable {
    let packages: [SimplePackage]?
}

struct PackageTokenResponse: Decodable {
    let token: String?
}

/// O que devolvemos para quem criou um pacote (token e segredo aparecem uma vez).
struct CreatedPackageInfo {
    let name: String
    let token: String
    let secret: String
}

struct CreatedKeysResponse: Decodable {
    let created: Int?
    let keys: [String]?
}

// MARK: - Licenças

struct License: Decodable, Identifiable, Hashable {
    let id: Int
    let packageName: String?
    let licenseKey: String
    let status: String
    let devicesUsed: Int?
    let maxDevices: Int?
    let durationDays: Int?
    let expiresAt: String?
    let note: String?

    enum CodingKeys: String, CodingKey {
        case id, status, note
        case packageName = "package_name"
        case licenseKey = "license_key"
        case devicesUsed = "devices_used"
        case maxDevices = "max_devices"
        case durationDays = "duration_days"
        case expiresAt = "expires_at"
    }
}

struct LicensesResponse: Decodable {
    let licenses: [License]?
}

// MARK: - Dispositivos

struct Device: Decodable, Identifiable, Hashable {
    let id: Int
    let licenseId: Int?
    let deviceIdHash: String?
    let deviceNameHash: String?
    let hardwareHash: String?
    let systemHash: String?
    let lastOsSeen: String?
    let lastIpSeen: String?
    let lastSeenAt: String?
    let checkCount: Int?
    let banOverride: String?
    let createdAt: String?
    let licenseKey: String?
    let packageName: String?

    enum CodingKeys: String, CodingKey {
        case id
        case licenseId = "license_id"
        case deviceIdHash = "device_id_hash"
        case deviceNameHash = "device_name_hash"
        case hardwareHash = "hardware_hash"
        case systemHash = "system_hash"
        case lastOsSeen = "last_os_seen"
        case lastIpSeen = "last_ip_seen"
        case lastSeenAt = "last_seen_at"
        case checkCount = "check_count"
        case banOverride = "ban_override"
        case createdAt = "created_at"
        case licenseKey = "license_key"
        case packageName = "package_name"
    }
}

struct DevicesResponse: Decodable {
    let devices: [Device]?
}

// MARK: - Verificações, IP bans e auditoria

struct CheckEntry: Decodable, Identifiable {
    let id: Int
    let packageToken: String?
    let deviceHash: String?
    let result: String?
    let detail: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, result, detail
        case packageToken = "package_token"
        case deviceHash = "device_hash"
        case createdAt = "created_at"
    }
}

struct CheckLogResponse: Decodable {
    let log: [CheckEntry]?
}

struct IPBan: Decodable, Identifiable {
    let id: Int
    let ipHash: String
    let reason: String?
    let expiresAt: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, reason
        case ipHash = "ip_hash"
        case expiresAt = "expires_at"
        case createdAt = "created_at"
    }
}

struct IPBansResponse: Decodable {
    let bans: [IPBan]?
}

struct AuditEntry: Decodable, Identifiable {
    let id: Int
    let actor: String?
    let action: String?
    let targetType: String?
    let targetId: Int?
    let detail: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, actor, action, detail
        case targetType = "target_type"
        case targetId = "target_id"
        case createdAt = "created_at"
    }
}

struct AuditResponse: Decodable {
    let log: [AuditEntry]?
}

// MARK: - Revendedores

struct ResellerPackage: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let status: String?
}

struct Reseller: Decodable, Identifiable {
    let id: Int
    let username: String
    let email: String?
    let maxKeys: Int?
    let accountStatus: String?
    let createdKeys: Int?
    let packages: [ResellerPackage]?

    enum CodingKeys: String, CodingKey {
        case id, username, email, packages
        case maxKeys = "max_keys"
        case accountStatus = "account_status"
        case createdKeys = "created_keys"
    }
}

struct ResellersResponse: Decodable {
    let resellers: [Reseller]?
}

// MARK: - Admin

struct AdminUser: Decodable, Identifiable {
    let id: Int
    let username: String
    let email: String?
    let plan: String
    let maxPackages: Int?
    let maxKeys: Int?

    enum CodingKeys: String, CodingKey {
        case id, username, email, plan
        case maxPackages = "max_packages"
        case maxKeys = "max_keys"
    }
}

struct AdminUsersResponse: Decodable {
    let users: [AdminUser]?
}

struct Stats: Decodable {
    let packages: Int?
    let licenses: Int?
    let activeLicenses: Int?
    let devices: Int?
    let checks24h: Int?
    let failed24h: Int?

    enum CodingKeys: String, CodingKey {
        case packages, licenses, devices
        case activeLicenses = "active_licenses"
        case checks24h = "checks_24h"
        case failed24h = "failed_24h"
    }
}

struct AdminStats: Decodable {
    let users: Int?
    let freeUsers: Int?
    let premiumUsers: Int?
    let packages: Int?
    let licenses: Int?
    let activeLicenses: Int?
    let devices: Int?
    let checks24h: Int?

    enum CodingKeys: String, CodingKey {
        case users, packages, licenses, devices
        case freeUsers = "free_users"
        case premiumUsers = "premium_users"
        case activeLicenses = "active_licenses"
        case checks24h = "checks_24h"
    }
}

// MARK: - Construtor de projetos

struct BuildArtifact: Decodable, Identifiable {
    let name: String
    let url: String?

    var id: String { name }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DynamicKey.self)
        let raw = container.allKeys.first { key in
            ["name", "file", "filename", "path"].contains(key.stringValue)
        }
        name = raw.flatMap { try? container.decode(String.self, forKey: $0) } ?? "arquivo"
        let urlKey = container.allKeys.first { key in
            ["url", "download_url", "href"].contains(key.stringValue)
        }
        url = urlKey.flatMap { try? container.decode(String.self, forKey: $0) }
    }
}

struct DynamicKey: CodingKey {
    var stringValue: String
    var intValue: Int?
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { self.intValue = intValue; self.stringValue = String(intValue) }
}

struct BuildQuota: Decodable {
    let unlimited: Bool?
    let plan: String?
    let used: Int?
    let limit: Int?
    let remaining: Int?

    var summary: String {
        if unlimited == true { return "Compilações ilimitadas" }
        return "\(remaining ?? 0) de \(limit ?? 0) compilações restantes hoje"
    }
}

struct ProjectBuild: Decodable, Identifiable {
    let id: Int
    let packageId: Int?
    let packageName: String?
    let bundleId: String?
    let projectName: String?
    let originalFilename: String?
    let status: String
    let stage: String?
    let message: String?
    let storageStatus: String?
    let telegramStatus: String?
    let artifacts: [BuildArtifact]?

    enum CodingKeys: String, CodingKey {
        case id, status, stage, message, artifacts
        case packageId = "package_id"
        case packageName = "package_name"
        case bundleId = "bundle_id"
        case projectName = "project_name"
        case originalFilename = "original_filename"
        case storageStatus = "storage_status"
        case telegramStatus = "telegram_status"
    }

    var isRunning: Bool {
        status == "queued" || status == "building"
    }
}

struct ProjectBuildListResponse: Decodable {
    let quota: BuildQuota?
    let builds: [ProjectBuild]?
    let githubConfigured: Bool?

    enum CodingKeys: String, CodingKey {
        case quota, builds
        case githubConfigured = "github_configured"
    }
}

struct SDKFile: Decodable, Identifiable {
    let packageId: Int
    let packageName: String
    let status: String?

    var id: Int { packageId }

    enum CodingKeys: String, CodingKey {
        case packageId = "package_id"
        case packageName = "package_name"
        case status
    }
}

struct SDKFilesResponse: Decodable {
    let files: [SDKFile]?
}
