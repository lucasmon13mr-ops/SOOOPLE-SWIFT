import Foundation

/// Cliente HTTP do backend ZOLMEA API.
///
/// A autenticação é a mesma do site: o backend devolve um cookie de sessão
/// (`req.session`) e o `URLSession` o reenvia sozinho em todas as chamadas.
final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder

    private init() {
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieStorage = HTTPCookieStorage.shared
        configuration.httpShouldSetCookies = true
        configuration.httpCookieAcceptPolicy = .always
        configuration.timeoutIntervalForRequest = 40
        configuration.timeoutIntervalForResource = 120
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.waitsForConnectivity = false
        session = URLSession(configuration: configuration)

        decoder = JSONDecoder()
    }

    // MARK: - Verbos de alto nível

    func get<T: Decodable>(_ path: String,
                           query: [URLQueryItem] = [],
                           as type: T.Type = T.self) async throws -> T {
        let data = try await perform(path, method: "GET", query: query, body: nil)
        return try decode(data, as: type)
    }

    func post<T: Decodable>(_ path: String,
                            body: [String: Any]? = nil,
                            query: [URLQueryItem] = [],
                            as type: T.Type = T.self) async throws -> T {
        let data = try await perform(path, method: "POST", query: query, body: body)
        return try decode(data, as: type)
    }

    /// Para rotas que respondem `{ "ok": true }` e não precisamos do corpo.
    func postOK(_ path: String, body: [String: Any]? = nil, query: [URLQueryItem] = []) async throws {
        _ = try await perform(path, method: "POST", query: query, body: body)
    }

    // MARK: - Requisições cruas

    func perform(_ path: String,
                 method: String,
                 query: [URLQueryItem] = [],
                 body: [String: Any]? = nil,
                 headers: [String: String] = [:]) async throws -> Data {
        let request = try makeRequest(path: path, method: method, query: query, body: body, headers: headers)
        let (data, _) = try await send(request)
        return data
    }

    /// Envia o ZIP de um projeto (Content-Type: application/zip).
    func uploadZip(_ path: String, zip: Data, headers: [String: String]) async throws -> Data {
        var request = try makeRequest(path: path, method: "POST", query: [], body: nil, headers: headers)
        request.setValue("application/zip", forHTTPHeaderField: "Content-Type")
        request.httpBody = zip
        let (data, _) = try await send(request)
        return data
    }

    func postUploadZip<T: Decodable>(_ path: String, zip: Data, headers: [String: String], as type: T.Type = T.self) async throws -> T {
        let data = try await uploadZip(path, zip: zip, headers: headers)
        return try decode(data, as: type)
    }

    /// Baixa um arquivo autenticado (artefatos do construtor, SDK em ZIP) para
    /// a pasta Documentos/Downloads do app.
    func download(_ path: String, query: [URLQueryItem] = [], filename: String) async throws -> URL {
        let request = try makeRequest(path: path, method: "GET", query: query, body: nil, headers: [:])
        let (data, _) = try await send(request)
        let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Downloads", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let destination = folder.appendingPathComponent(filename)
        try? FileManager.default.removeItem(at: destination)
        try data.write(to: destination, options: .atomic)
        return destination
    }

    // MARK: - Internos

    private func makeRequest(path: String,
                             method: String,
                             query: [URLQueryItem],
                             body: [String: Any]?,
                             headers: [String: String]) throws -> URLRequest {
        let base = AppConfig.baseURL
        guard !base.isEmpty, var components = URLComponents(string: base + path) else {
            throw APIError.invalidBaseURL
        }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw APIError.invalidBaseURL }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("ThreeV-iOS/\(AppConfig.appVersion)", forHTTPHeaderField: "User-Agent")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }

        if let body = body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        }
        return request
    }

    private func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport(URLError(.badServerResponse))
        }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 {
                NotificationCenter.default.post(name: .threeVSessionExpired, object: nil)
                throw APIError.unauthorized
            }
            let parsed = parseError(data)
            throw APIError.http(status: http.statusCode, code: parsed.code, message: parsed.message)
        }
        return (data, http)
    }

    private func decode<T: Decodable>(_ data: Data, as type: T.Type) throws -> T {
        if data.isEmpty, let empty = EmptyResponse() as? T { return empty }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    private func parseError(_ data: Data) -> (code: String?, message: String?) {
        guard !data.isEmpty,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return (nil, nil)
        }
        let code = object["error"] as? String
        let message = (object["message"] as? String) ?? (object["detail"] as? String)
        return (code, message)
    }
}

/// Resposta vazia, para rotas que devolvem 204 ou corpo vazio.
struct EmptyResponse: Decodable {
    init() {}
    init(from decoder: Decoder) throws {}
}
