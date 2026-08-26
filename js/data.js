/* =============================================================================
   Camada de dados — tudo que fala com o Supabase mora aqui.

   REGRA DE OURO (não quebre):
   O preço mostrado nesta camada serve só para a interface. O valor oficial do
   pedido é calculado pela função create_order() dentro do banco, que lê os
   preços da tabela products e ignora qualquer preço vindo do navegador.
   ========================================================================== */

import { supabase, isConfigured, SETUP_MESSAGE, OFFLINE_MESSAGE } from './supabase.js?v=2';

const BUCKET = 'produtos';

export const DEFAULTS = {
  store_name: 'Esfiharia Jataí',
  headline: 'Sua esfiha favorita a poucos toques.',
  whatsapp: '5515997365401',
  address: 'Jataí',
  instagram: '',
  announcement: '',
  announcement_active: false,
  accepting_orders: true,
  closed_message: 'Estamos fechados agora. Fale com a gente no WhatsApp.',
  pickup_enabled: true,
  prep_time_note: '',
  min_order_cents: 0,
  slot_minutes: 15,
  lead_minutes: 30,
  order_cutoff_days: 1,
  primary_color: '#c8102e',
  secondary_color: '#ffffff',
  accent_color: '#f2b233',
  logo_url: '',
  whatsapp_footer: 'Pedido registrado no sistema.',
  // Dias específicos do festival: [{ date: '2026-09-05', open: '18:00', close: '22:30' }, ...]
  event_days: [],
};

const NUMBER_KEYS = ['min_order_cents', 'slot_minutes', 'lead_minutes', 'order_cutoff_days'];
const BOOL_KEYS = ['announcement_active', 'accepting_orders', 'pickup_enabled'];

/** Transforma o erro técnico do Supabase em algo que dá para mostrar na tela. */
function fail(error, fallback) {
  const msg = String(error?.message || error?.hint || '');
  if (/row-level security|permission denied|not authorized/i.test(msg)) {
    throw new Error('Sua conta não tem permissão para essa ação. Confira o passo final do supabase/schema.sql.');
  }
  if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(msg)) {
    throw new Error('Parece que sua conexão caiu. Seu carrinho continua salvo.');
  }
  if (/Invalid login credentials/i.test(msg)) throw new Error('E-mail ou senha incorretos.');
  if (/Email not confirmed/i.test(msg)) {
    throw new Error('Esse e-mail não foi confirmado no Supabase. Marque "Auto Confirm User" ao criar o usuário.');
  }
  throw new Error(msg || fallback);
}

function client() {
  if (!isConfigured) throw new Error(SETUP_MESSAGE);
  if (!supabase) throw new Error(OFFLINE_MESSAGE);
  return supabase;
}

/* ------------------------------------------------------------ configurações */

function normalize(rows) {
  const raw = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
  const out = { ...DEFAULTS };

  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    if (raw[key] === undefined) continue;
    if (NUMBER_KEYS.includes(key)) {
      const n = Number(raw[key]);
      out[key] = Number.isFinite(n) ? n : fallback;
    } else if (BOOL_KEYS.includes(key)) {
      out[key] = raw[key] === 'true';
    } else if (key === 'event_days') {
      try { out.event_days = JSON.parse(raw.event_days); } catch { out.event_days = fallback; }
    } else {
      out[key] = raw[key];
    }
  }
  out.whatsapp = String(out.whatsapp).replace(/\D/g, '');
  return out;
}

export async function getSettings() {
  const { data, error } = await client().from('settings').select('key, value');
  if (error) fail(error, 'Não foi possível carregar as configurações.');
  return normalize(data);
}

export async function saveSettings(patch) {
  const rows = Object.entries(patch).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value
         : typeof value === 'boolean' ? String(value)
         : typeof value === 'number' ? String(value)
         : JSON.stringify(value),
  }));
  const { error } = await client().from('settings').upsert(rows, { onConflict: 'key' });
  if (error) fail(error, 'Não foi possível salvar as configurações.');
  return getSettings();
}

/* ------------------------------------------------------------------ cardápio */

