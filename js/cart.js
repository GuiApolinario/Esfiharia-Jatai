/* Carrinho do cliente, guardado no navegador para não perder o pedido ao recarregar. */

const STORAGE_KEY = 'esfiharia-jatai:carrinho';
const listeners = new Set();

let items = load();

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.qty > 0) : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* modo privado do navegador: seguimos apenas em memória */
  }
  listeners.forEach((fn) => fn(items));
}

export const getItems = () => items;
export const subscribe = (fn) => { listeners.add(fn); fn(items); return () => listeners.delete(fn); };

export const quantityOf = (id) => items.find((item) => item.id === id)?.qty || 0;
export const totalItems = () => items.reduce((sum, item) => sum + item.qty, 0);
export const totalCents = () => items.reduce((sum, item) => sum + item.qty * item.price_cents, 0);
export const isEmpty = () => items.length === 0;

export function add(product, qty = 1) {
  const existing = items.find((item) => item.id === product.id);
  if (existing) {
    existing.qty += qty;
    existing.price_cents = product.price_cents;
    existing.name = product.name;
  } else {
    items.push({
      id: product.id,
      name: product.name,
      price_cents: product.price_cents,
      unit: product.unit,
      image: product.image,
      qty,
    });
  }
  persist();
}

export function setQty(id, qty) {
  const next = Math.max(0, Math.min(999, Math.round(Number(qty) || 0)));
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return;
  if (next === 0) items.splice(index, 1);
  else items[index].qty = next;
  persist();
}

export const increment = (id, step = 1) => setQty(id, quantityOf(id) + step);
export const remove = (id) => setQty(id, 0);

export function clear() {
  items = [];
  persist();
}

/** Remove itens que saíram do cardápio e atualiza preços que mudaram. */
export function reconcile(catalogProducts) {
  const byId = new Map(catalogProducts.map((product) => [product.id, product]));
  const before = items.length;
  items = items.filter((item) => byId.has(item.id));
  for (const item of items) {
    const product = byId.get(item.id);
    item.name = product.name;
    item.price_cents = product.price_cents;
    item.unit = product.unit;
    item.image = product.image;
  }
  persist();
  return before - items.length;
}
