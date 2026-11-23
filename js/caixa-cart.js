/* =============================================================================
   Carrinho do Caixa — cópia isolada de cart.js, com sua própria chave no
   localStorage, para nunca se misturar com o carrinho do cliente no site
   caso os dois estejam abertos no mesmo navegador (ex.: tablet do balcão).
   ========================================================================== */

const KEY = 'esfiharia-jatai:caixa-carrinho:v1';
const listeners = new Set();

let items = load();

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((i) => i?.productId && i.qty > 0) : [];
  } catch {
    return [];
  }
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* aba anônima */ }
  listeners.forEach((fn) => fn(items));
}

/** Duas linhas só se somam se forem o mesmo produto com os mesmos adicionais. */
function lineKey(productId, addonIds, notes) {
  return `${productId}|${[...(addonIds || [])].sort((a, b) => a - b).join(',')}|${notes || ''}`;
}

export const getItems = () => items;
export const subscribe = (fn) => { listeners.add(fn); fn(items); return () => listeners.delete(fn); };

export const count = () => items.reduce((s, i) => s + i.qty, 0);
export const totalCents = () => items.reduce((s, i) => s + lineTotal(i), 0);
export const isEmpty = () => items.length === 0;

/** Preço da linha = (produto + adicionais) x quantidade. */
export const lineTotal = (i) =>
  (i.unitPriceCents + (i.addons || []).reduce((s, a) => s + a.price_cents, 0)) * i.qty;

/** Quantidade total de um produto, somando todas as variações de adicionais. */
export const qtyOfProduct = (productId) =>
  items.filter((i) => i.productId === productId).reduce((s, i) => s + i.qty, 0);

export function add(product, { addons = [], notes = '', qty = 1 } = {}) {
  const addonIds = addons.map((a) => a.id);
  const key = lineKey(product.id, addonIds, notes);
  const found = items.find((i) => i.key === key);

  if (found) {
    found.qty = Math.min(99, found.qty + qty);
  } else {
    items.push({
      key,
      productId: product.id,
      name: product.name,
      unitPriceCents: product.cents,
      image: product.image,
      unit: product.unit,
      addons: addons.map((a) => ({ id: a.id, name: a.name, price_cents: a.price_cents })),
      notes,
      qty,
    });
  }
  persist();
}

export function setQty(key, qty) {
  const next = Math.max(0, Math.min(99, Math.round(Number(qty) || 0)));
  const idx = items.findIndex((i) => i.key === key);
  if (idx === -1) return;
  if (next === 0) items.splice(idx, 1);
  else items[idx].qty = next;
  persist();
}

export const bump = (key, step) => {
  const i = items.find((x) => x.key === key);
  if (i) setQty(key, i.qty + step);
};

/** Diminui um produto pelo card do cardápio (mexe na última linha dele). */
export function bumpProduct(productId, step) {
  const lines = items.filter((i) => i.productId === productId);
  if (!lines.length) return;
  const target = step > 0 ? lines[0] : lines[lines.length - 1];
  setQty(target.key, target.qty + step);
}

export function clear() {
  items = [];
  persist();
}

/** Remove o que saiu do cardápio (depois de uma sincronização) e atualiza
 *  nomes/preços que mudaram. */
export function reconcile(products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const before = items.length;
  items = items.filter((i) => byId.has(i.productId));
  for (const i of items) {
    const p = byId.get(i.productId);
    i.name = p.name;
    i.unitPriceCents = p.cents;
    i.image = p.image;
    i.unit = p.unit;
  }
  persist();
  return before - items.length;
}
