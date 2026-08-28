/* =============================================================================
   Painel do administrador.
   Também mobile first: o dono precisa mexer no cardápio pelo celular.
   ========================================================================== */

import { $, $$, categoryIconHtml, dateTimeBR, escapeHtml, isImageIcon, maskPhone, money, onlyDigits, parseMoney, shrinkImage, toast } from './utils.js?v=7';
import { isConfigured, SETUP_MESSAGE } from './supabase.js?v=7';
import * as data from './data.js?v=7';

const PADRAO = { primary: '#c8102e', accent: '#f2b233' };

const S = {
  user: null,
  products: [],
  cats: [],
  groups: [],
  orders: [],
  recentOrders: [],
  listOrders: [],
  settings: null,
  editP: null,
  editC: null,
  editG: null,
  pImage: '',
  logo: '',
  cIcon: '',
  gItems: [],
  eventDays: [],
};

boot();

async function boot() {
  bind();
  if (!isConfigured) {
    $('#loginForm').hidden = true;
    return showAlert('#loginErr', SETUP_MESSAGE);
  }
  try {
    const user = await data.currentUser();
    if (user) await enter(user);
  } catch { /* segue para o login */ }
}

/* ------------------------------------------------------------------ acesso */

async function enter(user) {
  S.user = user;
  $('#login').style.display = 'none';
  $('#shell').classList.add('is-on');
  $('#who').textContent = user.email || '';
  await Promise.all([loadCats(), loadGroups(), loadProducts(), loadSettings(), loadHome()]);
}

