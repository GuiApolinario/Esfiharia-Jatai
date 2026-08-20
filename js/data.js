/* Tudo que o site lê e grava no Supabase fica concentrado aqui.
   O resto do código não conhece o banco: só chama estas funções. */

import { supabase, isConfigured, SETUP_MESSAGE, OFFLINE_MESSAGE } from './supabase.js';

const BUCKET = 'produtos';

export const DEFAULT_SETTINGS = {
  store_name: 'Esfiharia Jataí',
  tagline: 'Esfihas na hora, feitas com massa artesanal',
  whatsapp: '5515997365401',
  address: 'Jataí',
  notice: '',
  slot_minutes: 15,
  lead_minutes: 30,
  max_days_ahead: 7,
  min_order_cents: 0,
  hours: {
    0: { open: '18:00', close: '22:30', closed: false },
    1: { open: '18:00', close: '22:30', closed: true },
    2: { open: '18:00', close: '22:30', closed: false },
    3: { open: '18:00', close: '22:30', closed: false },
    4: { open: '18:00', close: '22:30', closed: false },
    5: { open: '18:00', close: '23:30', closed: false },
    6: { open: '18:00', close: '23:30', closed: false },
  },
};

/** Converte o erro técnico do Supabase em algo que dá para mostrar na tela. */
function fail(error, fallback) {
  const message = String(error?.message || '');
  if (/row-level security|permission denied|violates/i.test(message)) {
    throw new Error('Sua conta não tem permissão para essa ação. Confira o passo 7 do arquivo supabase/schema.sql.');
  }
  if (/Failed to fetch|NetworkError|fetch failed/i.test(message)) {
    throw new Error('Não conseguimos falar com o servidor. Verifique a conexão com a internet.');
  }
  if (/Invalid login credentials/i.test(message)) throw new Error('E-mail ou senha incorretos.');
  if (/Email not confirmed/i.test(message)) {
    throw new Error('Esse e-mail ainda não foi confirmado no Supabase. Marque "Auto Confirm User" ao criar o usuário.');
  }
  throw new Error(message || fallback);
}

function requireClient() {
  if (!isConfigured) throw new Error(SETUP_MESSAGE);
  if (!supabase) throw new Error(OFFLINE_MESSAGE);
  return supabase;
}

/* ------------------------------------------------------------ configurações */

/** As configurações são guardadas como texto; aqui viram números e objetos. */
function normalizeSettings(rows) {
  const raw = Object.fromEntries((rows || []).map((row) => [row.key, row.value]));
  const number = (key) => {
    const value = Number(raw[key]);
    return Number.isFinite(value) ? value : DEFAULT_SETTINGS[key];
  };

  let hours = DEFAULT_SETTINGS.hours;
  try {
    if (raw.hours) hours = JSON.parse(raw.hours);
  } catch {
    /* configuração corrompida: seguimos com o horário padrão */
  }

  return {
    store_name: raw.store_name ?? DEFAULT_SETTINGS.store_name,
    tagline: raw.tagline ?? DEFAULT_SETTINGS.tagline,
    whatsapp: (raw.whatsapp ?? DEFAULT_SETTINGS.whatsapp).replace(/\D/g, ''),
    address: raw.address ?? DEFAULT_SETTINGS.address,
    notice: raw.notice ?? DEFAULT_SETTINGS.notice,
    slot_minutes: number('slot_minutes'),
    lead_minutes: number('lead_minutes'),
    max_days_ahead: number('max_days_ahead'),
    min_order_cents: number('min_order_cents'),
    hours,
  };
}

export async function getSettings() {
  const client = requireClient();
  const { data, error } = await client.from('settings').select('key, value');
  if (error) fail(error, 'Não foi possível carregar as configurações da loja.');
  return normalizeSettings(data);
}

export async function saveSettings(patch) {
  const client = requireClient();
  const rows = Object.entries(patch).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));
  const { error } = await client.from('settings').upsert(rows, { onConflict: 'key' });
  if (error) fail(error, 'Não foi possível salvar as configurações.');
  return getSettings();
}

/* ------------------------------------------------------------------ cardápio */

/** Uma única chamada com tudo que o site do cliente precisa. */
export async function fetchCatalog() {
  const client = requireClient();
  const [settings, categories, products] = await Promise.all([
    getSettings(),
    client.from('categories').select('id, name, icon, sort_order').order('sort_order').order('name'),
    client
      .from('products')
      .select('id, category_id, name, description, price_cents, unit, image, sort_order')
      .eq('available', true)
      .order('sort_order')
      .order('name'),
  ]);

  if (categories.error) fail(categories.error, 'Não foi possível carregar as categorias.');
  if (products.error) fail(products.error, 'Não foi possível carregar o cardápio.');

  return {
    // "name" é o apelido curto usado nas telas; o resto vem igual do banco.
    store: { ...settings, name: settings.store_name },
    categories: categories.data || [],
    products: products.data || [],
  };
}

/* ------------------------------------------------------------------ produtos */

