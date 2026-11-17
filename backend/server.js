require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Package-ID, X-Bundle-ID, X-Project-Name, X-Original-Filename');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(cookieSession({
  name: 'zolmea_session',
  secret: process.env.SESSION_SECRET || 'troque-este-segredo-em-producao',
  httpOnly: true,
  sameSite: 'none',
  secure: true,
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
}));

// ---------- Auxiliares ----------
function publicUser(u) {
  return {
    id: u.id, username: u.username, email: u.email, role: u.role, plan: u.plan,
    max_packages: u.max_packages, max_keys: u.max_keys
  };
}
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'not_authenticated' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'not_authenticated' });
  req.user = user;
  next();
}
function requireOwner(req, res, next) {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'owner_only' });
  next();
}
function audit(actor, action, targetType, targetId, detail) {
  db.prepare(`INSERT INTO audit_log (actor, action, target_type, target_id, detail) VALUES (?,?,?,?,?)`)
    .run(actor, action, targetType || null, targetId || null, detail || null);
}

function createMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: String(SMTP_PORT || '587') === '465',
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

async function sendOtpEmail(email, code, purpose) {
  const mailer = createMailer();
  if (!mailer) throw new Error('email_not_configured');
  await mailer.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Seu código de verificação ZOLMEA',
    text: `Seu código ZOLMEA para ${purpose} é ${code}. Ele expira em 10 minutos.`,
    html: `<p>Seu código ZOLMEA para <strong>${purpose}</strong> é:</p><p style="font-size:28px;letter-spacing:6px"><strong>${code}</strong></p><p>Ele expira em 10 minutos.</p>`
  });
}

// ======================================================
//  AUTENTICAÇÃO — /api/auth/*
// ======================================================

// LOGIN
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing_credentials' });

  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  // (2FA ficaria aqui: se user.twofa_enabled, devolveria { twofa_required: true, challenge_id, method } em vez de logar direto)

  req.session.userId = user.id;
  audit(user.username, 'login', 'user', user.id, null);
  res.json({ ok: true, user: publicUser(user) });
});

// SESSÃO ATUAL — usado no carregamento da página pra saber se já está logado
app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'not_authenticated' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'not_authenticated' });
  res.json({ user: publicUser(user) });
});

// LOGOUT
app.post('/api/auth/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// CRIAR CONTA (signup) — envia um código de 6 dígitos (impresso no console do servidor
// nesta versão de testes; em produção troque por um envio real de e-mail).
app.post('/api/auth/signup/request', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !password || password.length < 8) return res.status(400).json({ error: 'invalid_signup_data' });
  const exists = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (exists) return res.status(409).json({ error: 'username_in_use' });

  const challengeId = crypto.randomBytes(12).toString('hex');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  pendingChallenges.set(challengeId, { userId: null, code, purpose: 'signup', expires: Date.now() + 10 * 60 * 1000 });
  pendingSignups.set(challengeId, { username, email: email || null, password_hash: bcrypt.hashSync(password, 10) });
  req.session.signupChallengeId = challengeId;
  try {
    await sendOtpEmail(email, code, 'criação de conta');
  } catch (error) {
    pendingChallenges.delete(challengeId);
    pendingSignups.delete(challengeId);
    delete req.session.signupChallengeId;
    const codeName = error.message === 'email_not_configured' ? 'email_not_configured' : 'email_delivery_failed';
    return res.status(503).json({
      error: codeName,
      message: codeName === 'email_not_configured'
        ? 'O envio de e-mail ainda não foi configurado no servidor.'
        : 'Não foi possível enviar o código por e-mail.'
    });
  }
  res.json({ ok: true });
});

// ======================================================
//  PACOTES — /api/packages
// ======================================================
app.get('/api/packages', requireAuth, (req, res) => {
  const rows = req.user.role === 'owner'
    ? db.prepare('SELECT * FROM packages ORDER BY id DESC').all()
    : db.prepare('SELECT * FROM packages WHERE owner_id = ? ORDER BY id DESC').all(req.user.id);
  const packages = rows.map(p => ({
    id: p.id, name: p.name, token_masked: p.token.slice(0, 8) + '••••••••',
    max_devices: p.max_devices, allow_inject: !!p.allow_inject, max_dylibs: p.max_dylibs,
    status: p.status, created_at: p.created_at, telegram_username: p.telegram_username,
    latest_version: p.latest_version, update_url: p.update_url, note: p.note
  }));
  res.json({ packages });
});

app.post('/api/packages', requireAuth, (req, res) => {
  const { name, allow_inject, max_dylibs, telegram_username } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name_required' });
  const token = 'pkg_' + crypto.randomBytes(20).toString('hex');
  const secret = crypto.randomBytes(32).toString('hex');
  const info = db.prepare(`INSERT INTO packages (owner_id, name, token, hmac_secret, allow_inject, max_dylibs, telegram_username) VALUES (?,?,?,?,?,?,?)`)
    .run(req.user.id, name, token, secret, allow_inject ? 1 : 0, max_dylibs ?? 3, telegram_username || null);
  audit(req.user.username, 'package_create', 'package', info.lastInsertRowid, name);
  res.json({ id: info.lastInsertRowid, token, hmac_secret: secret });
});

app.get('/api/packages/token', requireAuth, (req, res) => {
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(req.query.id);
  if (!pkg || (req.user.role !== 'owner' && pkg.owner_id !== req.user.id)) return res.status(404).json({ error: 'not_found' });
  res.json({ token: pkg.token });
});

app.post('/api/packages/toggle', requireAuth, (req, res) => {
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(req.body.id);
  if (!pkg) return res.status(404).json({ error: 'not_found' });
  const next = pkg.status === 'active' ? 'paused' : 'active';
  db.prepare('UPDATE packages SET status = ? WHERE id = ?').run(next, pkg.id);
  res.json({ ok: true, status: next });
});

