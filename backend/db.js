const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'zolmeaapi.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',      -- 'owner' | 'user' | 'reseller'
  plan TEXT NOT NULL DEFAULT 'free',      -- 'free' | 'premium' | 'owner'
  max_packages INTEGER DEFAULT 1,
  max_keys INTEGER DEFAULT 25,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  hmac_secret TEXT NOT NULL,
  telegram_username TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- active | paused | banned
  allow_inject INTEGER NOT NULL DEFAULT 1,
  max_dylibs INTEGER NOT NULL DEFAULT 3,
  max_devices INTEGER NOT NULL DEFAULT 1,
  device_id_mode TEXT DEFAULT 'container',
  latest_version TEXT,
  update_url TEXT,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER NOT NULL,
  license_key TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- active | paused | banned | expired
  max_devices INTEGER NOT NULL DEFAULT 1,
  duration_days INTEGER,
  expires_at TEXT,
  note TEXT,
  reseller_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(package_id) REFERENCES packages(id)
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id INTEGER NOT NULL,
  device_id_hash TEXT NOT NULL,
  device_name_hash TEXT,
  hardware_hash TEXT,
  system_hash TEXT,
  last_os_seen TEXT,
  last_ip_seen TEXT,
  last_seen_at TEXT,
  check_count INTEGER DEFAULT 0,
  ban_override TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(license_id) REFERENCES licenses(id)
);

CREATE TABLE IF NOT EXISTS check_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_token TEXT,
  device_hash TEXT,
  result TEXT,
  detail TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ip_bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  reason TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT,
  action TEXT,
  target_type TEXT,
  target_id INTEGER,
  detail TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// Cria o usuário dono (owner) padrão na primeira execução, se ainda não existir.
const ownerExists = db.prepare(`SELECT id FROM users WHERE role = 'owner' LIMIT 1`).get();
if (!ownerExists) {
  const username = process.env.OWNER_USERNAME || 'admin';
  const password = process.env.OWNER_PASSWORD || 'mudeesta123';
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`INSERT INTO users (username, email, password_hash, role, plan, max_packages, max_keys) VALUES (?, ?, ?, 'owner', 'owner', -1, -1)`)
    .run(username, process.env.OWNER_EMAIL || null, hash);
  console.log(`[setup] Usuário proprietário criado -> usuário: "${username}" senha: "${password}"`);
  console.log('[setup] IMPORTANTE: troque essa senha depois de logar pela primeira vez.');
}

module.exports = db;
