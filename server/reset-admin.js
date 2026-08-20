import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

/**
 * Redefine a senha do administrador pelo terminal, para quando ela for esquecida:
 *   npm run reset-admin -- minhaNovaSenha
 */
const username = process.env.ADMIN_USER || 'admin';
const password = process.argv[2] || crypto.randomBytes(6).toString('base64url');

if (password.length < 6) {
  console.error('A senha precisa ter pelo menos 6 caracteres.');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);

if (user) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
} else {
  db.prepare('INSERT INTO users (username, password_hash, name) VALUES (?, ?, ?)').run(
    username,
    hash,
    'Administrador'
  );
}

console.log(`\n  Acesso do administrador atualizado:\n    usuário: ${username}\n    senha:   ${password}\n`);