app.post('/api/packages/update', requireAuth, (req, res) => {
  const b = req.body || {};
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(b.id);
  if (!pkg) return res.status(404).json({ error: 'not_found' });
  db.prepare(`UPDATE packages SET name=?, status=?, allow_inject=?, max_dylibs=?, device_id_mode=?, latest_version=?, update_url=?, note=?, telegram_username=? WHERE id=?`)
    .run(b.name ?? pkg.name, b.status ?? pkg.status, b.allow_inject ? 1 : 0, b.max_dylibs ?? pkg.max_dylibs,
         b.device_id_mode ?? pkg.device_id_mode, b.latest_version ?? null, b.update_url ?? null, b.note ?? null,
         b.telegram_username ?? null, pkg.id);
  res.json({ ok: true });
});

app.post('/api/packages/delete', requireAuth, (req, res) => {
  db.prepare('DELETE FROM licenses WHERE package_id = ?').run(req.body.id);
  db.prepare('DELETE FROM packages WHERE id = ?').run(req.body.id);
  res.json({ ok: true });
});

// ======================================================
//  ESTATÍSTICAS — /api/stats (usado no Painel)
// ======================================================
app.get('/api/stats', requireAuth, (req, res) => {
  const scopePkgIds = req.user.role === 'owner'
    ? db.prepare('SELECT id FROM packages').all().map(p => p.id)
    : db.prepare('SELECT id FROM packages WHERE owner_id = ?').all(req.user.id).map(p => p.id);
  const inClause = scopePkgIds.length ? scopePkgIds.join(',') : '-1';
  const packages = scopePkgIds.length;
  const licenses = db.prepare(`SELECT COUNT(*) c FROM licenses WHERE package_id IN (${inClause})`).get().c;
  const active_licenses = db.prepare(`SELECT COUNT(*) c FROM licenses WHERE package_id IN (${inClause}) AND status='active'`).get().c;
  const devices = db.prepare(`SELECT COUNT(*) c FROM devices WHERE license_id IN (SELECT id FROM licenses WHERE package_id IN (${inClause}))`).get().c;
  res.json({ packages, licenses, active_licenses, devices, checks_24h: 0, failed_24h: 0 });
});

// ======================================================
//  LICENÇAS — /api/licenses (resumido, essencial pra abrir a aba sem erro)
// ======================================================
app.get('/api/licenses', requireAuth, (req, res) => {
  const pkgId = req.query.package_id;
  const resellerId = req.query.reseller_id;
  let rows;
  if (req.user.role === 'reseller') {
    // Revendedor só enxerga as próprias chaves criadas por ele.
    rows = db.prepare(`SELECT l.*, p.name as package_name FROM licenses l JOIN packages p ON p.id=l.package_id WHERE l.reseller_id=?`).all(req.user.id);
  } else if (resellerId) {
    rows = db.prepare(`SELECT l.*, p.name as package_name FROM licenses l JOIN packages p ON p.id=l.package_id WHERE l.reseller_id=?`).all(resellerId);
  } else if (pkgId) {
    rows = db.prepare(`SELECT l.*, p.name as package_name FROM licenses l JOIN packages p ON p.id=l.package_id WHERE l.package_id=?`).all(pkgId);
  } else {
    rows = req.user.role === 'owner'
      ? db.prepare(`SELECT l.*, p.name as package_name FROM licenses l JOIN packages p ON p.id=l.package_id`).all()
      : db.prepare(`SELECT l.*, p.name as package_name FROM licenses l JOIN packages p ON p.id=l.package_id WHERE p.owner_id = ?`).all(req.user.id);
  }
  const licenses = rows.map(l => ({
    id: l.id, package_name: l.package_name, license_key: l.license_key, status: l.status,
    devices_used: db.prepare('SELECT COUNT(*) c FROM devices WHERE license_id=?').get(l.id).c,
    max_devices: l.max_devices, duration_days: l.duration_days, expires_at: l.expires_at, note: l.note
  }));
  res.json({ licenses });
});

function generateLicenseKey() {
  return crypto.randomBytes(10).toString('hex').toUpperCase().slice(0, 16);
}
app.post('/api/licenses/create', requireAuth, (req, res) => {
  const { package_id, count, max_devices, duration_days } = req.body || {};
  let reseller_id = req.body.reseller_id || null;
  const pkg = db.prepare('SELECT * FROM packages WHERE id=?').get(package_id);
  if (!pkg) return res.status(404).json({ error: 'package_not_found' });

  if (req.user.role === 'reseller') {
    reseller_id = req.user.id;
    const assigned = db.prepare('SELECT 1 FROM reseller_packages WHERE reseller_id=? AND package_id=?').get(req.user.id, package_id);
    if (!assigned) return res.status(403).json({ error: 'package_not_assigned' });
    const used = db.prepare('SELECT COUNT(*) c FROM licenses WHERE reseller_id=?').get(req.user.id).c;
    if (used + (count || 1) > req.user.max_keys) return res.status(403).json({ error: 'key_limit_reached' });
  }

  const keys = [];
  const insert = db.prepare(`INSERT INTO licenses (package_id, license_key, max_devices, duration_days, expires_at, reseller_id) VALUES (?,?,?,?,?,?)`);
  const expiresAt = duration_days ? new Date(Date.now() + duration_days * 86400000).toISOString() : null;
  const n = Math.min(500, Math.max(1, count || 1));
  for (let i = 0; i < n; i++) {
    let key;
    do { key = generateLicenseKey(); } while (db.prepare('SELECT id FROM licenses WHERE license_key=?').get(key));
    insert.run(package_id, key, max_devices || 1, duration_days || null, expiresAt, reseller_id);
    keys.push(key);
  }
  res.json({ created: n, keys });
});