/** Preço válido agora. Espelha effective_price_cents() do banco, só para a UI. */
export function effectivePrice(p) {
  const now = Date.now();
  const okStart = !p.promo_start || new Date(p.promo_start).getTime() <= now;
  const okEnd = !p.promo_end || new Date(p.promo_end).getTime() >= now;
  if (p.promo_price_cents > 0 && p.promo_price_cents < p.price_cents && okStart && okEnd) {
    return { cents: p.promo_price_cents, was: p.price_cents, promo: true };
  }
  return { cents: p.price_cents, was: null, promo: false };
}

/** Tudo que a loja precisa para desenhar o cardápio, numa tacada só. */
export async function fetchCatalog() {
  const db = client();
  const [settings, cats, prods, links, groups, addons] = await Promise.all([
    getSettings(),
    db.from('categories').select('id, name, icon, sort_order').eq('active', true).order('sort_order').order('name'),
    db.from('products')
      .select('id, category_id, name, description, price_cents, promo_price_cents, promo_start, promo_end, image, unit, featured, sort_order')
      .eq('available', true).order('sort_order').order('name'),
    db.from('product_addon_groups').select('product_id, group_id, sort_order'),
    db.from('addon_groups').select('id, name, required, min_choices, max_choices, sort_order').eq('active', true).order('sort_order'),
    db.from('addons').select('id, group_id, name, price_cents, sort_order').eq('active', true).order('sort_order').order('name'),
  ]);

  for (const r of [cats, prods, links, groups, addons]) {
    if (r.error) fail(r.error, 'Não foi possível carregar o cardápio.');
  }

  // Monta os grupos de adicionais de cada produto, já com seus itens.
  const addonsByGroup = new Map();
  for (const a of addons.data || []) {
    if (!addonsByGroup.has(a.group_id)) addonsByGroup.set(a.group_id, []);
    addonsByGroup.get(a.group_id).push(a);
  }
  const groupById = new Map((groups.data || []).map((g) => [g.id, g]));
  const groupsByProduct = new Map();
  for (const l of (links.data || []).sort((a, b) => a.sort_order - b.sort_order)) {
    const g = groupById.get(l.group_id);
    if (!g) continue;
    const items = addonsByGroup.get(g.id) || [];
    if (!items.length) continue;
    if (!groupsByProduct.has(l.product_id)) groupsByProduct.set(l.product_id, []);
    groupsByProduct.get(l.product_id).push({ ...g, addons: items });
  }

  const products = (prods.data || []).map((p) => ({
    ...p,
    ...effectivePrice(p),
    addonGroups: groupsByProduct.get(p.id) || [],
  }));

  return { store: { ...settings, name: settings.store_name }, categories: cats.data || [], products };
}

/* ------------------------------------------------------- criação do pedido */

/**
 * Cria o pedido NO SERVIDOR. Mandamos só ids e quantidades — o banco calcula
 * o total. `unit_price_cents` vai junto apenas para o servidor poder AVISAR
 * se o preço mudou; ele nunca é usado como valor de cobrança.
 */
export async function createOrder({ name, phone, notes, pickupAt, items, expectedTotal, token }) {
  const { data, error } = await client().rpc('create_order', {
    p_customer_name: name,
    p_customer_phone: phone,
    p_items: items.map((i) => ({
      product_id: i.productId,
      quantity: i.qty,
      notes: i.notes || '',
      addon_ids: i.addonIds || [],
      unit_price_cents: i.unitPriceCents,
    })),
    p_notes: notes || '',
    p_pickup_at: pickupAt || null,
    p_expected_total_cents: expectedTotal ?? null,
    p_client_token: token || null,
  });

  if (error) {
    // Erros que a própria função levantou já vêm com texto amigável.
    const msg = String(error.message || '');
    if (error.code === 'P0001' || /P0001/.test(msg)) throw new Error(msg.replace(/^.*?:\s*/, ''));
    fail(error, 'Não conseguimos finalizar seu pedido agora. Tente novamente.');
  }
  return data;
}

/* --------------------------------------------------- painel: produtos */

export async function listProducts() {
  const { data, error } = await client()
    .from('products').select('*, categories(name)').order('sort_order').order('name');
  if (error) fail(error, 'Não foi possível carregar os produtos.');
  return (data || []).map(({ categories, ...p }) => ({ ...p, category_name: categories?.name || null }));
}

async function nextOrder(table) {
  const { data } = await client().from(table).select('sort_order').order('sort_order', { ascending: false }).limit(1);
  return (data?.[0]?.sort_order ?? 0) + 1;
}

