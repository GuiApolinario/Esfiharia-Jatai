import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

const COOKIE_NAME = 'esf_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 horas

const insertSession = db.prepare(
  'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
);
const findSession = db.prepare(`
  SELECT s.token, s.expires_at, u.id AS user_id, u.username, u.name
  FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token = ?
`);
const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');
const purgeExpired = db.prepare('DELETE FROM sessions WHERE expires_at < ?');

/** Cria o admin padrão na primeira execução e devolve a senha gerada (ou null). */
export function ensureAdminUser() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return null;

  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  db.prepare('INSERT INTO users (username, password_hash, name) VALUES (?, ?, ?)').run(
    username,
    bcrypt.hashSync(password, 10),
    'Administrador'
  );
  return { username, password, generated: !process.env.ADMIN_PASSWORD };
}

export function login(username, password) {
  const user = db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(String(username || '').trim().toLowerCase());
  if (!user) return null;
  if (!bcrypt.compareSync(String(password || ''), user.password_hash)) return null;

  purgeExpired.run(Date.now());
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  insertSession.run(token, user.id, now, now + SESSION_TTL_MS);
  return { token, user: { id: user.id, username: user.username, name: user.name } };
}

export function logout(token) {
  if (token) deleteSession.run(token);
}

export function changePassword(userId, currentPassword, newPassword) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { ok: false, error: 'Usuário não encontrado.' };
  if (!bcrypt.compareSync(String(currentPassword || ''), user.password_hash)) {
    return { ok: false, error: 'A senha atual está incorreta.' };
  }
  if (String(newPassword || '').length < 6) {
    return { ok: false, error: 'A nova senha precisa ter pelo menos 6 caracteres.' };
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    bcrypt.hashSync(String(newPassword), 10),
    userId
  );
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  return { ok: true };
}

/* Em HTTPS o cookie deve ser "secure". Como alguns servidores rodam atrás de proxy,
   dá para forçar o comportamento com SECURE_COOKIES=true|false. */
const useSecureCookies = process.env.SECURE_COOKIES
  ? process.env.SECURE_COOKIES === 'true'
  : process.env.NODE_ENV === 'production';

export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: useSecureCookies,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function readSessionToken(req) {
  return req.cookies?.[COOKIE_NAME] || null;
}

/** Anexa req.user quando há sessão válida. Nunca bloqueia. */
export function attachUser(req, _res, next) {
  const token = readSessionToken(req);
  if (token) {
    const session = findSession.get(token);
    if (session && session.expires_at > Date.now()) {
      req.user = { id: session.user_id, username: session.username, name: session.name };
      req.sessionToken = token;
    } else if (session) {
      deleteSession.run(token);
    }
  }
  next();
}

/** Bloqueia a rota quando não há admin logado. */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Faça login para continuar.' });
  next();
}