app.post('/api/licenses/set-status', requireAuth, (req, res) => {
  db.prepare('UPDATE licenses SET status=? WHERE id=?').run(req.body.status, req.body.id);
  res.json({ ok: true });
});
app.post('/api/licenses/reset-device', requireAuth, (req, res) => {
  if (req.body.license_id) db.prepare('DELETE FROM devices WHERE license_id=?').run(req.body.license_id);
  res.json({ ok: true });
});
app.post('/api/licenses/delete', requireAuth, (req, res) => {
  db.prepare('DELETE FROM devices WHERE license_id=?').run(req.body.id);
  db.prepare('DELETE FROM licenses WHERE id=?').run(req.body.id);
  res.json({ ok: true });
});

// ======================================================
//  DISPOSITIVOS / VERIFICAÇÃO / IP BANS / AUDITORIA — stubs mínimos
// ======================================================
app.get('/api/devices', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT d.*, l.license_key, p.name as package_name FROM devices d JOIN licenses l ON l.id=d.license_id JOIN packages p ON p.id=l.package_id`).all();
  res.json({ devices: rows });
});
app.get('/api/check-log', requireAuth, (req, res) => res.json({ log: db.prepare('SELECT * FROM check_log ORDER BY id DESC LIMIT 200').all() }));
app.get('/api/ip-bans', requireAuth, (req, res) => res.json({ bans: db.prepare('SELECT * FROM ip_bans ORDER BY id DESC').all() }));
app.get('/api/audit', requireAuth, requireOwner, (req, res) => res.json({ log: db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300').all() }));

// ======================================================
//  SDK — /api/sdk/verify (endpoint que o dylib/tweak chama de verdade)
// ======================================================
app.post('/api/sdk/verify', (req, res) => {
  const { token, key, device_id, signature, device_name, hwid, os_info, dylibs } = req.body || {};
  const pkg = db.prepare('SELECT * FROM packages WHERE token=?').get(token);
  if (!pkg) return res.status(404).json({ valid: false, error: 'invalid_token' });
  if (pkg.status !== 'active') return res.status(403).json({ valid: false, error: 'package_' + pkg.status });

  const expected = crypto.createHmac('sha256', pkg.hmac_secret).update(key + '|' + device_id).digest('hex');
  if (expected !== signature) {
    db.prepare('INSERT INTO check_log (package_token, device_hash, result, detail) VALUES (?,?,?,?)').run(token, device_id, 'invalid', 'bad_signature');
    return res.status(401).json({ valid: false, error: 'bad_signature' });
  }

  const lic = db.prepare('SELECT * FROM licenses WHERE license_key=? AND package_id=?').get(key, pkg.id);
  if (!lic) return res.status(404).json({ valid: false, error: 'license_not_found' });
  if (lic.status !== 'active') return res.status(403).json({ valid: false, error: 'license_' + lic.status });
  if (lic.expires_at && new Date(lic.expires_at) < new Date()) return res.status(403).json({ valid: false, error: 'license_expired' });

  if (!pkg.allow_inject && Number(dylibs || 0) > pkg.max_dylibs) {
    db.prepare('INSERT INTO check_log (package_token, device_hash, result, detail) VALUES (?,?,?,?)').run(token, device_id, 'invalid', 'injection_detected');
    return res.status(403).json({ valid: false, error: 'injection_detected' });
  }

  const deviceHash = crypto.createHash('sha256').update(device_id).digest('hex');
  let device = db.prepare('SELECT * FROM devices WHERE license_id=? AND device_id_hash=?').get(lic.id, deviceHash);
  if (!device) {
    const boundCount = db.prepare('SELECT COUNT(*) c FROM devices WHERE license_id=?').get(lic.id).c;
    if (boundCount >= lic.max_devices) {
      db.prepare('INSERT INTO check_log (package_token, device_hash, result, detail) VALUES (?,?,?,?)').run(token, deviceHash, 'invalid', 'device_limit_reached');
      return res.status(403).json({ valid: false, error: 'device_limit_reached' });
    }
    db.prepare(`INSERT INTO devices (license_id, device_id_hash, device_name_hash, hardware_hash, last_os_seen, last_ip_seen, last_seen_at, check_count) VALUES (?,?,?,?,?,?,datetime('now'),1)`)
      .run(lic.id, deviceHash, device_name ? crypto.createHash('sha256').update(device_name).digest('hex') : null,
           hwid ? crypto.createHash('sha256').update(hwid).digest('hex') : null, os_info || null, req.ip);
  } else {
    db.prepare(`UPDATE devices SET last_os_seen=?, last_ip_seen=?, last_seen_at=datetime('now'), check_count=check_count+1 WHERE id=?`)
      .run(os_info || device.last_os_seen, req.ip, device.id);
  }

  db.prepare('INSERT INTO check_log (package_token, device_hash, result, detail) VALUES (?,?,?,?)').run(token, deviceHash, 'valid', null);
  res.json({ valid: true });
});

// ======================================================
//  2FA — versão simplificada (sem envio real de e-mail/Telegram)
//  Em produção troque generateAndLog() por um envio real (Nodemailer / bot do Telegram).
// ======================================================
const pendingChallenges = new Map(); // challenge_id -> { userId, code, purpose, expires }
function generateAndLog(userId, purpose) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const challengeId = crypto.randomBytes(12).toString('hex');
  pendingChallenges.set(challengeId, { userId, code, purpose, expires: Date.now() + 5 * 60 * 1000 });
  console.log(`[2FA/OTP] código para userId=${userId} (${purpose}): ${code}`);
  return challengeId;
}

app.get('/api/2fa/status', requireAuth, (req, res) => {
  res.json({ enabled: !!req.user.twofa_enabled, method: req.user.twofa_method || 'email' });
});
app.post('/api/2fa/setup', requireAuth, (req, res) => {
  const method = req.body.method === 'telegram' ? 'telegram' : 'email';
  const challenge_id = generateAndLog(req.user.id, '2fa_setup:' + method);
  res.json({ challenge_id, delivered: true });
});
app.post('/api/2fa/confirm', requireAuth, (req, res) => {
  const ch = pendingChallenges.get(req.body.challenge_id);
  if (!ch || ch.userId !== req.user.id || ch.code !== String(req.body.code).trim() || Date.now() > ch.expires) {
    return res.status(400).json({ error: 'invalid_or_expired_code' });
  }
  pendingChallenges.delete(req.body.challenge_id);
  const method = ch.purpose.split(':')[1] || 'email';
  db.prepare('UPDATE users SET twofa_enabled=1, twofa_method=? WHERE id=?').run(method, req.user.id);
  const recovery = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));
  res.json({ ok: true, recovery_codes: recovery });
});
app.post('/api/2fa/disable', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET twofa_enabled=0 WHERE id=?').run(req.user.id);
  res.json({ ok: true });
});
app.post('/api/auth/2fa/verify', (req, res) => {
  const ch = pendingChallenges.get(req.body.challenge_id);
  if (!ch || ch.code !== String(req.body.code).trim() || Date.now() > ch.expires) {
    return res.status(400).json({ error: 'invalid_security_code' });
  }
  pendingChallenges.delete(req.body.challenge_id);
  req.session.userId = ch.userId;
  res.json({ ok: true });
});

// Fluxos que dependem de provedor externo (Google/SMS) — desativados nesta versão simplificada.
app.get('/api/auth/pending', (req, res) => res.json({ pending: false }));
app.post('/api/auth/phone/request', (req, res) => res.status(501).json({ error: 'phone_verification_not_configured' }));
app.post('/api/auth/phone/verify', (req, res) => res.status(501).json({ error: 'phone_verification_not_configured' }));

// Verificação de e-mail no cadastro
const pendingSignups = new Map(); // challenge stored inside pendingChallenges too; store draft user here
app.post('/api/auth/signup/verify', (req, res) => {
  const sessionDraftId = req.session.signupChallengeId;
  const ch = pendingChallenges.get(sessionDraftId);
  if (!ch || ch.purpose !== 'signup' || ch.code !== String(req.body.code).trim() || Date.now() > ch.expires) {
    return res.status(400).json({ error: 'signup_session_expired' });
  }
  pendingChallenges.delete(sessionDraftId);
  const draft = pendingSignups.get(sessionDraftId);
  pendingSignups.delete(sessionDraftId);
  if (!draft) return res.status(400).json({ error: 'signup_session_expired' });
  const info = db.prepare(`INSERT INTO users (username, email, password_hash, role, plan, max_packages, max_keys) VALUES (?,?,?,'user','free',1,25)`)
    .run(draft.username, draft.email || null, draft.password_hash);
  req.session.userId = info.lastInsertRowid;
  delete req.session.signupChallengeId;
  audit(draft.username, 'signup', 'user', info.lastInsertRowid, null);
  res.json({ ok: true });
});

// ======================================================
//  SENHA — esqueci / redefinir / excluir conta (versão simplificada, sem e-mail real)
// ======================================================
const passwordResetTokens = new Map(); // token -> { userId, expires }
app.post('/api/auth/password/forgot', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(req.body.email);
  if (user) {
    const token = crypto.randomBytes(20).toString('hex');
    passwordResetTokens.set(token, { userId: user.id, expires: Date.now() + 30 * 60 * 1000 });
    console.log(`[reset-senha] link para ${user.username}: /login.html?mode=login&reset=${token}`);
  }
  // Sempre responde igual, pra não revelar se o e-mail existe ou não.
  res.json({ ok: true, message: 'Se este e-mail existir, um link de redefinição foi enviado (verifique o console do servidor nesta versão de testes).' });
});
app.post('/api/auth/password/reset', (req, res) => {
  const entry = passwordResetTokens.get(req.body.token);
  if (!entry || Date.now() > entry.expires) return res.status(400).json({ error: 'invalid_or_expired_token' });
  if (!req.body.password || req.body.password.length < 8) return res.status(400).json({ error: 'password_too_short' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(req.body.password, 10), entry.userId);
  passwordResetTokens.delete(req.body.token);
  res.json({ ok: true });
});
app.post('/api/auth/delete-account/request', requireAuth, (req, res) => {
  if (!bcrypt.compareSync(req.body.password || '', req.user.password_hash)) return res.status(401).json({ error: 'invalid_password' });
  const challenge_id = generateAndLog(req.user.id, 'delete_account');
  res.json({ ok: true, challenge_id, method: req.user.twofa_method || 'email' });
});
app.post('/api/auth/delete-account/confirm', requireAuth, (req, res) => {
  const ch = pendingChallenges.get(req.body.challenge_id);
  if (!ch || ch.userId !== req.user.id || ch.purpose !== 'delete_account' || ch.code !== String(req.body.code).trim()) {
    return res.status(400).json({ error: 'invalid_or_expired_code' });
  }
  pendingChallenges.delete(req.body.challenge_id);
  db.prepare('DELETE FROM packages WHERE owner_id=?').run(req.user.id);
  db.prepare('DELETE FROM users WHERE id=?').run(req.user.id);
  req.session = null;
  res.json({ ok: true });
});

// ======================================================
//  PERFIL — /api/profile
// ======================================================
app.get('/api/profile', requireAuth, (req, res) => {
  res.json({ user: { ...publicUser(req.user), limits: { max_packages: req.user.max_packages, max_keys: req.user.max_keys } } });
});
app.post('/api/profile/change/request', requireAuth, (req, res) => {
  const { email, password } = req.body || {};
  if (!email && !password) return res.status(400).json({ error: 'nothing_to_change' });
  if (email) {
    const clash = db.prepare('SELECT id FROM users WHERE email=? AND id<>?').get(email, req.user.id);
    if (clash) return res.status(409).json({ error: 'email_in_use' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'invalid_email' });
  }
  if (password && password.length < 8) return res.status(400).json({ error: 'password_too_short' });
  const challenge_id = generateAndLog(req.user.id, 'profile_change');
  pendingSignups.set(challenge_id, { email, password_hash: password ? bcrypt.hashSync(password, 10) : null });
  res.json({ ok: true, challenge_id });
});
app.post('/api/profile/change/confirm', requireAuth, (req, res) => {
  const ch = pendingChallenges.get(req.body.challenge_id);
  if (!ch || ch.userId !== req.user.id || ch.purpose !== 'profile_change' || ch.code !== String(req.body.code).trim() || Date.now() > ch.expires) {
    return res.status(400).json({ error: 'profile_change_expired' });
  }
  const draft = pendingSignups.get(req.body.challenge_id);
  pendingChallenges.delete(req.body.challenge_id);
  pendingSignups.delete(req.body.challenge_id);
  if (draft?.email) db.prepare('UPDATE users SET email=? WHERE id=?').run(draft.email, req.user.id);
  if (draft?.password_hash) db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(draft.password_hash, req.user.id);
  req.session = null;
  res.json({ ok: true });
});

// ======================================================
//  ADMIN — somente proprietário (/api/admin/*  e página /admin)
// ======================================================
app.get('/api/admin/users', requireAuth, requireOwner, (req, res) => {
  const users = db.prepare(`SELECT id, username, email, plan, max_packages, max_keys FROM users WHERE role != 'owner' ORDER BY id DESC`).all();
  res.json({ users });
});
app.post('/api/admin/users/plan', requireAuth, requireOwner, (req, res) => {
  const { user_id, username, email, plan } = req.body || {};
  const user = user_id ? db.prepare('SELECT * FROM users WHERE id=?').get(user_id)
    : db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(username, email);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  const limits = plan === 'premium' ? { max_packages: 10, max_keys: 2500 } : { max_packages: 1, max_keys: 25 };
  db.prepare('UPDATE users SET plan=?, max_packages=?, max_keys=? WHERE id=?').run(plan, limits.max_packages, limits.max_keys, user.id);
  audit(req.user.username, 'plan_change', 'user', user.id, plan);
  res.json({ ok: true });
});
app.get('/api/admin/statistics', requireAuth, requireOwner, (req, res) => {
  const users = db.prepare(`SELECT COUNT(*) c FROM users WHERE role='user'`).get().c;
  const free_users = db.prepare(`SELECT COUNT(*) c FROM users WHERE role='user' AND plan='free'`).get().c;
  const premium_users = db.prepare(`SELECT COUNT(*) c FROM users WHERE role='user' AND plan='premium'`).get().c;
  const packages = db.prepare('SELECT COUNT(*) c FROM packages').get().c;
  const licenses = db.prepare('SELECT COUNT(*) c FROM licenses').get().c;
  const active_licenses = db.prepare(`SELECT COUNT(*) c FROM licenses WHERE status='active'`).get().c;
  const devices = db.prepare('SELECT COUNT(*) c FROM devices').get().c;
  const checks_24h = db.prepare(`SELECT COUNT(*) c FROM check_log WHERE created_at >= datetime('now','-1 day')`).get().c;
  res.json({ users, free_users, premium_users, packages, licenses, active_licenses, devices, checks_24h });
});

// Página /admin — só entra se já estiver logado como owner (checagem client-side abaixo em admin.html)
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// ======================================================
//  DEVICES — banir/desbanir
// ======================================================
app.post('/api/devices/ban', requireAuth, (req, res) => {
  db.prepare('UPDATE devices SET ban_override=? WHERE id=?').run(req.body.ban ? 'banned' : null, req.body.id);
  res.json({ ok: true });
});

// ======================================================
//  IP BANS — criar / remover
// ======================================================
app.post('/api/ip-bans', requireAuth, (req, res) => {
  const { ip, reason, duration_hours } = req.body || {};
  if (!ip) return res.status(400).json({ error: 'ip_required' });
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
  const expires = duration_hours ? new Date(Date.now() + duration_hours * 3600000).toISOString() : null;
  db.prepare('INSERT INTO ip_bans (ip_hash, reason, expires_at) VALUES (?,?,?)').run(ipHash, reason || null, expires);
  res.json({ ok: true });
});
app.post('/api/ip-bans/delete', requireAuth, (req, res) => {
  db.prepare('DELETE FROM ip_bans WHERE id=?').run(req.body.id);
  res.json({ ok: true });
});

// ======================================================
//  REVENDEDORES — /api/resellers/*
// ======================================================
db.exec(`
CREATE TABLE IF NOT EXISTS reseller_packages (
  reseller_id INTEGER NOT NULL,
  package_id INTEGER NOT NULL,
  PRIMARY KEY (reseller_id, package_id)
);
`);
function safeAlter(sql) { try { db.exec(sql); } catch (_) {} }
safeAlter(`ALTER TABLE users ADD COLUMN twofa_enabled INTEGER DEFAULT 0`);
safeAlter(`ALTER TABLE users ADD COLUMN twofa_method TEXT DEFAULT 'email'`);
safeAlter(`ALTER TABLE users ADD COLUMN account_status TEXT DEFAULT 'active'`);
safeAlter(`ALTER TABLE licenses ADD COLUMN reseller_id INTEGER`);

app.post('/api/resellers/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare(`SELECT * FROM users WHERE (username=? OR email=?) AND role='reseller'`).get(username, username);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) return res.status(401).json({ error: 'invalid_credentials' });
  if (user.account_status === 'disabled') return res.status(403).json({ error: 'account_disabled' });
  req.session.userId = user.id;
  res.json({ ok: true, user: publicUser(user) });
});

app.get('/api/resellers', requireAuth, (req, res) => {
  if (req.user.role === 'reseller') return res.status(403).json({ error: 'reseller_parent_only' });
  const resellers = db.prepare(`SELECT * FROM users WHERE role='reseller'`).all().map(r => {
    const packages = db.prepare(`SELECT p.id, p.name, p.status FROM reseller_packages rp JOIN packages p ON p.id=rp.package_id WHERE rp.reseller_id=?`).all(r.id);
    const created_keys = db.prepare(`SELECT COUNT(*) c FROM licenses WHERE reseller_id=?`).get(r.id).c;
    return { id: r.id, username: r.username, email: r.email, max_keys: r.max_keys, account_status: r.account_status, created_keys, packages };
  });
  res.json({ resellers });
});
app.get('/api/resellers/available-packages', requireAuth, (req, res) => {
  const packages = req.user.role === 'owner'
    ? db.prepare('SELECT id, name, status FROM packages').all()
    : db.prepare('SELECT id, name, status FROM packages WHERE owner_id=?').all(req.user.id);
  res.json({ packages });
});
app.post('/api/resellers', requireAuth, (req, res) => {
  if (req.user.role === 'reseller') return res.status(403).json({ error: 'reseller_parent_only' });
  const { username, password, max_keys, package_ids } = req.body || {};
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username || '')) return res.status(400).json({ error: 'invalid_reseller_username' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'invalid_reseller_password' });
  if (!max_keys || max_keys < 1) return res.status(400).json({ error: 'invalid_reseller_quota' });
  if (!Array.isArray(package_ids) || !package_ids.length) return res.status(400).json({ error: 'invalid_reseller_packages' });
  if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) return res.status(409).json({ error: 'username_in_use' });
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`INSERT INTO users (username, password_hash, role, plan, max_packages, max_keys) VALUES (?,?,'reseller','reseller',0,?)`).run(username, hash, max_keys);
  const insertLink = db.prepare('INSERT OR IGNORE INTO reseller_packages (reseller_id, package_id) VALUES (?,?)');
  package_ids.forEach(pid => insertLink.run(info.lastInsertRowid, pid));
  audit(req.user.username, 'reseller_create', 'user', info.lastInsertRowid, username);
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.post('/api/resellers/update', requireAuth, (req, res) => {
  const { id, max_keys, account_status, package_ids } = req.body || {};
  db.prepare('UPDATE users SET max_keys=?, account_status=? WHERE id=?').run(max_keys, account_status, id);
  db.prepare('DELETE FROM reseller_packages WHERE reseller_id=?').run(id);
  const insertLink = db.prepare('INSERT OR IGNORE INTO reseller_packages (reseller_id, package_id) VALUES (?,?)');
  (package_ids || []).forEach(pid => insertLink.run(id, pid));
  res.json({ ok: true });
});
app.post('/api/resellers/reset-password', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(req.body.password, 10), req.body.id);
  res.json({ ok: true });
});
app.post('/api/resellers/delete', requireAuth, (req, res) => {
  db.prepare('DELETE FROM reseller_packages WHERE reseller_id=?').run(req.body.id);
  db.prepare('DELETE FROM users WHERE id=?').run(req.body.id);
  res.json({ ok: true });
});

// ======================================================
//  CONSTRUTOR DE PROJETOS — compilador Theos (/api/project-builder/*)
// ======================================================
const multer = require('multer');
const projectBuilder = require('./project-builder');
const sdkEmbed = require('./sdk-embed');
const uploadZip = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

db.exec(`
CREATE TABLE IF NOT EXISTS project_builds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  package_id INTEGER,
  package_name TEXT,
  bundle_id TEXT,
  project_name TEXT,
  original_filename TEXT,
  zip_path TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',   -- uploaded | queued | building | succeeded | failed
  stage TEXT,
  message TEXT,
  storage_status TEXT,                       -- null | cleaned
  telegram_status TEXT,                      -- not_requested | pending | sent
  github_marker TEXT,
  github_run_id TEXT,
  artifacts_json TEXT DEFAULT '[]',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const DAILY_BUILD_LIMIT_FREE = 5;
const DAILY_BUILD_LIMIT_PREMIUM = 30;
function buildQuota(user) {
  if (user.role === 'owner') return { unlimited: true };
  const limit = user.plan === 'premium' ? DAILY_BUILD_LIMIT_PREMIUM : DAILY_BUILD_LIMIT_FREE;
  const used = db.prepare(`SELECT COUNT(*) c FROM project_builds WHERE owner_id=? AND created_at >= datetime('now','-1 day') AND status IN ('queued','building','succeeded','failed')`).get(user.id).c;
  return { unlimited: false, plan: user.plan, used, limit, remaining: Math.max(0, limit - used) };
}

function serializeBuild(row) {
  return {
    id: row.id, package_id: row.package_id, package_name: row.package_name, bundle_id: row.bundle_id,
    project_name: row.project_name, original_filename: row.original_filename, status: row.status,
    stage: row.stage, message: row.message, storage_status: row.storage_status,
    telegram_status: row.telegram_status, artifacts: JSON.parse(row.artifacts_json || '[]')
  };
}

app.get('/api/project-builder', requireAuth, (req, res) => {
  if (req.user.role === 'reseller') return res.status(403).json({ error: 'not_available_for_reseller' });
  const rows = db.prepare('SELECT * FROM project_builds WHERE owner_id=? ORDER BY id DESC').all(req.user.id);
  res.json({ quota: buildQuota(req.user), builds: rows.map(serializeBuild), github_configured: projectBuilder.githubConfigured() });
});

// Upload do ZIP — vem como corpo bruto (Content-Type: application/zip), não JSON.
app.post('/api/project-builder/upload', express.raw({ type: 'application/zip', limit: '20mb' }), requireAuth, (req, res) => {
  if (req.user.role === 'reseller') return res.status(403).json({ error: 'not_available_for_reseller' });
  const packageId = req.headers['x-package-id'];
  const bundleId = req.headers['x-bundle-id'];
  const projectName = req.headers['x-project-name'] || 'theos-project';
  const originalFilename = req.headers['x-original-filename'] || 'project.zip';
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'empty_zip' });
  if (!packageId || !bundleId) return res.status(400).json({ error: 'missing_package_or_bundle_id' });

  const pkg = db.prepare('SELECT * FROM packages WHERE id=?').get(packageId);
  if (!pkg) return res.status(404).json({ error: 'package_not_found' });
  if (req.user.role !== 'owner' && pkg.owner_id !== req.user.id) return res.status(403).json({ error: 'package_not_owned' });

  // Embute o SDK ZOLMEA (com token/segredo já preenchidos) dentro do ZIP antes de salvar.
  let finalBuffer = req.body;
  let embedInfo = { makefilePatched: false, xmInjected: false, hadMakefile: false };
  try {
    const publicBase = process.env.PUBLIC_BACKEND_URL || 'https://zolmea-api.onrender.com';
    const embedded = sdkEmbed.embedSdkIntoZip(req.body, pkg, publicBase);
    finalBuffer = embedded.buffer;
    embedInfo = embedded;
  } catch (e) {
    // Se o ZIP enviado estiver corrompido ou não for um zip válido, avisa em vez de quebrar o upload.
    return res.status(400).json({ error: 'invalid_zip_file', message: 'O arquivo enviado não é um ZIP válido: ' + String(e.message || e) });
  }

  const fileId = crypto.randomBytes(10).toString('hex');
  const zipPath = path.join(projectBuilder.UPLOADS_DIR, `${fileId}.zip`);
  fs.writeFileSync(zipPath, finalBuffer);

  const sdkMessage = !embedInfo.hadMakefile
    ? 'SDK ZOLMEA adicionado, mas nenhum Makefile foi encontrado no ZIP — confira a estrutura do projeto.'
    : (embedInfo.makefilePatched
      ? 'SDK ZOLMEA embutido e Makefile ajustado automaticamente. Pronto para compilar.'
      : 'SDK ZOLMEA embutido no projeto (ZOLMEA_SDK/). Ajuste o Makefile manualmente — veja COMO_USAR_O_SDK_ZOLMEA.txt dentro do ZIP.');

  const info = db.prepare(`INSERT INTO project_builds (owner_id, package_id, package_name, bundle_id, project_name, original_filename, zip_path, status, stage, message, telegram_status) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(req.user.id, pkg.id, pkg.name, bundleId, projectName, originalFilename, zipPath, 'uploaded', 'sdk embutido', sdkMessage, 'not_requested');
  audit(req.user.username, 'project_upload', 'project_build', info.lastInsertRowid, originalFilename);
  res.json({ ok: true, id: info.lastInsertRowid, sdk_embedded: true, makefile_patched: embedInfo.makefilePatched, message: sdkMessage });
});

// Serve o ZIP temporariamente pro GitHub Actions baixar (URL usada no workflow_dispatch).
app.get('/api/project-builder/:id/source.zip', (req, res) => {
  const row = db.prepare('SELECT * FROM project_builds WHERE id=?').get(req.params.id);
  if (!row || !fs.existsSync(row.zip_path)) return res.status(404).end();
  res.sendFile(row.zip_path);
});

app.post('/api/project-builder/:id/build', requireAuth, async (req, res) => {
  if (req.user.role === 'reseller') return res.status(403).json({ error: 'not_available_for_reseller' });
  const row = db.prepare('SELECT * FROM project_builds WHERE id=? AND owner_id=?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  const quota = buildQuota(req.user);
  if (!quota.unlimited && quota.remaining <= 0) return res.status(429).json({ error: 'daily_build_limit_reached', quota });

  if (!projectBuilder.githubConfigured()) {
    return res.status(503).json({
      error: 'github_actions_not_configured',
      message: 'Configure GITHUB_TOKEN e GITHUB_REPO no .env do backend (veja o README) para habilitar a compilação real.',
      quota
    });
  }

  const marker = crypto.randomBytes(8).toString('hex');
  const publicBase = process.env.PUBLIC_BACKEND_URL || 'https://zolmea-api.onrender.com';
  const downloadUrl = `${publicBase}/api/project-builder/${row.id}/source.zip`;

  try {
    await projectBuilder.triggerBuild({ marker, downloadUrl, bundleId: row.bundle_id, projectName: row.project_name, packageId: row.package_id });
    db.prepare(`UPDATE project_builds SET status='queued', stage='enfileirado', message='Aguardando o GitHub Actions iniciar a execução…', github_marker=? WHERE id=?`).run(marker, row.id);
    res.json({ ok: true, quota: buildQuota(req.user) });
    pollGithubBuild(row.id, marker); // não espera terminar — roda em segundo plano
  } catch (e) {
    db.prepare(`UPDATE project_builds SET status='failed', stage='erro', message=? WHERE id=?`).run(String(e.message || e), row.id);
    res.status(500).json({ error: 'trigger_failed', message: String(e.message || e) });
  }
});

// Consulta periodicamente o GitHub Actions até a execução terminar, então baixa os artefatos.
async function pollGithubBuild(buildId, marker, attempt = 0) {
  if (attempt > 60) { // ~10 minutos (60 x 10s)
    db.prepare(`UPDATE project_builds SET status='failed', message='Tempo limite esperando o GitHub Actions.' WHERE id=?`).run(buildId);
    return;
  }
  await new Promise(r => setTimeout(r, 10000));
  try {
    const run = await projectBuilder.findRunByMarker(marker);
    if (!run) return pollGithubBuild(buildId, marker, attempt + 1);
    db.prepare(`UPDATE project_builds SET github_run_id=?, status='building', stage=? WHERE id=?`).run(String(run.id), run.status, buildId);
    if (run.status !== 'completed') return pollGithubBuild(buildId, marker, attempt + 1);

    if (run.conclusion === 'success') {
      const destDir = path.join(projectBuilder.BUILDS_DIR, String(buildId));
      const artifacts = await projectBuilder.downloadArtifacts(run.id, destDir);
      db.prepare(`UPDATE project_builds SET status='succeeded', stage='completo', message='Construção concluída', artifacts_json=? WHERE id=?`)
        .run(JSON.stringify(artifacts), buildId);
      // Aqui entraria o envio para o Telegram do dono, se configurado (bot token + chat id).
      db.prepare(`UPDATE project_builds SET telegram_status='not_requested' WHERE id=?`).run(buildId);
    } else {
      db.prepare(`UPDATE project_builds SET status='failed', stage='falhou', message='A execução no GitHub Actions falhou. Veja build.log no repositório.' WHERE id=?`).run(buildId);
    }
  } catch (e) {
    db.prepare(`UPDATE project_builds SET status='failed', message=? WHERE id=?`).run(String(e.message || e), buildId);
  }
}

app.get('/api/project-builder/:id/artifacts/:name', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM project_builds WHERE id=? AND owner_id=?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).end();
  const filePath = path.join(projectBuilder.BUILDS_DIR, String(row.id), req.params.name);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.download(filePath);
});

app.post('/api/project-builder/:id/delete', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM project_builds WHERE id=? AND owner_id=?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  try { fs.unlinkSync(row.zip_path); } catch (_) {}
  try { fs.rmSync(path.join(projectBuilder.BUILDS_DIR, String(row.id)), { recursive: true, force: true }); } catch (_) {}
  db.prepare('DELETE FROM project_builds WHERE id=?').run(row.id);
  res.json({ ok: true });
});

// ======================================================
//  ARQUIVOS SDK — /api/sdk-files (gera um ZIP de exemplo com o header + plist do SDK)
// ======================================================
const archiver = require('archiver');
app.get('/api/sdk-files', requireAuth, (req, res) => {
  if (req.user.role === 'reseller') return res.status(403).json({ error: 'sdk_unavailable_for_reseller' });
  const rows = db.prepare('SELECT * FROM packages WHERE owner_id=?').all(req.user.id);
  res.json({ files: rows.map(p => ({ package_id: p.id, package_name: p.name, status: p.status })) });
});
app.get('/api/sdk-files/:packageId/full/download', requireAuth, (req, res) => {
  const pkg = db.prepare('SELECT * FROM packages WHERE id=? AND owner_id=?').get(req.params.packageId, req.user.id);
  if (!pkg) return res.status(404).end();
  const bundleId = String(req.query.bundle_id || '').trim();
  if (!/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)+$/.test(bundleId)) return res.status(400).json({ error: 'invalid_bundle_id' });

  res.attachment(`ZOLMEA_SDK_${pkg.name.replace(/\W+/g, '_')}.zip`);
  res.setHeader('Content-Type', 'application/zip');
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', err => { if (!res.headersSent) res.status(500).json({ error: 'zip_generation_failed' }); else res.end(); });
  archive.pipe(res);

  const header = `// ZOLMEASDK.h — gerado automaticamente para o pacote "${pkg.name}"
// Bundle ID de destino: ${bundleId}
#import <Foundation/Foundation.h>

@interface ZOLMEASDK : NSObject
+ (void)verifyWithLicenseKey:(NSString *)licenseKey completion:(void (^)(BOOL valid, NSString * _Nullable error))completion;
@end
`;
  const impl = `// ZOLMEASDK.m
#import "ZOLMEASDK.h"
#import <CommonCrypto/CommonHMAC.h>
#import <Security/Security.h>

#define ZOLMEA_PACKAGE_TOKEN @"${pkg.token}"
#define ZOLMEA_API_BASE @"https://SEU-BACKEND-AQUI/api"

@implementation ZOLMEASDK

+ (NSString *)deviceInstanceID {
    // ID persistente salvo no Keychain (não muda em reinstalações, ao contrário do identifierForVendor).
    NSString *service = @"${pkg.name.replace(/\W+/g,'_')}.zolmea.deviceid";
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

+ (NSString *)hmacHexOfKey:(NSString *)key deviceId:(NSString *)deviceId secret:(NSString *)secret {
    NSString *msg = [NSString stringWithFormat:@"%@|%@", key, deviceId];
    const char *cKey = secret.UTF8String, *cData = msg.UTF8String;
    unsigned char cHMAC[CC_SHA256_DIGEST_LENGTH];
    CCHmac(kCCHmacAlgSHA256, cKey, strlen(cKey), cData, strlen(cData), cHMAC);
    NSMutableString *out = [NSMutableString string];
    for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) [out appendFormat:@"%02x", cHMAC[i]];
    return out;
}

+ (void)verifyWithLicenseKey:(NSString *)licenseKey completion:(void (^)(BOOL, NSString * _Nullable))completion {
    NSString *deviceId = [self deviceInstanceID];
    // ATENÇÃO: o segredo HMAC não deve ficar hardcoded num binário de produção -
    // idealmente a assinatura é calculada no seu backend, ou ofuscada/protegida no client.
    NSString *secretPlaceholder = @"COLOQUE_O_HMAC_SECRET_DO_PACOTE_AQUI";
    NSString *signature = [self hmacHexOfKey:licenseKey deviceId:deviceId secret:secretPlaceholder];

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
  const readme = `SDK para o pacote "${pkg.name}" — Bundle ID: ${bundleId}

1. Adicione ZOLMEASDK.h e ZOLMEASDK.m ao seu projeto Theos (dentro de ZOLMEA_SDK/).
2. No seu Tweak.xm, chame:
     [ZOLMEASDK verifyWithLicenseKey:@"CHAVE_DIGITADA_PELO_USUARIO" completion:^(BOOL valid, NSString *error) {
         if (!valid) { /* mostrar tela pedindo a chave / bloquear o tweak */ }
     }];
3. Troque "COLOQUE_O_HMAC_SECRET_DO_PACOTE_AQUI" pelo segredo HMAC do seu pacote
   (Painel > Pacotes > Novo Pacote — o segredo só aparece uma vez na criação).
4. Troque ZOLMEA_API_BASE pela URL real do seu backend em produção.

Token do pacote: ${pkg.token}
`;
  archive.append(header, { name: 'ZOLMEA_SDK/ZOLMEASDK.h' });
  archive.append(impl, { name: 'ZOLMEA_SDK/ZOLMEASDK.m' });
  archive.append(readme, { name: 'ZOLMEA_SDK/LEIA-ME.txt' });
  archive.finalize();
});

// ---------- Estático (serve o site traduzido) ----------
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/health', (req, res) => res.status(200).json({ ok: true, service: 'zolmea-api' }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[zolmea-api] rodando em http://localhost:${PORT}`));
