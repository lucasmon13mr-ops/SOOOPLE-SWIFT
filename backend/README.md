# ZOLMEA API — Backend (Node.js + Express + SQLite)

Este é o servidor que faz o site funcionar de verdade: login, pacotes,
licenças, dispositivos, verificação do SDK, revendedores, e o compilador
Theos (Construtor de Projetos). Testei todos os fluxos abaixo rodando
localmente antes de te entregar — login, criar pacote, criar licença e a
verificação HMAC do SDK (`/api/sdk/verify`) responderam certinho.

## 1. Rodando localmente (dentro do Codespace ou na sua máquina)

```bash
cd backend
npm install
cp .env.example .env
# edite o .env e troque OWNER_PASSWORD por uma senha sua
npm start
```

Na primeira execução, o servidor cria automaticamente o usuário **proprietário**
(owner) com o usuário/senha que você definiu no `.env` (padrão: `admin` /
o que você colocar em `OWNER_PASSWORD`). Isso aparece no terminal:

```
[setup] Usuário proprietário criado -> usuário: "admin" senha: "..."
```

Abra `http://localhost:3000/login.html` — o site inteiro (traduzido) é servido
pelo próprio backend nessa mesma porta, então **não precisa mexer no
`netlify.toml`** enquanto estiver testando localmente.

### Área de administração

Acesse `http://localhost:3000/admin` — só funciona logado como proprietário.
Lá dá pra promover usuários pra Premium e ver as estatísticas gerais da
plataforma, sem precisar entrar pelo painel completo.

## 2. Estrutura

```
backend/
  server.js         -> todas as rotas da API
  db.js             -> banco SQLite (schema + criação do owner)
  project-builder.js-> integração com GitHub Actions (compilador Theos)
  admin.html         -> página /admin
  github-workflow-theos-build.yml -> workflow pra copiar no seu repo de build
  .env.example
```

O banco (`zolmeaapi.db`) é criado sozinho na primeira execução — é um arquivo
SQLite, não precisa instalar MySQL/Postgres pra testar. Pra produção com mais
carga, dá pra trocar por Postgres depois, mas pra maioria dos casos de uso
(um dono + poucos revendedores) o SQLite aguenta numa boa.

## 3. Compilador Theos (Construtor de Projetos) — como ativar de verdade

Sem essa configuração, o botão **Compilar** aparece mas retorna erro
"github_actions_not_configured" — o restante do site funciona normal.

Passo a passo:

1. Crie um repositório novo no GitHub (ex: `seu-usuario/theos-builder`).
2. Copie o arquivo `github-workflow-theos-build.yml` deste projeto para
   `.github/workflows/theos-build.yml` dentro desse repositório novo, e dê push.
3. Gere um **Personal Access Token** no GitHub com escopo `repo` + `workflow`
   (Settings → Developer settings → Personal access tokens → Tokens (classic)).
4. No `.env` do backend, preencha:
   ```
   GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
   GITHUB_REPO=seu-usuario/theos-builder
   GITHUB_BRANCH=main
   PUBLIC_BACKEND_URL=https://seu-backend-publico.com
   ```
   O `PUBLIC_BACKEND_URL` **precisa ser uma URL pública de verdade** (o GitHub
   Actions roda na nuvem do GitHub e precisa conseguir baixar o ZIP do seu
   projeto por essa URL). `localhost` não funciona aqui — se estiver testando
   local, use algo como [ngrok](https://ngrok.com) pra expor sua porta 3000
   temporariamente, ou já suba o backend num servidor público (seção 4).
5. Pronto: ao clicar em **Compilar** no site, o backend dispara o workflow,
   fica de olho no andamento (`queued` → `building` → `succeeded`/`failed`),
   baixa o `.deb`/`.dylib` gerado, e libera os botões de download na tabela.

Isso é essencialmente automatizar o que você já fazia manualmente com Theos —
só que ao invés de deixar um Codespace ligado esperando comando, o GitHub
Actions sobe uma máquina, compila, entrega o resultado, e desliga sozinha.
Fica mais barato e mais confiável que manter uma sessão SSH aberta.

## 4. Colocando no ar (fora do Codespace)

O Codespace é ótimo pra desenvolver, mas ele desliga sozinho depois de um
tempo parado — não serve pra manter o backend rodando 24h. Pra produção,
suba esse `backend/` (a pasta inteira) em algum lugar que já é sua praia:

- **Railway** (você já usa) — cria um projeto Node, aponta pra essa pasta,
  configura as variáveis do `.env` no painel do Railway, `npm start`.
- **Render** — mesma ideia, "Web Service" Node.js.
- VPS qualquer com PM2 (`pm2 start server.js --name zolmea-api`).

Depois de subir, pega a URL pública que a plataforma te der (tipo
`https://zolmea-api-production.up.railway.app`) e:

1. Coloca ela em `PUBLIC_BACKEND_URL` no `.env` do próprio backend.
2. Coloca ela no `netlify.toml` do **frontend** (o outro ZIP que te mandei),
   trocando `SEU-BACKEND-AQUI.exemplo.com` por essa URL — assim o site
   hospedado na Netlify consegue falar com esse backend via `/api/*`.

## 5. O que já está pronto vs. o que ainda é simplificado

✅ Funcionando de verdade e testado: login/logout, sessão por cookie, criar
conta, pacotes (criar/editar/pausar/banir/excluir), licenças (criar em lote,
pausar/banir/reativar/excluir), verificação SDK com HMAC-SHA256 (o endpoint
que o dylib chama), dispositivos, IP bans, auditoria, revendedores (CRUD
completo + login separado + limite de chaves), área `/admin`, estatísticas,
upgrade de plano, compilador Theos via GitHub Actions (com o workflow incluso).

⚠️ Simplificado nesta entrega (funciona, mas sem envio real de e-mail/SMS):
- 2FA, redefinição de senha e verificação de cadastro geram um código de
  6 dígitos que aparece **no console do servidor** (`console.log`) em vez de
  ir por e-mail de verdade. Pra produção, troque a função `generateAndLog()`
  em `server.js` por um envio real (ex: Nodemailer + SMTP, ou SendGrid).
- Notificação de build concluído pro Telegram do dono: o campo
  `telegram_status` existe e aparece no site, mas o envio real da mensagem
  não está implementado — dá pra plugar ali usando a mesma lógica do seu
  bot `@Zolmea`/`@kalicompile` que você já tem pronta.
- Login via Google + verificação por SMS (o fluxo de telefone que aparecia
  no `login.html`) está desativado — retorna erro `501` porque depende de
  um provedor externo (Google OAuth + Twilio/serviço de SMS) que não veio
  especificado.

Nada disso quebra o uso principal do sistema (gerenciar licenças e proteger
seus apps/tweaks iOS) — são só os canais de notificação por e-mail/SMS/Telegram
que precisam de uma credencial de um provedor externo pra ligar de vez.