async function doLogin(e) {
  e.preventDefault();
  const btn = $('#loginBtn');
  btn.disabled = true; btn.textContent = 'Entrando…';
  hideAlert('#loginErr');
  try {
    const user = await data.signIn($('#email').value, $('#pass').value);
    $('#pass').value = '';
    await enter(user);
  } catch (err) {
    showAlert('#loginErr', err.message);
    $('#pass').select();
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}

/** Sessão expirada volta para o login em vez de mostrar erro solto. */
function guard(err) {
  if (/sess(ã|a)o expirou|JWT|not authenticated/i.test(err.message)) {
    toast('Sua sessão expirou. Entre novamente.', 'bad');
    setTimeout(() => location.reload(), 1500);
    return true;
  }
  return false;
}

const oops = (err) => { if (!guard(err)) toast(err.message, 'bad'); };

/* ------------------------------------------------------------------ início */

async function loadHome() {
  try {
    const [stats, orders] = await Promise.all([data.dashboardStats(), data.listOrders({ limit: 8 })]);
    S.recentOrders = orders;
    $('#stats').innerHTML = `
      <div class="stat"><div class="stat__l">Pedidos hoje</div><div class="stat__v">${stats.ordersToday}</div></div>
      <div class="stat stat--brand"><div class="stat__l">Valor hoje</div><div class="stat__v money">${money(stats.revenueToday)}</div></div>
      <div class="stat"><div class="stat__l">Disponíveis</div><div class="stat__v">${stats.available}</div></div>
      <div class="stat"><div class="stat__l">Esgotados</div><div class="stat__v">${stats.unavailable}</div></div>`;
    $('#recent').innerHTML = orders.length ? orders.map(orderRow).join('')
      : `<div class="empty-box"><div class="empty-box__ic">🧾</div>Nenhum pedido ainda.</div>`;
  } catch (err) { oops(err); }
}

/* ----------------------------------------------------------------- pedidos */

async function loadOrders() {
  try {
    S.orders = await data.listOrders({ status: $('#oStatus').value, search: $('#oSearch').value });
    renderOrders();
  } catch (err) { oops(err); }
}

/** Um pedido pode estar só na lista da aba Pedidos, só nos "recentes" do
 *  Início, ou nos dois — por isso as ações (abrir, excluir, imprimir)
 *  procuram nas duas listas em vez de assumir qual delas já carregou. */
function findOrder(id) {
  return S.orders.find((x) => x.id === id) || S.recentOrders.find((x) => x.id === id);
}

function renderOrders() {
  const term = $('#oSearch').value.trim().toUpperCase();
  const box = $('#verified');

  // Item 48: conferência do código recebido no WhatsApp.
  const exact = S.orders.find((o) => o.public_code.toUpperCase() === term
    || o.public_code.toUpperCase() === `JT-${term}`);
  box.innerHTML = exact ? `
    <div class="verified">
      <div class="verified__t">✅ Pedido registrado</div>
      <div class="verified__c">${escapeHtml(exact.public_code)}</div>
      <div class="verified__v money">Total oficial: ${money(exact.total_cents)}</div>
      <div class="verified__d">${escapeHtml(exact.customer_name)} · criado em ${dateTimeBR(exact.created_at)}</div>
    </div>` : '';

  $('#orders').innerHTML = S.orders.length ? S.orders.map(orderRow).join('')
    : `<div class="empty-box"><div class="empty-box__ic">🔎</div>Nenhum pedido encontrado.</div>`;
}

function orderRow(o) {
  const n = (o.order_items || []).reduce((s, i) => s + i.quantity, 0);
  return `
    <article class="row" data-o="${o.id}">
      <div class="row__ph" style="font-size:17px">🧾</div>
      <div>
        <div class="row__t">${escapeHtml(o.public_code)} <span class="tag tag--${o.status}">${o.status}</span>
          ${o.printed_at ? '<span class="tag" title="Impresso">🖨️</span>' : ''}
        </div>
        <p class="row__d">${escapeHtml(o.customer_name)} · ${maskPhone(o.customer_phone)}</p>
        <div class="row__m">
          <span class="tag tag--p money">${money(o.total_cents)}</span>
          <span>${n} ${n === 1 ? 'item' : 'itens'}</span>
          <span>${dateTimeBR(o.created_at)}</span>
        </div>
      </div>
      <div class="row__a">
        <button class="mini mini--go" data-open="${o.id}">Ver pedido</button>
        <button class="mini mini--bad" data-delo="${o.id}">Excluir</button>
      </div>
    </article>`;
}

function openOrder(id) {
  const o = findOrder(id);
  if (!o) return;

  $('#oTitle').textContent = o.public_code;
  $('#oBody').innerHTML = `
    <div class="verified">
      <div class="verified__t">✅ Pedido registrado</div>
      <div class="verified__c">${escapeHtml(o.public_code)}</div>
      <div class="verified__v money">Total oficial: ${money(o.total_cents)}</div>
      <div class="verified__d">Criado em ${dateTimeBR(o.created_at)}</div>
      ${o.printed_at ? `<div class="verified__d">🖨️ Impresso em ${dateTimeBR(o.printed_at)}</div>` : ''}
    </div>
    <div class="block">
      <h3>Cliente</h3>
      <p style="margin:0;font-size:14px">${escapeHtml(o.customer_name)}</p>
      <p style="margin:4px 0 0"><a href="https://wa.me/55${o.customer_phone}" target="_blank" rel="noopener"
         style="color:var(--whats);font-weight:700">${maskPhone(o.customer_phone)} ↗</a></p>
      ${o.pickup_at ? `<p style="margin:8px 0 0;font-size:13.5px;color:var(--ink-soft)">🛍️ Retirada: ${dateTimeBR(o.pickup_at)}</p>` : ''}
      ${o.notes ? `<p style="margin:8px 0 0;font-size:13.5px">📝 ${escapeHtml(o.notes)}</p>` : ''}
    </div>
    <div class="block">
      <h3>Itens</h3>
      ${(o.order_items || []).map((i) => `
        <div class="oline">
          <span>
            <b>${i.quantity}×</b> ${escapeHtml(i.product_name_snapshot)}
            <span class="oline__a">${money(i.unit_price_cents_snapshot)} cada</span>
            ${(i.order_item_addons || []).map((a) => `<br><span class="oline__a">+ ${escapeHtml(a.addon_name_snapshot)} (${money(a.addon_price_cents_snapshot)})</span>`).join('')}
            ${i.notes ? `<br><span class="oline__a">obs: ${escapeHtml(i.notes)}</span>` : ''}
          </span>
          <b class="money">${money(i.subtotal_cents)}</b>
        </div>`).join('')}
      <div class="oline" style="margin-top:8px;border-top:2px solid var(--line);padding-top:10px">
        <b>Total</b><b class="money" style="color:var(--brand);font-size:17px">${money(o.total_cents)}</b>
      </div>
    </div>`;

  $('#oFoot').innerHTML = `
    <label class="f__l">Situação do pedido</label>
    <div class="chips">
      ${['novo', 'confirmado', 'preparando', 'finalizado', 'cancelado'].map((s) =>
        `<button class="chip ${o.status === s ? 'is-on' : ''}" data-st="${s}" data-oid="${o.id}">${s}</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
      <button class="mini" data-print="${o.id}">🖨️ Imprimir</button>
      <button class="mini mini--bad" data-delo="${o.id}">Excluir pedido</button>
    </div>`;

  openSheet('#oSheet');
}

/** Abre a impressão do pedido (só ele, via CSS de impressão do #oSheet) e
 *  marca a hora, para a cozinha saber o que já foi impresso. */
function printOrder(id) {
  const o = findOrder(id);
  if (!o) return;
  window.print();
  data.markOrderPrinted(id).then(({ printed_at }) => {
    o.printed_at = printed_at;
    renderOrders();
    openOrder(id);
    toast('Pedido marcado como impresso.', 'ok');
  }).catch(oops);
}

async function delOrder(id) {
  const o = findOrder(id);
  if (!o) return;
  if (!confirm(`Excluir o pedido ${o.public_code} de ${o.customer_name}? Essa ação não pode ser desfeita.`)) return;
  try {
    await data.deleteOrder(id);
    closeSheets();
    toast('Pedido excluído.', 'ok');
    await loadOrders();
    loadHome();
  } catch (err) { oops(err); }
}

/** "2x Esfiha de Carne (+ Catupiry); 1x Água Mineral 500ml" */
function orderItemsSummary(o) {
  return (o.order_items || [])
    .map((i) => `${i.quantity}x ${i.product_name_snapshot}${(i.order_item_addons || []).length
      ? ` (+ ${i.order_item_addons.map((a) => a.addon_name_snapshot).join(', ')})` : ''}`)
    .join('; ');
}

async function openOrdersList() {
  try {
    S.listOrders = await data.listOrders({ status: $('#oStatus').value, search: $('#oSearch').value, limit: 5000 });
    renderOrdersList();
    openSheet('#lSheet');
  } catch (err) { oops(err); }
}

function renderOrdersList() {
  const rows = S.listOrders;
  const total = rows.reduce((s, o) => s + o.total_cents, 0);
  $('#lInfo').textContent = rows.length
    ? `${rows.length} pedido(s) · total de ${money(total)}`
    : 'Nenhum pedido encontrado com os filtros atuais.';

  $('#lTable').innerHTML = !rows.length ? '' : `
    <thead><tr>
      <th>Código</th><th>Cliente</th><th>Telefone</th><th>Pedido</th>
      <th>Retirada</th><th>Situação</th><th>Total</th><th>Criado em</th><th>Impresso em</th>
    </tr></thead>
    <tbody>
      ${rows.map((o) => `
        <tr>
          <td>${escapeHtml(o.public_code)}</td>
          <td>${escapeHtml(o.customer_name)}</td>
          <td>${maskPhone(o.customer_phone)}</td>
          <td>${escapeHtml(orderItemsSummary(o))}</td>
          <td>${o.pickup_at ? dateTimeBR(o.pickup_at) : '—'}</td>
          <td>${escapeHtml(o.status)}</td>
          <td class="money">${money(o.total_cents)}</td>
          <td>${dateTimeBR(o.created_at)}</td>
          <td>${o.printed_at ? dateTimeBR(o.printed_at) : '—'}</td>
        </tr>`).join('')}
    </tbody>`;
}

const csvField = (v) => {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function downloadOrdersCsv() {
  const rows = S.listOrders || [];
  if (!rows.length) return toast('Nenhum pedido para exportar.', 'bad');

  const head = ['Código', 'Cliente', 'Telefone', 'Pedido', 'Retirada', 'Situação', 'Total (R$)', 'Criado em', 'Impresso em'];
  const lines = [head.join(';')];
  for (const o of rows) {
    lines.push([
      o.public_code,
      o.customer_name,
      maskPhone(o.customer_phone),
      orderItemsSummary(o),
      o.pickup_at ? dateTimeBR(o.pickup_at) : '',
      o.status,
      (o.total_cents / 100).toFixed(2).replace('.', ','),
      dateTimeBR(o.created_at),
      o.printed_at ? dateTimeBR(o.printed_at) : '',
    ].map(csvField).join(';'));
  }

  // BOM no início para o Excel reconhecer acentuação em UTF-8.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pedidos-jatai-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function changeStatus(id, status) {
  try {
    await data.setOrderStatus(id, status);
    const o = findOrder(id);
    if (o) o.status = status;
    renderOrders();
    openOrder(id);
    loadHome();
    toast('Pedido atualizado.', 'ok');
  } catch (err) { oops(err); }
}

/* ---------------------------------------------------------------- produtos */

async function loadProducts() {
  try { S.products = await data.listProducts(); renderProducts(); } catch (err) { oops(err); }
}

function renderProducts() {
  const term = $('#pSearch').value.trim().toLowerCase();
  const cat = $('#pFilter').value;
  const list = S.products.filter((p) =>
    (!term || p.name.toLowerCase().includes(term) || (p.description || '').toLowerCase().includes(term)) &&
    (!cat || String(p.category_id) === cat));

  $('#products').innerHTML = list.length ? list.map((p) => {
    const promo = p.promo_price_cents > 0 && p.promo_price_cents < p.price_cents;
    return `
    <article class="row ${p.available ? '' : 'off'}" data-p="${p.id}">
      <div class="row__ph">${p.image ? `<img src="${escapeHtml(p.image)}" alt="" loading="lazy">` : '🥟'}</div>
      <div>
        <div class="row__t">${escapeHtml(p.name)}
          ${p.available ? '' : '<span class="tag tag--off">Esgotado</span>'}
          ${p.featured ? '<span class="tag tag--promo">🔥 Destaque</span>' : ''}
        </div>
        ${p.description ? `<p class="row__d">${escapeHtml(p.description)}</p>` : ''}
        <div class="row__m">
          <span class="tag tag--p money">${money(promo ? p.promo_price_cents : p.price_cents)}</span>
          ${promo ? `<span class="tag tag--promo">promo</span>` : ''}
          <span class="tag">${escapeHtml(p.category_name || 'Sem categoria')}</span>
        </div>
      </div>
      <div class="row__a">
        <label class="sw" title="Disponível"><input type="checkbox" data-av="${p.id}" ${p.available ? 'checked' : ''}><span class="sw__t"></span></label>
        <button class="mini" data-edit="${p.id}">Editar</button>
        <button class="mini mini--bad" data-del="${p.id}">Excluir</button>
      </div>
    </article>`;
  }).join('') : `<div class="empty-box"><div class="empty-box__ic">🥟</div>
      ${S.products.length ? 'Nenhum produto encontrado.' : 'Clique em “Novo” para começar o cardápio.'}</div>`;
}

async function openProduct(p = null) {
  S.editP = p?.id ?? null;
  S.pImage = p?.image || '';

  $('#pTitle').textContent = p ? 'Editar produto' : 'Novo produto';
  $('#pName').value = p?.name || '';
  $('#pDesc').value = p?.description || '';
  $('#pPrice').value = p ? (p.price_cents / 100).toFixed(2).replace('.', ',') : '';
  $('#pPromo').value = p?.promo_price_cents ? (p.promo_price_cents / 100).toFixed(2).replace('.', ',') : '';
  $('#pStart').value = p?.promo_start ? p.promo_start.slice(0, 10) : '';
  $('#pEnd').value = p?.promo_end ? p.promo_end.slice(0, 10) : '';
  $('#pUnit').value = p?.unit || 'unidade';
  $('#pOrder').value = p?.sort_order ?? '';
  $('#pAvail').checked = p ? Boolean(p.available) : true;
  $('#pFeat').checked = p ? Boolean(p.featured) : false;

  $('#pCat').innerHTML = '<option value="">Sem categoria</option>' +
    S.cats.map((c) => `<option value="${c.id}" ${p?.category_id === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
  if (!p && S.cats.length) $('#pCat').value = String(S.cats[0].id);

  const linked = p ? await data.getProductGroups(p.id).catch(() => []) : [];
  $('#pGroups').innerHTML = S.groups.length ? S.groups.map((g) => `
    <label class="aopt ${linked.includes(g.id) ? 'is-on' : ''}" data-g="${g.id}">
      <input type="checkbox" ${linked.includes(g.id) ? 'checked' : ''}>
      <span class="aopt__box" aria-hidden="true"></span>
      <span class="aopt__n">${escapeHtml(g.name)}</span>
      <span class="aopt__p">${g.addons.length} itens</span>
    </label>`).join('')
    : '<p style="font-size:13px;color:var(--ink-faint);margin:0">Crie grupos na aba Adicionais.</p>';

  previewImage();
  hideAlert('#pErr');
  openSheet('#pSheet');
}

async function saveProduct(e) {
  e.preventDefault();
  const btn = $('#pSave');
  const price = parseMoney($('#pPrice').value);
  const promoRaw = $('#pPromo').value.trim();
  const promo = promoRaw ? parseMoney(promoRaw) : null;

  if (!$('#pName').value.trim()) return showAlert('#pErr', 'Informe o nome do produto.');
  if (!Number.isFinite(price) || price < 0) return showAlert('#pErr', 'Informe um preço válido, por exemplo 8,00.');
  if (promoRaw && (!Number.isFinite(promo) || promo <= 0)) return showAlert('#pErr', 'Preço promocional inválido.');
  if (promo && promo >= price) return showAlert('#pErr', 'O preço promocional precisa ser menor que o normal.');

  const payload = {
    name: $('#pName').value.trim(),
    description: $('#pDesc').value.trim(),
    price_cents: price,
    promo_price_cents: promo,
    promo_start: $('#pStart').value ? new Date(`${$('#pStart').value}T00:00:00`).toISOString() : null,
    promo_end: $('#pEnd').value ? new Date(`${$('#pEnd').value}T23:59:59`).toISOString() : null,
    unit: $('#pUnit').value.trim() || 'unidade',
    category_id: $('#pCat').value ? Number($('#pCat').value) : null,
    image: S.pImage,
    available: $('#pAvail').checked,
    featured: $('#pFeat').checked,
  };
  const ord = $('#pOrder').value;
  if (ord !== '') payload.sort_order = Number(ord);

  btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    const saved = S.editP
      ? await data.updateProduct(S.editP, payload)
      : await data.createProduct(payload);

    const groups = $$('#pGroups .aopt.is-on').map((el) => Number(el.dataset.g));
    await data.setProductGroups(saved.id, groups);

    closeSheets();
    toast(S.editP ? 'Produto atualizado.' : 'Produto cadastrado.', 'ok');
    await loadProducts();
    loadHome();
  } catch (err) {
    if (!guard(err)) showAlert('#pErr', err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Salvar';
  }
}

async function delProduct(id) {
  const p = S.products.find((x) => x.id === id);
  if (!p || !confirm(`Excluir "${p.name}" do cardápio? Essa ação não pode ser desfeita.`)) return;
  try { await data.deleteProduct(id); toast('Produto excluído.', 'ok'); await loadProducts(); loadHome(); }
  catch (err) { oops(err); }
}

async function toggleAvail(id, on) {
  try {
    await data.updateProduct(id, { available: on });
    const p = S.products.find((x) => x.id === id);
    if (p) p.available = on;
    renderProducts(); loadHome();
    toast(on ? 'Disponível no cardápio.' : 'Escondido do cardápio.', 'ok');
  } catch (err) { oops(err); await loadProducts(); }
}

/* ------------------------------------------------------------------ fotos */

function previewImage() {
  $('#pPrev').innerHTML = S.pImage ? `<img src="${escapeHtml(S.pImage)}" alt="">` : '📷';
  $('#pDel').hidden = !S.pImage;
}

async function upload(file, onDone, btnSel, errSel) {
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) return showAlert(errSel, 'Essa imagem é grande demais.');
  const btn = $(btnSel);
  btn.disabled = true; btn.textContent = 'Enviando…';
  hideAlert(errSel);
  try {
    onDone(await data.uploadImage(await shrinkImage(file)));
  } catch (err) {
    if (!guard(err)) showAlert(errSel, err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Escolher foto';
  }
}

/* ------------------------------------------------------------- categorias */

async function loadCats() {
  try {
    S.cats = await data.listCategories();
    $('#cats').innerHTML = S.cats.length ? S.cats.map((c) => `
      <article class="row ${c.active ? '' : 'off'}" data-c="${c.id}">
        <div class="row__ph" style="font-size:24px">${categoryIconHtml(c.icon, '🗂️')}</div>
        <div>
          <div class="row__t">${escapeHtml(c.name)} ${c.active ? '' : '<span class="tag tag--off">Oculta</span>'}</div>
          <div class="row__m"><span>${c.product_count} produtos</span><span>ordem ${c.sort_order}</span></div>
        </div>
        <div class="row__a">
          <button class="mini" data-ec="${c.id}">Editar</button>
          <button class="mini mini--bad" data-dc="${c.id}">Excluir</button>
        </div>
      </article>`).join('')
      : `<div class="empty-box"><div class="empty-box__ic">🗂️</div>Crie categorias como “Esfihas Salgadas” e “Bebidas”.</div>`;

    const f = $('#pFilter'); const cur = f.value;
    f.innerHTML = '<option value="">Todas as categorias</option>' +
      S.cats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    f.value = cur;
  } catch (err) { oops(err); }
}

function openCat(c = null) {
  S.editC = c?.id ?? null;
  S.cIcon = c?.icon && isImageIcon(c.icon) ? c.icon : '';
  $('#cTitle').textContent = c ? 'Editar categoria' : 'Nova categoria';
  $('#cName').value = c?.name || '';
  $('#cIcon').value = c?.icon && !isImageIcon(c.icon) ? c.icon : '';
  $('#cOrder').value = c?.sort_order ?? '';
  $('#cActive').checked = c ? Boolean(c.active) : true;
  previewCatIcon();
  hideAlert('#cErr');
  openSheet('#cSheet');
}

/** Uma foto enviada substitui o emoji digitado. */
function previewCatIcon() {
  $('#cIconPrev').innerHTML = S.cIcon
    ? `<img src="${escapeHtml(S.cIcon)}" alt="">`
    : escapeHtml($('#cIcon').value.trim() || '🗂️');
  $('#cIconDel').hidden = !S.cIcon;
}

async function saveCat(e) {
  e.preventDefault();
  const name = $('#cName').value.trim();
  if (!name) return showAlert('#cErr', 'Informe o nome da categoria.');
  const payload = { name, icon: S.cIcon || $('#cIcon').value.trim(), active: $('#cActive').checked };
  const ord = $('#cOrder').value;
  if (ord !== '') payload.sort_order = Number(ord);
  try {
    if (S.editC) await data.updateCategory(S.editC, payload);
    else await data.createCategory(payload);
    closeSheets();
    toast(S.editC ? 'Categoria atualizada.' : 'Categoria criada.', 'ok');
    await Promise.all([loadCats(), loadProducts()]);
  } catch (err) { if (!guard(err)) showAlert('#cErr', err.message); }
}

async function delCat(id) {
  const c = S.cats.find((x) => x.id === id);
  if (!c) return;
  const msg = c.product_count
    ? `"${c.name}" tem ${c.product_count} produto(s). Eles ficarão sem categoria. Excluir?`
    : `Excluir a categoria "${c.name}"?`;
  if (!confirm(msg)) return;
  try { await data.deleteCategory(id); toast('Categoria excluída.', 'ok'); await Promise.all([loadCats(), loadProducts()]); }
  catch (err) { oops(err); }
}

/* -------------------------------------------------------------- adicionais */

async function loadGroups() {
  try {
    S.groups = await data.listAddonGroups();
    $('#groups').innerHTML = S.groups.length ? S.groups.map((g) => `
      <article class="row ${g.active ? '' : 'off'}">
        <div class="row__ph" style="font-size:22px">➕</div>
        <div>
          <div class="row__t">${escapeHtml(g.name)}
            ${g.required ? '<span class="tag tag--promo">obrigatório</span>' : ''}
            ${g.active ? '' : '<span class="tag tag--off">inativo</span>'}</div>
          <p class="row__d">${g.addons.map((a) => `${escapeHtml(a.name)} (${money(a.price_cents)})`).join(' · ') || 'sem itens'}</p>
          <div class="row__m"><span>${g.product_count} produtos usam</span><span>até ${g.max_choices} escolha(s)</span></div>
        </div>
        <div class="row__a">
          <button class="mini" data-eg="${g.id}">Editar</button>
          <button class="mini mini--bad" data-dg="${g.id}">Excluir</button>
        </div>
      </article>`).join('')
      : `<div class="empty-box"><div class="empty-box__ic">➕</div>Crie um grupo como “Adicione um extra”.</div>`;
  } catch (err) { oops(err); }
}

function openGroup(g = null) {
  S.editG = g?.id ?? null;
  S.gItems = g ? g.addons.map((a) => ({ ...a })) : [];
  $('#gTitle').textContent = g ? 'Editar grupo' : 'Novo grupo';
  $('#gName').value = g?.name || '';
  $('#gMin').value = g?.min_choices ?? 0;
  $('#gMax').value = g?.max_choices ?? 1;
  $('#gReq').checked = g ? Boolean(g.required) : false;
  $('#gActive').checked = g ? Boolean(g.active) : true;
  renderGItems();
  hideAlert('#gErr');
  openSheet('#gSheet');
}

function renderGItems() {
  $('#gItems').innerHTML = S.gItems.map((a, i) => `
    <div style="display:flex;gap:8px;margin-bottom:7px;align-items:center">
      <input class="in" data-gn="${i}" value="${escapeHtml(a.name)}" placeholder="Nome" style="flex:2;min-height:42px">
      <input class="in" data-gp="${i}" value="${(a.price_cents / 100).toFixed(2).replace('.', ',')}"
             inputmode="decimal" placeholder="0,00" style="flex:1;min-height:42px">
      <button class="mini mini--bad" type="button" data-gr="${i}" aria-label="Remover">✕</button>
    </div>`).join('');
}

async function saveGroup(e) {
  e.preventDefault();
  const name = $('#gName').value.trim();
  if (!name) return showAlert('#gErr', 'Informe o nome do grupo.');

  // Lê os itens direto dos campos, para não perder edição não confirmada.
  const items = S.gItems.map((a, i) => ({
    ...a,
    name: ($(`[data-gn="${i}"]`)?.value || '').trim(),
    price_cents: parseMoney($(`[data-gp="${i}"]`)?.value || '0') || 0,
  })).filter((a) => a.name);

  if (!items.length) return showAlert('#gErr', 'Adicione pelo menos um item ao grupo.');

  try {
    const g = await data.saveAddonGroup(S.editG, {
      name,
      required: $('#gReq').checked,
      active: $('#gActive').checked,
      min_choices: Math.max(0, Number($('#gMin').value) || 0),
      max_choices: Math.max(1, Number($('#gMax').value) || 1),
    });

    const original = S.groups.find((x) => x.id === g.id)?.addons || [];
    const keep = new Set(items.filter((a) => a.id).map((a) => a.id));
    for (const old of original) if (!keep.has(old.id)) await data.deleteAddon(old.id);
    for (const [i, a] of items.entries()) {
      await data.saveAddon(a.id || null, {
        group_id: g.id, name: a.name, price_cents: a.price_cents, active: true, sort_order: i + 1,
      });
    }

    closeSheets();
    toast('Grupo salvo.', 'ok');
    await loadGroups();
  } catch (err) { if (!guard(err)) showAlert('#gErr', err.message); }
}

async function delGroup(id) {
  const g = S.groups.find((x) => x.id === id);
  if (!g || !confirm(`Excluir o grupo "${g.name}" e seus itens?`)) return;
  try { await data.deleteAddonGroup(id); toast('Grupo excluído.', 'ok'); await loadGroups(); }
  catch (err) { oops(err); }
}

/* ---------------------------------------------------------- configurações */

async function loadSettings() {
  try { S.settings = await data.getSettings(); renderSettings(); } catch (err) { oops(err); }
}

function renderSettings() {
  const s = S.settings;
  $('#sName').value = s.store_name;
  $('#sHead').value = s.headline;
  $('#sAddr').value = s.address;
  $('#sInsta').value = s.instagram;
  $('#sPrep').value = s.prep_time_note;
  $('#sWhats').value = maskPhone(String(s.whatsapp).replace(/^55/, ''));
  $('#ann').value = s.announcement;
  $('#annOn').checked = s.announcement_active;
  $('#accepting').checked = s.accepting_orders;
  $('#acceptingL').textContent = s.accepting_orders ? 'Aceitando pedidos' : 'Pedidos pausados';
  $('#closedMsg').value = s.closed_message;
  $('#lead').value = s.lead_minutes;
  $('#slot').value = s.slot_minutes;
  $('#cutoff').value = s.order_cutoff_days;
  $('#minOrder').value = (s.min_order_cents / 100).toFixed(2).replace('.', ',');
  $('#cPrimary').value = s.primary_color || PADRAO.primary;
  $('#cAccent').value = s.accent_color || PADRAO.accent;
  S.logo = s.logo_url || '';
  $('#logoPrev').innerHTML = S.logo ? `<img src="${escapeHtml(S.logo)}" alt="">` : '🥟';
  $('#logoDel').hidden = !S.logo;

  S.eventDays = (s.event_days || []).map((d) => ({ ...d }));
  renderEventDays();
}

function renderEventDays() {
  $('#eventDays').innerHTML = S.eventDays.length ? S.eventDays.map((d, i) => `
    <div class="erow" data-i="${i}">
      <input class="in" data-ed="${i}" type="date" value="${d.date || ''}" aria-label="Data do evento">
      <input class="in" data-eo="${i}" type="time" value="${d.open || '18:00'}" aria-label="Horário de abertura">
      <input class="in" data-ec="${i}" type="time" value="${d.close || '22:30'}" aria-label="Horário de fechamento">
      <button class="mini mini--bad" type="button" data-er="${i}" aria-label="Remover dia">✕</button>
    </div>`).join('')
    : '<p style="font-size:13px;color:var(--ink-faint);margin:0">Nenhum dia de evento cadastrado ainda.</p>';
}

/** Lê os campos direto do DOM, para não perder edição não confirmada. */
function readEventDaysFromDom() {
  return S.eventDays.map((d, i) => ({
    date: $(`[data-ed="${i}"]`)?.value || '',
    open: $(`[data-eo="${i}"]`)?.value || '18:00',
    close: $(`[data-ec="${i}"]`)?.value || '22:30',
  }));
}

async function saveSettings(e) {
  e.preventDefault();
  const btn = $('#setBtn');
  hideAlert('#setOk'); hideAlert('#setErr');

  const wa = onlyDigits($('#sWhats').value);
  if (wa.length < 10) return showAlert('#setErr', 'Informe o WhatsApp com DDD, por exemplo (15) 99736-5401.');

  const min = $('#minOrder').value.trim() === '' ? 0 : parseMoney($('#minOrder').value);
  if (!Number.isFinite(min) || min < 0) return showAlert('#setErr', 'Pedido mínimo inválido.');

  const eventDays = readEventDaysFromDom().filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date));

  btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    S.settings = await data.saveSettings({
      store_name: $('#sName').value.trim(),
      headline: $('#sHead').value.trim(),
      address: $('#sAddr').value.trim(),
      instagram: $('#sInsta').value.trim().replace(/^@/, ''),
      prep_time_note: $('#sPrep').value.trim(),
      whatsapp: wa.startsWith('55') ? wa : `55${wa}`,
      announcement: $('#ann').value.trim(),
      announcement_active: $('#annOn').checked,
      accepting_orders: $('#accepting').checked,
      closed_message: $('#closedMsg').value.trim(),
      lead_minutes: Number($('#lead').value) || 0,
      slot_minutes: Number($('#slot').value) || 15,
      order_cutoff_days: Number($('#cutoff').value) || 0,
      min_order_cents: min,
      event_days: eventDays,
    });
    renderSettings();
    showAlert('#setOk');
    toast('Configurações salvas.', 'ok');
  } catch (err) {
    if (!guard(err)) showAlert('#setErr', err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Salvar';
  }
}

