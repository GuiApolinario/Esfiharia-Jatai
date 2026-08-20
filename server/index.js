import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { ROOT_DIR, UPLOADS_DIR } from './db.js';
import {
  attachUser,
  changePassword,
  clearSessionCookie,
  ensureAdminUser,
  login,
  logout,
  requireAuth,
  setSessionCookie,
} from './auth.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';
import { seedIfEmpty } from './seed.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
// Necessário quando o site roda atrás de proxy reverso (Nginx, Render, Railway…),
// para o IP do visitante chegar correto no controle de tentativas de login.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(attachUser);

/* --------------------------------------------------------------- login API */

// Trava simples contra tentativa de força bruta no login.
const attempts = new Map();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

function tooManyAttempts(ip) {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function registerFailure(ip) {
  const entry = attempts.get(ip);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || 'desconhecido';
  if (tooManyAttempts(ip)) {
    return res
      .status(429)
      .json({ error: 'Muitas tentativas de login. Aguarde 10 minutos e tente novamente.' });
  }

  const result = login(req.body.username, req.body.password);
  if (!result) {
    registerFailure(ip);
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  attempts.delete(ip);
  setSessionCookie(res, result.token);
  res.json({ user: result.user });
});

app.post('/api/auth/logout', (req, res) => {
  logout(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
  res.json({ user: req.user });
});

app.post('/api/auth/password', requireAuth, (req, res) => {
  const result = changePassword(req.user.id, req.body.current_password, req.body.new_password);
  if (!result.ok) return res.status(400).json({ error: result.error });
  clearSessionCookie(res);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------- rotas */

app.use('/api', publicRouter);
app.use('/api/admin', adminRouter);

app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(ROOT_DIR, 'public'), { extensions: ['html'] }));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
app.use((_req, res) => res.sendFile(path.join(ROOT_DIR, 'public', 'index.html')));

// Erros de upload (arquivo grande, formato inválido) e falhas inesperadas.
app.use((err, _req, res, _next) => {
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status || 500;
  const message =
    err.code === 'LIMIT_FILE_SIZE'
      ? 'A imagem passa de 5 MB. Envie uma foto menor.'
      : err.message || 'Erro inesperado no servidor.';
  if (status >= 500) console.error(err);
  res.status(status).json({ error: message });
});

/* ------------------------------------------------------------------ início */

const created = ensureAdminUser();
seedIfEmpty();

app.listen(PORT, () => {
  console.log(`\n  Esfiharia Jataí rodando em http://localhost:${PORT}`);
  console.log(`  Painel do administrador:   http://localhost:${PORT}/admin\n`);
  if (created) {
    console.log('  ─────────────────────────────────────────────');
    console.log('  Acesso do administrador criado:');
    console.log(`    usuário: ${created.username}`);
    console.log(`    senha:   ${created.password}`);
    if (created.generated) console.log('  Anote essa senha e troque no painel depois de entrar.');
    console.log('  ─────────────────────────────────────────────\n');
  }
});