export async function listProducts() {
  const client = requireClient();
  const { data, error } = await client
    .from('products')
    .select('*, categories(name)')
    .order('sort_order')
    .order('name');
  if (error) fail(error, 'Não foi possível carregar os produtos.');

  return (data || []).map(({ categories, ...product }) => ({
    ...product,
    category_name: categories?.name || null,
  }));
}

async function nextSortOrder(table) {
  const client = requireClient();
  const { data } = await client.from(table).select('sort_order').order('sort_order', { ascending: false }).limit(1);
  return (data?.[0]?.sort_order ?? 0) + 1;
}

export async function createProduct(product) {
  const client = requireClient();
  const payload = { ...product, sort_order: product.sort_order ?? (await nextSortOrder('products')) };
  const { data, error } = await client.from('products').insert(payload).select().single();
  if (error) fail(error, 'Não foi possível cadastrar o produto.');
  return data;
}

export async function updateProduct(id, patch) {
  const client = requireClient();

  // Troca de foto: a antiga sai do armazenamento para não ocupar espaço à toa.
  if (patch.image !== undefined) {
    const { data: current } = await client.from('products').select('image').eq('id', id).single();
    if (current?.image && current.image !== patch.image) removeImage(current.image);
  }

  const { data, error } = await client
    .from('products')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) fail(error, 'Não foi possível salvar o produto.');
  return data;
}

export async function deleteProduct(id) {
  const client = requireClient();
  const { data: current } = await client.from('products').select('image').eq('id', id).single();
  const { error } = await client.from('products').delete().eq('id', id);
  if (error) fail(error, 'Não foi possível excluir o produto.');
  if (current?.image) removeImage(current.image);
}

/* ---------------------------------------------------------------- categorias */

export async function listCategories() {
  const client = requireClient();
  const [categories, products] = await Promise.all([
    client.from('categories').select('*').order('sort_order').order('name'),
    client.from('products').select('category_id'),
  ]);
  if (categories.error) fail(categories.error, 'Não foi possível carregar as categorias.');

  const counts = new Map();
  for (const { category_id } of products.data || []) {
    counts.set(category_id, (counts.get(category_id) || 0) + 1);
  }

  return (categories.data || []).map((category) => ({
    ...category,
    product_count: counts.get(category.id) || 0,
  }));
}

export async function createCategory(category) {
  const client = requireClient();
  const payload = { ...category, sort_order: category.sort_order ?? (await nextSortOrder('categories')) };
  const { data, error } = await client.from('categories').insert(payload).select().single();
  if (error) fail(error, 'Não foi possível criar a categoria.');
  return data;
}

export async function updateCategory(id, patch) {
  const client = requireClient();
  const { data, error } = await client.from('categories').update(patch).eq('id', id).select().single();
  if (error) fail(error, 'Não foi possível salvar a categoria.');
  return data;
}

export async function deleteCategory(id) {
  const client = requireClient();
  const { error } = await client.from('categories').delete().eq('id', id);
  if (error) fail(error, 'Não foi possível excluir a categoria.');
}

/* --------------------------------------------------------------------- fotos */

export async function uploadImage(file) {
  const client = requireClient();
  const extension = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

  const { error } = await client.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: '604800', upsert: false });
  if (error) fail(error, 'Não foi possível enviar a foto.');

  return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Apaga a foto do armazenamento. Falha aqui não impede o resto de funcionar. */
function removeImage(publicUrl) {
  const marker = `/${BUCKET}/`;
  const index = String(publicUrl).lastIndexOf(marker);
  if (index === -1) return;
  const path = publicUrl.slice(index + marker.length).split('?')[0];
  supabase?.storage.from(BUCKET).remove([decodeURIComponent(path)]).catch(() => {});
}

/* -------------------------------------------------------------------- acesso */

export async function currentUser() {
  if (!isConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user || null;
}

export async function signIn(email, password) {
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: String(email || '').trim(),
    password: String(password || ''),
  });
  if (error) fail(error, 'Não foi possível entrar.');

  // Estar logado não basta: a conta precisa constar na tabela de administradores.
  const { data: admin } = await client.from('admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
  if (!admin) {
    await client.auth.signOut();
    throw new Error('Esta conta não tem acesso ao painel. Rode o passo 7 do arquivo supabase/schema.sql com este e-mail.');
  }
  return data.user;
}

export async function signOut() {
  if (isConfigured) await supabase.auth.signOut();
}

export async function changePassword(currentPassword, newPassword) {
  const client = requireClient();
  const user = await currentUser();
  if (!user) throw new Error('Sua sessão expirou. Entre novamente.');

  // O Supabase não pede a senha atual, então conferimos entrando de novo com ela.
  const { error: checkError } = await client.auth.signInWithPassword({
    email: user.email,
    password: String(currentPassword || ''),
  });
  if (checkError) throw new Error('A senha atual está incorreta.');

  const { error } = await client.auth.updateUser({ password: String(newPassword) });
  if (error) fail(error, 'Não foi possível alterar a senha.');
}
