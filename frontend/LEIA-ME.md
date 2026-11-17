# ZOLMEA API — Painel (versão em Português)

## O que foi feito

Todo o front-end foi traduzido para português (pt-BR), mantendo 100% da lógica
original (mesmas funções, mesmos IDs, mesmos fluxos). Isso inclui todas as
abas mostradas no vídeo:

- Painel
- Pacotes
- Arquivos SDK
- **Construtor de Projetos (compilador Theos)**
- Licenças
- Dispositivos
- Verificar registro
- Proibições de IP
- Registro de auditoria
- Todos os Usuários / Estatísticas (somente proprietário)
- Revendedores + Portal do Revendedor (login e dashboard)

Textos técnicos que fazem parte do **contrato da API** (nomes de campos JSON
como `token`, `key`, `device_id`, `signature`, `hwid`, `dylibs`, cabeçalhos
HTTP como `X-Package-ID`, `X-Bundle-ID` etc.) foram mantidos **exatamente
como estavam**, em inglês — são identificadores técnicos usados pelo SDK
dentro dos seus apps/tweaks iOS, e traduzi-los quebraria a integração.

## Duas coisas que eu consertei/completei (o projeto original tinha lacunas)

1. **`reseller-dashboard.html` não existia no ZIP** — o `reseller.js`
   original já redirecionava para esse arquivo depois do login de
   revendedor, mas ele nunca foi incluído. Eu recriei essa página do zero,
   em português, seguindo exatamente a estrutura de IDs que o `reseller.js`
   espera (estatísticas, pacotes atribuídos, licenças, conta).

2. **Arquivos de áudio (`/audio/click.wav`, `/audio/success.mp3`,
   `/audio/welcome.mp3`)** são referenciados pelo `app.js`/`reseller.js`
   mas também não vieram no ZIP original. O site funciona normalmente sem
   eles (o navegador só ignora o erro de áudio), mas se você tiver esses
   arquivos, é só colocá-los numa pasta `/audio` na raiz do projeto.

## IMPORTANTE — Backend não está incluído

Este ZIP é **só o frontend** (HTML/CSS/JS estático). O sistema de API keys em
si (banco de dados de pacotes, licenças, dispositivos, verificação HMAC,
compilação real dos projetos Theos) roda em um **servidor backend separado**
— o mesmo que hoje atende em `api.zolmeaapi.shop`. Esse backend não estava no
arquivo ZIP que você me mandou.

Todo o site chama caminhos relativos, tipo:
```
/api/auth/login
/api/packages
/api/project-builder/upload
```

### Para funcionar na Netlify

Abri o arquivo `netlify.toml` e troquei os redirecionamentos de `/api/*` e
`/audio/*` para apontar pro endereço real do seu backend. **Você precisa
editar esse arquivo** e colocar a URL verdadeira onde está escrito
`SEU-BACKEND-AQUI.exemplo.com` — por exemplo, se seu backend continuar
rodando em `api.zolmeaapi.shop`, ou se você subir ele em Railway/Render/VPS.

Sem esse ajuste, o site abre normalmente (visual 100% igual ao vídeo), mas
login, pacotes, compilador Theos etc. vão dar erro de rede, porque a Netlify
não tem onde entregar as chamadas `/api/*` — ela só serve arquivos estáticos.

### Para funcionar em apps/projetos iOS (SDK)

O endpoint `POST /api/sdk/verify` e os arquivos gerados em **Arquivos SDK**
continuam exatamente com o mesmo contrato técnico (token, key, device_id,
signature HMAC etc.), então qualquer client Objective-C++/Theos que já
integrava com a versão em inglês continua funcionando sem nenhuma mudança —
só muda o texto que o **humano** vê no painel administrativo.

## Estrutura de arquivos

```
index.html              → página inicial (landing page)
login.html               → painel principal (login + dashboard completo)
reseller-login.html      → login do portal de revendedores
reseller-dashboard.html  → dashboard do revendedor (recriado)
app.js                   → lógica do painel principal
reseller.js              → lógica do portal de revendedores
app.css / landing.css / reseller.css → estilos (sem alteração, sem texto)
netlify.toml              → configuração de deploy + proxy da API
```
