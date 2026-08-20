import express from 'express';
import { db, getSettings } from '../db.js';

export const publicRouter = express.Router();

/** Tudo que o site público precisa em uma única requisição. */
publicRouter.get('/catalog', (_req, res) => {
  const settings = getSettings();
  const categories = db
    .prepare('SELECT id, name, icon FROM categories ORDER BY sort_order, name')
    .all();
  const products = db
    .prepare(
      `SELECT id, category_id, name, description, price_cents, unit, image, sort_order
         FROM products
        WHERE available = 1
        ORDER BY sort_order, name`
    )
    .all();

  res.json({
    store: {
      name: settings.store_name,
      tagline: settings.tagline,
      whatsapp: settings.whatsapp,
      address: settings.address,
      notice: settings.notice,
      hours: settings.hours,
      slot_minutes: settings.slot_minutes,
      lead_minutes: settings.lead_minutes,
      max_days_ahead: settings.max_days_ahead,
      min_order_cents: settings.min_order_cents,
    },
    categories,
    products,
  });
});