export async function createProduct(p) {
  const payload = { ...p, sort_order: p.sort_order ?? (await nextOrder('products')) };
  const { data, error } = await client().from('products').insert(payload).select().single();
  if (error) fail(error, 'Não foi possível cadastrar o produto.');
  return data;
}

export async function updateProduct(id, patch) {
  const db = client();
  if (patch.image !== undefined) {
    const { data: cur } = await db.from('products').select('image').eq('id', id).single();
    if (cur?.image && cur.image !== patch.image) removeImage(cur.image);
  }
  const { data, error } = await db.from('products')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) fail(error, 'Não foi possível salvar o produto.');
  return data;
}

export async function deleteProduct(id) {
  const db = client();
  const { data: cur } = await db.from('products').select('image').eq('id', id).single();
  const { error } = await db.from('products').delete().eq('id', id);
  if (error) fail(error, 'Não foi possível excluir o produto.');
  if (cur?.image) removeImage(cur.image);
}

/* -------------------------------------------------- painel: categorias */

export async function listCategories() {
  const db = client();
  const [cats, prods] = await Promise.all([
    db.from('categories').select('*').order('sort_order').order('name'),
    db.from('products').select('category_id'),
  ]);
  if (cats.error) fail(cats.error, 'Não foi possível carregar as categorias.');
  const counts = new Map();
  for (const { category_id } of prods.data || []) counts.set(category_id, (counts.get(category_id) || 0) + 1);
  return (cats.data || []).map((c) => ({ ...c, product_count: counts.get(c.id) || 0 }));
}

export async function createCategory(c) {
  const payload = { ...c, sort_order: c.sort_order ?? (await nextOrder('categories')) };
  const { data, error } = await client().from('categories').insert(payload).select().single();
  if (error) fail(error, 'Não foi possível criar a categoria.');
  return data;
}

export async function updateCategory(id, patch) {
  const { data, error } = await client().from('categories').update(patch).eq('id', id).select().single();
  if (error) fail(error, 'Não foi possível salvar a categoria.');
  return data;
}

export async function deleteCategory(id) {
  const { error } = await client().from('categories').delete().eq('id', id);
  if (error) fail(error, 'Não foi possível excluir a categoria.');
}

/* --------------------------------------------------- painel: adicionais */

export async function listAddonGroups() {
  const db = client();
  const [groups, addons, links] = await Promise.all([
    db.from('addon_groups').select('*').order('sort_order').order('name'),
    db.from('addons').select('*').order('sort_order').order('name'),
    db.from('product_addon_groups').select('product_id, group_id'),
  ]);
  if (groups.error) fail(groups.error, 'Não foi possível carregar os adicionais.');

  const byGroup = new Map();
  for (const a of addons.data || []) {
    if (!byGroup.has(a.group_id)) byGroup.set(a.group_id, []);
    byGroup.get(a.group_id).push(a);
  }
  const used = new Map();
  for (const l of links.data || []) used.set(l.group_id, (used.get(l.group_id) || 0) + 1);

  return (groups.data || []).map((g) => ({
    ...g, addons: byGroup.get(g.id) || [], product_count: used.get(g.id) || 0,
  }));
}

export async function saveAddonGroup(id, patch) {
  const db = client();
  if (id) {
    const { data, error } = await db.from('addon_groups').update(patch).eq('id', id).select().single();
    if (error) fail(error, 'Não foi possível salvar o grupo.');
    return data;
  }
  const payload = { ...patch, sort_order: patch.sort_order ?? (await nextOrder('addon_groups')) };
  const { data, error } = await db.from('addon_groups').insert(payload).select().single();
  if (error) fail(error, 'Não foi possível criar o grupo.');
  return data;
}

export async function deleteAddonGroup(id) {
  const { error } = await client().from('addon_groups').delete().eq('id', id);
  if (error) fail(error, 'Não foi possível excluir o grupo.');
}

export async function saveAddon(id, patch) {
  const db = client();
  if (id) {
    const { data, error } = await db.from('addons').update(patch).eq('id', id).select().single();
    if (error) fail(error, 'Não foi possível salvar o adicional.');
    return data;
  }
  const { data, error } = await db.from('addons').insert(patch).select().single();
  if (error) fail(error, 'Não foi possível criar o adicional.');
  return data;
}

