import Foundation

extension Notification.Name {
    /// Emitida quando a API responde 401 (sessão expirada).
    static let threeVSessionExpired = Notification.Name("threev.sessionExpired")
}

enum APIError: LocalizedError {
    case invalidBaseURL
    case transport(Error)
    case unauthorized
    case http(status: Int, code: String?, message: String?)
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            return "Endereço do servidor inválido. Exemplo: https://seu-backend.up.railway.app"
        case .transport(let error):
            if (error as NSError).code == NSURLErrorNotConnectedToInternet {
                return "Sem conexão com a internet."
            }
            if (error as NSError).code == NSURLErrorTimedOut {
                return "O servidor demorou para responder. Tente novamente."
            }
            return "Não foi possível falar com o servidor: \(error.localizedDescription)"
        case .unauthorized:
            return "Sessão expirada. Entre novamente."
        case .http(let status, let code, let message):
            if let message = message, !message.isEmpty { return message }
            if let code = code, let friendly = APIError.friendly(code) { return friendly }
            return "O servidor respondeu com erro \(status)."
        case .decoding:
            return "Resposta inesperada do servidor. Confira se o endereço aponta para o backend da ZOLMEA API."
        }
    }

    /// Tradução dos códigos de erro usados pelo backend (server.js).
    static func friendly(_ code: String) -> String? {
        switch code {
        case "not_authenticated": return "Sessão expirada. Entre novamente."
        case "invalid_credentials": return "Usuário ou senha incorretos."
        case "invalid_signup_data": return "Preencha usuário, e-mail e uma senha com pelo menos 8 caracteres."
        case "username_in_use": return "Esse usuário ou e-mail já está em uso."
        case "invalid_code", "invalid_otp": return "Código inválido ou expirado."
        case "package_not_found": return "Pacote não encontrado."
        case "not_found": return "Registro não encontrado."
        case "package_not_owned": return "Esse pacote não pertence à sua conta."
        case "key_limit_reached": return "Você atingiu o limite de chaves do seu plano."
        case "package_not_assigned": return "Esse pacote não foi liberado para o seu revendedor."
        case "reseller_parent_only": return "Apenas o dono da conta pode gerenciar revendedores."
        case "sdk_unavailable_for_reseller": return "O SDK não está disponível para revendedores."
        case "not_available_for_reseller": return "O Construtor de Projetos não está disponível para revendedores."
        case "github_actions_not_configured": return "O compilador não está configurado no backend (GITHUB_TOKEN e GITHUB_REPO no .env)."
        case "build_limit_reached": return "Você atingiu o limite diário de compilações."
        case "missing_package_or_bundle_id": return "Escolha um pacote e informe o Bundle ID."
        case "invalid_bundle_id": return "Bundle ID inválido. Exemplo: com.empresa.app"
        case "invalid_zip_file", "empty_zip": return "O arquivo enviado não é um ZIP válido."
        case "upload_missing_id": return "O servidor recebeu o projeto, mas não retornou o identificador da compilação."
        case "trigger_failed": return "Não foi possível iniciar a compilação no GitHub Actions."
        case "user_not_found": return "Usuário não encontrado."
        case "phone_verification_not_configured": return "Verificação por SMS não está configurada no backend."
        case "invalid_reseller_username": return "Usuário do revendedor inválido (3 a 32 caracteres: letras, números, ponto, hífen ou _)."
        case "invalid_reseller_password": return "A senha do revendedor precisa ter pelo menos 8 caracteres."
        case "invalid_reseller_quota": return "Informe um limite de chaves válido."
        case "invalid_reseller_packages": return "Selecione ao menos um pacote para o revendedor."
        case "wrong_password", "invalid_password": return "Senha atual incorreta."
        case "2fa_required": return "Informe o código de verificação em duas etapas."
        default: return nil
        }
    }
}
