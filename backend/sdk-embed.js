// sdk-embed.js
// Pega o ZIP do projeto Theos enviado pelo usuário, injeta os arquivos do SDK
// (ZOLMEASDK.h / .m, já com o token e o segredo HMAC do pacote preenchidos —
// nada de placeholder pra colar manualmente) dentro de ZOLMEA_SDK/, e tenta
// ajustar automaticamente o Makefile pra compilar esses arquivos junto.

const AdmZip = require('adm-zip');

function buildSdkHeader() {
  return `// ZOLMEASDK.h — gerado automaticamente pelo Construtor de Projetos
#import <Foundation/Foundation.h>

@interface ZOLMEASDK : NSObject
+ (void)verifyWithLicenseKey:(NSString *)licenseKey completion:(void (^)(BOOL valid, NSString * _Nullable error))completion;
@end
`;
}

function buildSdkImpl(pkg, apiBase) {
  return `// ZOLMEASDK.m — gerado automaticamente pelo Construtor de Projetos
// Pacote: ${pkg.name} (id ${pkg.id}) — token e segredo já preenchidos, não precisa colar nada manualmente.
#import "ZOLMEASDK.h"
#import <CommonCrypto/CommonHMAC.h>
#import <Security/Security.h>

#define ZOLMEA_PACKAGE_TOKEN @"${pkg.token}"
#define ZOLMEA_HMAC_SECRET @"${pkg.hmac_secret}"
#define ZOLMEA_API_BASE @"${apiBase}/api"

@implementation ZOLMEASDK

+ (NSString *)deviceInstanceID {
    NSString *service = @"${pkg.name.replace(/\W+/g, '_')}.zolmea.deviceid";
    NSDictionary *query = @{ (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
                              (__bridge id)kSecAttrService: service,
                              (__bridge id)kSecReturnData: @YES };
    CFTypeRef result = NULL;
    if (SecItemCopyMatching((__bridge CFDictionaryRef)query, &result) == errSecSuccess) {
        return [[NSString alloc] initWithData:(__bridge_transfer NSData *)result encoding:NSUTF8StringEncoding];
    }
    NSString *newId = [[NSUUID UUID] UUIDString];
    NSDictionary *add = @{ (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
                            (__bridge id)kSecAttrService: service,
                            (__bridge id)kSecValueData: [newId dataUsingEncoding:NSUTF8StringEncoding] };
    SecItemAdd((__bridge CFDictionaryRef)add, NULL);
    return newId;
}

+ (NSString *)hmacHexOfKey:(NSString *)key deviceId:(NSString *)deviceId {
    NSString *msg = [NSString stringWithFormat:@"%@|%@", key, deviceId];
    const char *cKey = ZOLMEA_HMAC_SECRET.UTF8String, *cData = msg.UTF8String;
    unsigned char cHMAC[CC_SHA256_DIGEST_LENGTH];
    CCHmac(kCCHmacAlgSHA256, cKey, strlen(cKey), cData, strlen(cData), cHMAC);
    NSMutableString *out = [NSMutableString string];
    for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) [out appendFormat:@"%02x", cHMAC[i]];
    return out;
}

+ (void)verifyWithLicenseKey:(NSString *)licenseKey completion:(void (^)(BOOL, NSString * _Nullable))completion {
    NSString *deviceId = [self deviceInstanceID];
    NSString *signature = [self hmacHexOfKey:licenseKey deviceId:deviceId];

    NSURL *url = [NSURL URLWithString:[ZOLMEA_API_BASE stringByAppendingString:@"/sdk/verify"]];
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
    req.HTTPMethod = @"POST";
    [req setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    NSDictionary *body = @{ @"token": ZOLMEA_PACKAGE_TOKEN, @"key": licenseKey, @"device_id": deviceId,
                             @"signature": signature, @"device_name": [[UIDevice currentDevice] name] ?: @"iOS",
                             @"os_info": [[UIDevice currentDevice] systemVersion] ?: @"" };
    req.HTTPBody = [NSJSONSerialization dataWithJSONObject:body options:0 error:nil];

    [[[NSURLSession sharedSession] dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *resp, NSError *err) {
        if (err || !data) { dispatch_async(dispatch_get_main_queue(), ^{ completion(NO, err.localizedDescription); }); return; }
        NSDictionary *json = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        BOOL valid = [json[@"valid"] boolValue];
        dispatch_async(dispatch_get_main_queue(), ^{ completion(valid, json[@"error"]); });
    }] resume];
}

@end
`;
}

// Tenta injetar a chamada de verificação automaticamente no primeiro arquivo .xm encontrado
// (dentro de um %ctor do Logos), se ainda não houver nenhuma chamada a ZOLMEASDK.
function tryAutoCallVerify(xmContent) {
  if (xmContent.includes('ZOLMEASDK')) return { content: xmContent, injected: false };
  const call = `\n%ctor {\n    %init;\n    [ZOLMEASDK verifyWithLicenseKey:@"COLE_A_CHAVE_DO_USUARIO_AQUI" completion:^(BOOL valid, NSString *error) {\n        if (!valid) {\n            // TODO: bloquear o tweak / mostrar tela pedindo a chave aqui.\n            NSLog(@"[ZOLMEA] licenca invalida: %@", error);\n        }\n    }];\n}\n`;
  return { content: xmContent + '\n' + call, injected: true };
}

