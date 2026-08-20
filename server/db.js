import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT_DIR, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'esfiharia.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    icon       TEXT    NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL DEFAULT 0,
    unit        TEXT    NOT NULL DEFAULT 'unidade',
    image       TEXT    NOT NULL DEFAULT '',
    available   INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    name          TEXT    NOT NULL DEFAULT '',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires  ON sessions(expires_at);
`);

/* ---------------------------------------------------------------- settings */

export const DEFAULT_SETTINGS = {
  store_name: 'Esfiharia Jataí',
  tagline: 'Esfihas na hora, feitas com massa artesanal',
  whatsapp: '5515997365401',
  address: 'Jataí',
  // Horário de funcionamento: 0 = domingo ... 6 = sábado
  hours: JSON.stringify({
    0: { open: '18:00', close: '22:30', closed: false },
    1: { open: '18:00', close: '22:30', closed: true },
    2: { open: '18:00', close: '22:30', closed: false },
    3: { open: '18:00', close: '22:30', closed: false },
    4: { open: '18:00', close: '22:30', closed: false },
    5: { open: '18:00', close: '23:30', closed: false },
    6: { open: '18:00', close: '23:30', closed: false },
  }),
  slot_minutes: '15',      // intervalo entre horários de retirada
  lead_minutes: '30',      // tempo mínimo de preparo antes da retirada
  max_days_ahead: '7',     // até quantos dias à frente dá para agendar
  min_order_cents: '0',    // pedido mínimo (0 = sem mínimo)
  notice: '',              // aviso exibido no topo do site (opcional)
};

const readSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const writeSetting = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
  if (!readSetting.get(key)) writeSetting.run(key, value);
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) out[key] = value;
  return {
    ...out,
    hours: safeParse(out.hours, JSON.parse(DEFAULT_SETTINGS.hours)),
    slot_minutes: Number(out.slot_minutes) || 15,
    lead_minutes: Number(out.lead_minutes) || 30,
    max_days_ahead: Number(out.max_days_ahead) || 7,
    min_order_cents: Number(out.min_order_cents) || 0,
  };
}

export function saveSettings(patch) {
  const tx = db.transaction((entries) => {
    for (const [key, value] of entries) {
      if (!(key in DEFAULT_SETTINGS)) continue;
      writeSetting.run(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  });
  tx(Object.entries(patch));
  return getSettings();
}

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
