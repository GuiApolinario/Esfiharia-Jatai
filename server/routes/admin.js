import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { db, getSettings, saveSettings, UPLOADS_DIR, DEFAULT_SETTINGS } from '../db.js';
import { requireAuth } from '../auth.js';

export const adminRouter = express.Router();
adminRouter.use(requireAuth);

/* ------------------------------------------------------------------ upload */

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${EXT_BY_MIME[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED_MIME.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Envie uma imagem JPG, PNG, WEBP ou GIF.')),
});

adminRouter.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem foi enviada.' });
  res.status(201).json({ image: `/uploads/${req.file.filename}` });
});

/* -------------------------------------------------------------- categorias */

adminRouter.get('/categories', (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT c.id, c.name, c.icon, c.sort_order,
                (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
           FROM categories c ORDER BY c.sort_order, c.name`
      )
      .all()
  );
});

adminRouter.post('/categories', (req, res) => {
  const name = str(req.body.name);
  if (!name) return res.status(400).json({ error: 'Informe o nome da categoria.' });
  const nextOrder =
    db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories').get().n;
  const info = db
    .prepare('INSERT INTO categories (name, icon, sort_order) VALUES (?, ?, ?)')
    .run(name, str(req.body.icon), int(req.body.sort_order, nextOrder));
  res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid));
});

adminRouter.put('/categories/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Categoria não encontrada.' });
  db.prepare('UPDATE categories SET name = ?, icon = ?, sort_order = ? WHERE id = ?').run(
    str(req.body.name) || current.name,
    req.body.icon === undefined ? current.icon : str(req.body.icon),
    int(req.body.sort_order, current.sort_order),
    current.id
  );
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(current.id));
});

adminRouter.delete('/categories/:id', (req, res) => {
  const info = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Categoria não encontrada.' });
  res.json({ ok: true });
});

/* ----------------------------------------------------------------- produtos */

adminRouter.get('/products', (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT p.*, c.name AS category_name
           FROM products p LEFT JOIN categories c ON c.id = p.category_id
          ORDER BY p.sort_order, p.name`
      )
      .all()
  );
});

adminRouter.post('/products', (req, res) => {
  const data = parseProduct(req.body);
  if (data.error) return res.status(400).json({ error: data.error });
  const nextOrder =
    db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM products').get().n;
  const info = db
    .prepare(
      `INSERT INTO products (category_id, name, description, price_cents, unit, image, available, sort_order)
       VALUES (@category_id, @name, @description, @price_cents, @unit, @image, @available, @sort_order)`
    )
    .run({ ...data.value, sort_order: int(req.body.sort_order, nextOrder) });
  res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid));
});

adminRouter.put('/products/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Produto não encontrado.' });

  const data = parseProduct({ ...current, ...req.body });
  if (data.error) return res.status(400).json({ error: data.error });

  if (current.image && data.value.image !== current.image) removeUpload(current.image);

  db.prepare(
    `UPDATE products
        SET category_id = @category_id, name = @name, description = @description,
            price_cents = @price_cents, unit = @unit, image = @image,
            available = @available, sort_order = @sort_order,
            updated_at = datetime('now')
      WHERE id = @id`
  ).run({ ...data.value, sort_order: int(req.body.sort_order, current.sort_order), id: current.id });

  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(current.id));
});

adminRouter.delete('/products/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Produto não encontrado.' });
  db.prepare('DELETE FROM products WHERE id = ?').run(current.id);
  if (current.image) removeUpload(current.image);
  res.json({ ok: true });
});

/* ------------------------------------------------------------ configurações */

adminRouter.get('/settings', (_req, res) => res.json(getSettings()));

adminRouter.put('/settings', (req, res) => {
  const patch = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (req.body[key] === undefined) continue;
    patch[key] = key === 'hours' ? JSON.stringify(req.body.hours) : String(req.body[key]);
  }
  if (patch.whatsapp) patch.whatsapp = patch.whatsapp.replace(/\D/g, '');
  res.json(saveSettings(patch));
});

/* ------------------------------------------------------------------ helpers */

function str(value) {
  return String(value ?? '').trim();
}

function int(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Aceita "7,50", "7.50", 750 (centavos já convertidos pelo front) e devolve centavos. */
function toCents(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  const normalized = String(value ?? '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');
  const reais = Number.parseFloat(normalized);
  return Number.isFinite(reais) ? Math.round(reais * 100) : NaN;
}

function parseProduct(body) {
  const name = str(body.name);
  if (!name) return { error: 'Informe o nome do produto.' };

  const price_cents = body.price_cents !== undefined ? toCents(body.price_cents) : toCents(body.price);
  if (!Number.isFinite(price_cents) || price_cents < 0) {
    return { error: 'Informe um preço válido, por exemplo 7,50.' };
  }

  let category_id = body.category_id === '' || body.category_id == null ? null : int(body.category_id, null);
  if (category_id !== null && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(category_id)) {
    category_id = null;
  }

  return {
    value: {
      category_id,
      name,
      description: str(body.description),
      price_cents,
      unit: str(body.unit) || 'unidade',
      image: str(body.image),
      available: body.available === undefined ? 1 : truthy(body.available) ? 1 : 0,
    },
  };
}

function truthy(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

/** Remove um arquivo de /uploads, ignorando caminhos fora da pasta. */
function removeUpload(imagePath) {
  if (!imagePath.startsWith('/uploads/')) return;
  const file = path.join(UPLOADS_DIR, path.basename(imagePath));
  fs.promises.unlink(file).catch(() => {});
}