export async function deleteAddon(id) {
  const { error } = await client().from('addons').delete().eq('id', id);
  if (error) fail(error, 'Não foi possível excluir o adicional.');
}

/** Quais grupos de adicionais um produto oferece. */
export async function getProductGroups(productId) {
  const { data, error } = await client()
    .from('product_addon_groups').select('group_id').eq('product_id', productId);
  if (error) fail(error, 'Não foi possível carregar os adicionais do produto.');
  return (data || []).map((r) => r.group_id);
}

export async function setProductGroups(productId, groupIds) {
  const db = client();
  const { error: delErr } = await db.from('product_addon_groups').delete().eq('product_id', productId);
  if (delErr) fail(delErr, 'Não foi possível atualizar os adicionais do produto.');
  if (!groupIds.length) return;
  const { error } = await db.from('product_addon_groups')
    .insert(groupIds.map((group_id, i) => ({ product_id: productId, group_id, sort_order: i })));
  if (error) fail(error, 'Não foi possível vincular os adicionais.');
}

/* ------------------------------------------------------ painel: pedidos */

export async function listOrders({ status = '', search = '', limit = 60 } = {}) {
  let q = client().from('orders')
    .select('*, order_items(*, order_item_addons(*))')
    .order('created_at', { ascending: false }).limit(limit);

  if (status) q = q.eq('status', status);
  if (search) {
    const s = search.trim();
    q = q.or(`public_code.ilike.%${s}%,customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) fail(error, 'Não foi possível carregar os pedidos.');
  return data || [];
}

export async function setOrderStatus(id, status) {
  const { error } = await client().from('orders').update({ status }).eq('id', id);
  if (error) fail(error, 'Não foi possível atualizar o pedido.');
}

/** Números do dia para o painel inicial. */
export async function dashboardStats() {
  const db = client();
  const start = new Date(); start.setHours(0, 0, 0, 0);

  const [today, products] = await Promise.all([
    db.from('orders').select('total_cents, status').gte('created_at', start.toISOString()),
    db.from('products').select('available'),
  ]);
  if (today.error) fail(today.error, 'Não foi possível carregar o resumo.');

  const valid = (today.data || []).filter((o) => o.status !== 'cancelado');
  return {
    ordersToday: valid.length,
    revenueToday: valid.reduce((s, o) => s + o.total_cents, 0),
    available: (products.data || []).filter((p) => p.available).length,
    unavailable: (products.data || []).filter((p) => !p.available).length,
  };
}

/* --------------------------------------------------------------- fotos */

export async function uploadImage(file) {
  const db = client();
  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await db.storage.from(BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: '604800', upsert: false });
  if (error) fail(error, 'Não foi possível enviar a foto.');
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Remove a foto do armazenamento. Falhar aqui não quebra o resto. */
function removeImage(url) {
  const marker = `/${BUCKET}/`;
  const i = String(url).lastIndexOf(marker);
  if (i === -1) return;
  const path = url.slice(i + marker.length).split('?')[0];
  supabase?.storage.from(BUCKET).remove([decodeURIComponent(path)]).catch(() => {});
}

/* -------------------------------------------------------------- acesso */

export async function currentUser() {
  if (!isConfigured || !supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user || null;
}

export async function signIn(email, password) {
  const db = client();
  const { data, error } = await db.auth.signInWithPassword({
    email: String(email || '').trim(), password: String(password || ''),
  });
  if (error) fail(error, 'Não foi possível entrar.');

  // Estar logado não basta: a conta precisa constar na tabela de administradores.
  const { data: admin } = await db.from('admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
  if (!admin) {
    await db.auth.signOut();
    throw new Error('Esta conta não tem acesso ao painel. Rode o passo final do supabase/schema.sql com este e-mail.');
  }
  return data.user;
}

export async function signOut() {
  if (isConfigured && supabase) await supabase.auth.signOut();
}

export async function changePassword(current, next) {
  const db = client();
  const user = await currentUser();
  if (!user) throw new Error('Sua sessão expirou. Entre novamente.');

  // O Supabase não pede a senha atual, então conferimos entrando de novo com ela.
  const { error: check } = await db.auth.signInWithPassword({ email: user.email, password: String(current || '') });
  if (check) throw new Error('A senha atual está incorreta.');

  const { error } = await db.auth.updateUser({ password: String(next) });
  if (error) fail(error, 'Não foi possível alterar a senha.');
}
