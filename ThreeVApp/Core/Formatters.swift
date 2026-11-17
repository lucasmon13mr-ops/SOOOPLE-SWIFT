import Foundation
import UIKit

enum Formatters {
    private static let sqliteDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter
    }()

    private static let isoDate: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let output: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "pt_BR")
        formatter.dateFormat = "dd/MM/yyyy 'às' HH:mm"
        return formatter
    }()

    private static let outputShort: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "pt_BR")
        formatter.dateFormat = "dd/MM/yyyy"
        return formatter
    }()

    /// Converte as datas do backend (SQLite `CURRENT_TIMESTAMP` ou ISO 8601).
    static func date(from raw: String?) -> Date? {
        guard let raw = raw, !raw.isEmpty else { return nil }
        if let date = sqliteDate.date(from: raw) { return date }
        if let date = isoDate.date(from: raw) { return date }
        let fallback = ISO8601DateFormatter()
        return fallback.date(from: raw)
    }

    static func dateTime(_ raw: String?) -> String {
        guard let date = date(from: raw) else { return "—" }
        return output.string(from: date)
    }

    static func shortDate(_ raw: String?) -> String {
        guard let date = date(from: raw) else { return "—" }
        return outputShort.string(from: date)
    }

    static func relative(_ raw: String?) -> String {
        guard let date = date(from: raw) else { return "—" }
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "pt_BR")
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    static func number(_ value: Int?) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "pt_BR")
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value ?? 0)) ?? "\(value ?? 0)"
    }

    static func shorten(_ value: String?, to length: Int = 14) -> String {
        guard let value = value, !value.isEmpty else { return "—" }
        if value.count <= length { return value }
        return String(value.prefix(length)) + "…"
    }

    static func mask(_ value: String?, keep: Int = 4) -> String {
        guard let value = value, !value.isEmpty else { return "—" }
        if value.count <= keep { return value }
        return String(value.prefix(keep)) + String(repeating: "•", count: min(8, value.count - keep))
    }
}

enum Clipboard {
    static func copy(_ text: String) {
        UIPasteboard.general.string = text
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)
    }
}
