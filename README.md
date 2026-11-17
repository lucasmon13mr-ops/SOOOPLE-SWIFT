# 3V API — app iOS (SwiftUI) da ZOLMEA API

App nativo em SwiftUI que reproduz o painel web da **ZOLMEA API** no iPhone e no iPad,
consumindo exatamente a mesma API do backend Node (`/api/*`), com a mesma autenticação
por cookie de sessão.

O IPA é compilado automaticamente pelo **GitHub Actions** (`.github/workflows/build-ipa.yml`),
sem precisar de Mac.

---

## O que o app faz

| Tela | O que faz | Rotas usadas |
| --- | --- | --- |
| Login / 2FA | Entrar com usuário ou e-mail, código de 6 dígitos, configurar o servidor | `POST /api/auth/login`, `POST /api/auth/2fa/verify`, `GET /api/me` |
| Criar conta | Cadastro com código de confirmação | `POST /api/auth/signup/request`, `POST /api/auth/signup/verify` |
| Esqueci a senha | Geração do token e definição da nova senha | `POST /api/auth/password/forgot`, `POST /api/auth/password/reset` |
| Painel | Estatísticas, últimas verificações e atalhos | `GET /api/stats`, `GET /api/check-log` |
| Pacotes | Criar, editar, pausar, banir, excluir, ver token, baixar SDK | `GET/POST /api/packages*`, `GET /api/packages/token`, `GET /api/sdk-files/:id/full/download` |
| Licenças | Listar, filtrar, criar em lote, pausar, banir, resetar aparelho, excluir | `GET /api/licenses`, `POST /api/licenses/*` |
| Aparelhos | Aparelhos vinculados e banimento | `GET /api/devices`, `POST /api/devices/ban` |
| Verificações | Log das validações do SDK | `GET /api/check-log` |
| IPs bloqueados | Criar e remover bloqueios | `GET/POST /api/ip-bans`, `POST /api/ip-bans/delete` |
| Revendedores | Criar, editar, redefinir senha, excluir, pacotes liberados | `GET/POST /api/resellers*` |
| Construtor | Upload do ZIP, compilação no GitHub Actions, download dos artefatos | `GET/POST /api/project-builder*` |
| Auditoria | Histórico de ações (proprietário) | `GET /api/audit` |
| Administração | Usuários, planos e estatísticas (proprietário) | `GET /api/admin/*`, `POST /api/admin/users/plan` |
| Perfil | Alterar e-mail/senha, ativar/desativar 2FA, excluir conta | `GET /api/profile`, `POST /api/profile/change/*`, `POST /api/2fa/*`, `POST /api/auth/delete-account/*` |

O backend não precisou de nenhuma alteração: o app usa o mesmo cookie `connect.sid`
que o site recebe, guardado pelo `HTTPCookieStorage`.

---

## Estrutura do repositório

```
.
├── .github/workflows/build-ipa.yml   # compila e publica o IPA a cada push na main
├── project.yml                       # projeto Xcode gerado pelo XcodeGen
├── ThreeVApp/
│   ├── Info.plist
│   ├── App/                          # entrada do app e navegação em abas
│   ├── Core/                         # APIClient, Store (sessão), configuração, erros, formatadores
│   ├── Models/                       # modelos Codable de todas as entidades da API
│   ├── UI/                           # tema (cores do painel) e componentes
│   ├── Features/
│   │   ├── Login/                    # login, 2FA, cadastro, recuperação de senha
│   │   ├── Dashboard/                # painel
│   │   ├── Packages/                 # lista, detalhe, formulário e SDK
│   │   ├── Licenses/                 # lista, criação em lote
│   │   ├── Devices/                  # aparelhos
│   │   ├── Logs/                     # verificações, IP bans, auditoria
│   │   ├── Resellers/                # revendedores
│   │   ├── Builder/                  # construtor de projetos
│   │   ├── Admin/                    # administração
│   │   ├── Profile/                  # perfil e segurança
│   │   └── More/                     # aba "Mais" e configuração do servidor
│   └── Resources/Assets.xcassets     # ícone, cor de destaque e fundo de launch
└── README.md
```

---

## Como compilar o IPA pelo GitHub

1. Suba este projeto na branch `main` do seu repositório.
2. Abra a aba **Actions** → workflow **Build IPA** → **Run workflow** (ou só dê push).
3. Em ~5 minutos o job termina e o arquivo **`ThreeV-unsigned.ipa`** fica em
   **Artifacts → ThreeV-IPA**.
4. Baixe o IPA e instale com **Sideloadly**, **ESign**, **Scarlet**, **AltStore**
   ou **SideStore** (esses apps assinam o IPA com o seu certificado na hora de instalar).

### Assinatura automática (opcional)

Se quiser que o Actions já entregue o IPA assinado, crie estes três secrets em
**Settings → Secrets and variables → Actions**:

| Secret | Conteúdo |
| --- | --- |
| `P12_BASE64` | seu certificado `.p12` em base64 (`base64 -i cert.p12`) |
| `P12_PASSWORD` | a senha do `.p12` |
| `MOBILEPROVISION_BASE64` | o `.mobileprovision` em base64 |

Com os secrets preenchidos, o workflow gera também o `ThreeV-signed.ipa`
(assinatura de desenvolvimento, com o seu Team ID).

### Testar localmente (quem tem Mac)

```bash
brew install xcodegen
xcodegen generate
open ThreeV.xcodeproj
```

O deployment target é **iOS 16**; a meta do bundle é `com.zolmea.threev`
(troque em `project.yml` se o seu perfil usar outro identificador).

---

## Configurando o servidor no app

O backend precisa estar publicado com URL pública (Railway, Render, VPS…).
Ao abrir o app, toque na **engrenagem** da tela de login e informe, por exemplo:

```
https://zolmea-api-production.up.railway.app
```

Sem barra no final. O endereço fica salvo no aparelho e também pode ser trocado em
**Mais → Servidor**. Para já sair configurado no IPA, edite
`ThreeVApp/Core/AppConfig.swift` (`defaultBaseURL`).

> O `Info.plist` permite HTTP (ATS aberto) para facilitar testes com um backend local
> em `http://192.168.x.x:3000`. Em produção use HTTPS.

---

## Observações

- O 2FA, o cadastro e a recuperação de senha dependem do código de 6 dígitos que o
  backend **imprime no console** nesta versão do servidor (ainda sem envio real de
  e-mail/SMS). O app já está pronto para quando o envio real for ligado.
- A sessão é o mesmo cookie do site: se o backend reiniciar e perder as sessões,
  o app volta para a tela de login automaticamente.
- O construtor de projetos só funciona com `GITHUB_TOKEN`, `GITHUB_REPO` e
  `PUBLIC_BACKEND_URL` configurados no `.env` do backend.

---

© 2026 ZOLMEA API