// Ajusta o Makefile pra incluir os arquivos do SDK na compilação, sem apagar nada que já existia.
function patchMakefile(makefileContent) {
  let content = makefileContent;
  let patched = false;

  // Adiciona o .m do SDK na lista de _FILES do primeiro alvo encontrado (TWEAK_NAME, TOOL_NAME, LIBRARY_NAME etc.)
  const filesLineRegex = /^([A-Za-z0-9_]+)_FILES\s*=\s*(.+)$/m;
  const match = content.match(filesLineRegex);
  if (match && !content.includes('ZOLMEA_SDK/ZOLMEASDK.m')) {
    content = content.replace(filesLineRegex, `${match[1]}_FILES = ${match[2].trim()} ZOLMEA_SDK/ZOLMEASDK.m`);
    patched = true;
  }

  // Garante as flags necessárias (ARC + framework Security) sem duplicar se já existirem.
  const cflagsLineRegex = /^([A-Za-z0-9_]+)_CFLAGS\s*=\s*(.+)$/m;
  const cflagsMatch = content.match(cflagsLineRegex);
  const neededFlags = '-fobjc-arc -IZOLMEA_SDK';
  if (cflagsMatch) {
    if (!cflagsMatch[2].includes('ZOLMEA_SDK')) {
      content = content.replace(cflagsLineRegex, `${cflagsMatch[1]}_CFLAGS = ${cflagsMatch[2].trim()} ${neededFlags}`);
      patched = true;
    }
  } else if (match) {
    content = content.replace(filesLineRegex, m => `${m}\n${match[1]}_CFLAGS = ${neededFlags}`);
    patched = true;
  }

  const frameworksLineRegex = /^([A-Za-z0-9_]+)_FRAMEWORKS\s*=\s*(.+)$/m;
  const fwMatch = content.match(frameworksLineRegex);
  if (fwMatch) {
    if (!fwMatch[2].includes('Security')) {
      content = content.replace(frameworksLineRegex, `${fwMatch[1]}_FRAMEWORKS = ${fwMatch[2].trim()} Security`);
      patched = true;
    }
  } else if (match) {
    content = content.replace(filesLineRegex, m => `${m}\n${match[1]}_FRAMEWORKS = Security`);
    patched = true;
  }

  return { content, patched };
}

/**
 * Recebe o buffer do ZIP original, o registro do pacote (com token/hmac_secret) e a URL base da API.
 * Retorna { buffer, sdkFolder, makefilePatched, xmInjected, entriesCount }
 */
function embedSdkIntoZip(zipBuffer, pkg, apiBase) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  // Descobre o prefixo comum (caso o ZIP tenha uma pasta-raiz única, ex: "meu-projeto/Makefile")
  let rootPrefix = '';
  const makefileEntry = entries.find(e => /(^|\/)Makefile$/i.test(e.entryName) && !e.isDirectory);
  if (makefileEntry) {
    const idx = makefileEntry.entryName.toLowerCase().lastIndexOf('makefile');
    rootPrefix = makefileEntry.entryName.slice(0, idx);
  }

  const sdkFolder = `${rootPrefix}ZOLMEA_SDK/`;
  zip.addFile(sdkFolder + 'ZOLMEASDK.h', Buffer.from(buildSdkHeader(), 'utf8'));
  zip.addFile(sdkFolder + 'ZOLMEASDK.m', Buffer.from(buildSdkImpl(pkg, apiBase), 'utf8'));

  let makefilePatched = false;
  if (makefileEntry) {
    const original = makefileEntry.getData().toString('utf8');
    const { content, patched } = patchMakefile(original);
    if (patched) {
      zip.updateFile(makefileEntry.entryName, Buffer.from(content, 'utf8'));
      makefilePatched = true;
    }
  }

  // Tenta injetar a chamada de verificação no primeiro .xm/.x encontrado (best-effort).
  let xmInjected = false;
  const xmEntry = entries.find(e => /\.(xm|x)$/i.test(e.entryName) && !e.isDirectory);
  if (xmEntry) {
    const original = xmEntry.getData().toString('utf8');
    const { content, injected } = tryAutoCallVerify(original);
    if (injected) {
      zip.updateFile(xmEntry.entryName, Buffer.from(content, 'utf8'));
      xmInjected = true;
    }
  }

  const guideName = rootPrefix + 'COMO_USAR_O_SDK_ZOLMEA.txt';
  const guide = `SDK ZOLMEA embutido automaticamente neste projeto.

Pacote: ${pkg.name}
Token e segredo HMAC já estão preenchidos dentro de ZOLMEA_SDK/ZOLMEASDK.m — não precisa colar nada.

${makefilePatched ? '✔ O Makefile foi ajustado automaticamente pra compilar o SDK junto.' : '⚠ Não consegui ajustar o Makefile automaticamente (estrutura não reconhecida) — adicione manualmente "ZOLMEA_SDK/ZOLMEASDK.m" na linha *_FILES do seu Makefile.'}
${xmInjected ? '✔ Uma chamada de exemplo a [ZOLMEASDK verifyWithLicenseKey:...] foi adicionada no seu arquivo .xm — troque "COLE_A_CHAVE_DO_USUARIO_AQUI" pela forma como seu tweak coleta a chave do usuário.' : '⚠ Não adicionei a chamada automaticamente — chame manualmente:\n\n[ZOLMEASDK verifyWithLicenseKey:@"CHAVE_DO_USUARIO" completion:^(BOOL valid, NSString *error) {\n    if (!valid) { /* bloquear o tweak */ }\n}];'}

Troque ZOLMEA_API_BASE em ZOLMEASDK.m pela URL pública real do seu backend em produção (hoje está apontando para: ${apiBase}/api).
`;
  zip.addFile(guideName, Buffer.from(guide, 'utf8'));

  return {
    buffer: zip.toBuffer(),
    sdkFolder,
    makefilePatched,
    xmInjected,
    hadMakefile: !!makefileEntry,
    entriesCount: entries.length
  };
}

module.exports = { embedSdkIntoZip };