/* ------------------------------------------------------------- aparência */

/** Luminância relativa — impede escolher cor clara demais para texto branco. */
function contrastOk(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05 / (lum + 0.05)) >= 3.2;   // contraste mínimo com branco
}

async function saveVisual(e) {
  e.preventDefault();
  hideAlert('#visOk'); hideAlert('#visErr');

  const primary = $('#cPrimary').value;
  if (!contrastOk(primary)) {
    return showAlert('#visErr', 'Essa cor principal é clara demais: o texto branco em cima dela ficaria ilegível. Escolha um tom mais escuro.');
  }
  try {
    S.settings = await data.saveSettings({
      primary_color: primary,
      accent_color: $('#cAccent').value,
      logo_url: S.logo,
    });
    showAlert('#visOk');
    toast('Aparência salva.', 'ok');
  } catch (err) { if (!guard(err)) showAlert('#visErr', err.message); }
}

/* ----------------------------------------------------------------- senha */

async function changePw(e) {
  e.preventDefault();
  hideAlert('#pwErr'); hideAlert('#pwOk');
  const cur = $('#pwCur').value, next = $('#pwNew').value;
  if (next.length < 6) return showAlert('#pwErr', 'A nova senha precisa ter pelo menos 6 caracteres.');
  if (next !== $('#pwRep').value) return showAlert('#pwErr', 'As senhas não conferem.');
  try {
    await data.changePassword(cur, next);
    $('#pwForm').reset();
    showAlert('#pwOk');
  } catch (err) { showAlert('#pwErr', err.message); }
}

/* ----------------------------------------------------------------- apoio */

function showAlert(sel, msg) {
  const el = $(sel);
  if (msg) el.textContent = msg;
  el.classList.add('is-on');
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
const hideAlert = (sel) => $(sel).classList.remove('is-on');

function openSheet(sel) {
  $$('.sheet').forEach((s) => { s.classList.remove('is-on'); s.setAttribute('aria-hidden', 'true'); });
  $(sel).classList.add('is-on');
  $(sel).setAttribute('aria-hidden', 'false');
  $('#scrim').classList.add('is-on');
  document.body.classList.add('sheet-open');
  document.body.style.overflow = 'hidden';
}
function closeSheets() {
  $$('.sheet').forEach((s) => { s.classList.remove('is-on'); s.setAttribute('aria-hidden', 'true'); });
  $('#scrim').classList.remove('is-on');
  document.body.classList.remove('sheet-open');
  document.body.style.overflow = '';
}

/* --------------------------------------------------------------- eventos */

function bind() {
  $('#loginForm').addEventListener('submit', doLogin);
  $('#logout').addEventListener('click', async () => { await data.signOut().catch(() => {}); location.reload(); });
  $('#scrim').addEventListener('click', closeSheets);
  document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheets(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });

  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    $$('.nav__b').forEach((x) => x.classList.toggle('is-on', x === b));
    $$('.pane').forEach((p) => p.classList.toggle('is-on', p.dataset.pane === b.dataset.p));
    if (b.dataset.p === 'pedidos') loadOrders();
    if (b.dataset.p === 'home') loadHome();
    window.scrollTo({ top: 0 });
  });

  // Pedidos
  let ot;
  $('#oSearch').addEventListener('input', () => { clearTimeout(ot); ot = setTimeout(loadOrders, 260); });
  $('#oStatus').addEventListener('change', loadOrders);
  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) return openOrder(Number(open.dataset.open));
    const st = e.target.closest('[data-st]');
    if (st) return changeStatus(Number(st.dataset.oid), st.dataset.st);
    const delo = e.target.closest('[data-delo]');
    if (delo) return delOrder(Number(delo.dataset.delo));
    const pr = e.target.closest('[data-print]');
    if (pr) return printOrder(Number(pr.dataset.print));
  });

  // Produtos
  $('#newProduct').addEventListener('click', () => openProduct());
  $('#pSearch').addEventListener('input', renderProducts);
  $('#pFilter').addEventListener('change', renderProducts);
  $('#pForm').addEventListener('submit', saveProduct);
  $('#products').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) return openProduct(S.products.find((p) => p.id === Number(ed.dataset.edit)));
    const de = e.target.closest('[data-del]');
    if (de) return delProduct(Number(de.dataset.del));
  });
  $('#products').addEventListener('change', (e) => {
    const av = e.target.closest('[data-av]');
    if (av) toggleAvail(Number(av.dataset.av), av.checked);
  });

  // Adicionais vinculados dentro da folha de produto
  $('#pGroups').addEventListener('click', (e) => {
    const l = e.target.closest('.aopt');
    if (!l) return;
    e.preventDefault();
    const on = !l.classList.contains('is-on');
    l.classList.toggle('is-on', on);
    l.querySelector('input').checked = on;
  });

  // Fotos
  $('#pPick').addEventListener('click', () => $('#pFile').click());
  $('#pFile').addEventListener('change', (e) =>
    upload(e.target.files?.[0], (url) => { S.pImage = url; previewImage(); }, '#pPick', '#pErr')
      .finally(() => { $('#pFile').value = ''; }));
  $('#pDel').addEventListener('click', () => { S.pImage = ''; previewImage(); });

  $('#logoPick').addEventListener('click', () => $('#logoFile').click());
  $('#logoFile').addEventListener('change', (e) =>
    upload(e.target.files?.[0], (url) => {
      S.logo = url;
      $('#logoPrev').innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
      $('#logoDel').hidden = false;
    }, '#logoPick', '#visErr').finally(() => { $('#logoFile').value = ''; }));
  $('#logoDel').addEventListener('click', () => {
    S.logo = ''; $('#logoPrev').innerHTML = '🥟'; $('#logoDel').hidden = true;
  });

  // Categorias
  $('#newCat').addEventListener('click', () => openCat());
  $('#cForm').addEventListener('submit', saveCat);
  $('#cats').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-ec]');
    if (ed) return openCat(S.cats.find((c) => c.id === Number(ed.dataset.ec)));
    const de = e.target.closest('[data-dc]');
    if (de) return delCat(Number(de.dataset.dc));
  });
  $('#cIcon').addEventListener('input', () => { if (!S.cIcon) previewCatIcon(); });
  $('#cIconPick').addEventListener('click', () => $('#cIconFile').click());
  $('#cIconFile').addEventListener('change', (e) =>
    upload(e.target.files?.[0], (url) => { S.cIcon = url; previewCatIcon(); }, '#cIconPick', '#cErr')
      .finally(() => { $('#cIconFile').value = ''; }));
  $('#cIconDel').addEventListener('click', () => { S.cIcon = ''; previewCatIcon(); });

  // Grupos de adicionais
  $('#newGroup').addEventListener('click', () => openGroup());
  $('#gForm').addEventListener('submit', saveGroup);
  $('#groups').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-eg]');
    if (ed) return openGroup(S.groups.find((g) => g.id === Number(ed.dataset.eg)));
    const de = e.target.closest('[data-dg]');
    if (de) return delGroup(Number(de.dataset.dg));
  });
  $('#gAddItem').addEventListener('click', () => {
    S.gItems.push({ name: '', price_cents: 0 });
    renderGItems();
  });
  $('#gItems').addEventListener('click', (e) => {
    const r = e.target.closest('[data-gr]');
    if (!r) return;
    // Preserva o que já foi digitado antes de remover a linha.
    S.gItems = S.gItems.map((a, i) => ({
      ...a,
      name: ($(`[data-gn="${i}"]`)?.value || '').trim(),
      price_cents: parseMoney($(`[data-gp="${i}"]`)?.value || '0') || 0,
    })).filter((_, i) => i !== Number(r.dataset.gr));
    renderGItems();
  });

  // Loja
  $('#setForm').addEventListener('submit', saveSettings);
  $('#sWhats').addEventListener('input', (e) => { e.target.value = maskPhone(e.target.value); });
  $('#accepting').addEventListener('change', (e) => {
    $('#acceptingL').textContent = e.target.checked ? 'Aceitando pedidos' : 'Pedidos pausados';
  });
  $('#addEventDay').addEventListener('click', () => {
    S.eventDays = readEventDaysFromDom();
    S.eventDays.push({ date: '', open: '18:00', close: '22:30' });
    renderEventDays();
  });
  $('#eventDays').addEventListener('click', (e) => {
    const r = e.target.closest('[data-er]');
    if (!r) return;
    S.eventDays = readEventDaysFromDom().filter((_, i) => i !== Number(r.dataset.er));
    renderEventDays();
  });

  // Lista completa de pedidos
  $('#openList').addEventListener('click', openOrdersList);
  $('#lPrint').addEventListener('click', () => window.print());
  $('#lCsv').addEventListener('click', downloadOrdersCsv);

  // Aparência e conta
  $('#visForm').addEventListener('submit', saveVisual);
  $('#resetColors').addEventListener('click', () => {
    $('#cPrimary').value = PADRAO.primary;
    $('#cAccent').value = PADRAO.accent;
  });
  $('#pwForm').addEventListener('submit', changePw);
}
