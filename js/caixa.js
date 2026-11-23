/* =============================================================================
   Caixa — app do balcão: o atendente monta o pedido do cliente que chegou e
   imprime na hora. Funciona 100% sem internet depois da primeira
   sincronização do cardápio (que precisa de internet uma vez só).

   Nunca fala com o banco além da sincronização do cardápio: todo pedido feito
   aqui fica só neste aparelho (localStorage), com numeração própria — não é
   o mesmo pedido/código do site, de propósito, pra não competir com ele.
   ========================================================================== */

import { $, $$, categoryIconHtml, dateTimeBR, escapeHtml, maskPhone, money, toast } from './utils.js?v=25';
import * as cart from './caixa-cart.js?v=25';
import { ESFIHA, placeholder } from './icons.js?v=25';

/* fetchCatalog (e tudo que ele puxa: supabase-js vindo de CDN) só é importado
   na hora de sincronizar — assim abrir o app nunca depende de internet nem
   fica esperando uma conexão que pode não existir no balcão. */

const CATALOG_KEY = 'jt_caixa_catalog_v1';
const ORDERS_KEY = 'jt_caixa_orders_v1';

const state = {
  store: null,
  categories: [],
  products: [],
  filter: '',
  opt: null,
  optPicked: new Map(),
  syncing: false,
};

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

init();

async function init() {
  bind();
  cart.subscribe(onCart);

  const cached = loadCatalogCache();
  if (cached) applyCatalog(cached, { silent: true });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw-caixa.js', { scope: '/caixa.html' })
      .catch(() => { /* funciona sem SW também, só sem cache automático dos arquivos */ });
  }
}

/* --------------------------------------------------------- cardápio local */

function loadCatalogCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CATALOG_KEY));
    return raw && raw.products ? raw : null;
  } catch {
    return null;
  }
}

function saveCatalogCache(data) {
  try { localStorage.setItem(CATALOG_KEY, JSON.stringify(data)); } catch { /* sem espaço/privado */ }
}

function applyCatalog(data, { silent = false } = {}) {
  state.store = data.store;
  state.categories = data.categories;
  state.products = data.products;
  applyTheme();
  $('#storeName').textContent = state.store?.name || 'Esfiharia Jataí';
  $('#syncInfo').textContent = data.syncedAt
    ? `Cardápio de ${dateTimeBR(data.syncedAt)}`
    : 'Cardápio ainda não sincronizado';

  const diasDesdeSync = data.syncedAt ? (Date.now() - new Date(data.syncedAt).getTime()) / 86400000 : 0;
  $('#noticeSlot').innerHTML = diasDesdeSync > 3
    ? `<div class="notice"><span aria-hidden="true">📣</span><span>Esse cardápio tem ${Math.floor(diasDesdeSync)} dias — sincronize de novo quando tiver internet, pra garantir preços e disponibilidade em dia.</span></div>`
    : '';

  const dropped = cart.reconcile(state.products);
  if (dropped && !silent) toast('Alguns itens saíram do cardápio e foram removidos do pedido.', 'bad');
  renderMenu();
}

function applyTheme() {
  const s = state.store;
  if (!s) return;
  const root = document.documentElement.style;
  if (isColor(s.primary_color)) root.setProperty('--brand', s.primary_color);
  if (isColor(s.accent_color)) root.setProperty('--accent', s.accent_color);
}
const isColor = (v) => /^#[0-9a-f]{3,8}$/i.test(String(v || '').trim());

async function syncCatalog() {
  if (state.syncing) return;
  state.syncing = true;
  const btns = [$('#btnSync'), $('#firstSync')].filter(Boolean);
  btns.forEach((b) => { b.disabled = true; b.dataset.old = b.textContent; b.textContent = 'Sincronizando…'; });
  try {
    const { fetchCatalog } = await import('./data.js?v=25');
    const data = await fetchCatalog();
    const withStamp = { ...data, syncedAt: new Date().toISOString() };
    saveCatalogCache(withStamp);
    applyCatalog(withStamp);
    toast('Cardápio sincronizado!', 'ok');
  } catch (err) {
    toast(err.message || 'Sem internet pra sincronizar agora. O cardápio salvo continua funcionando.', 'bad');
  } finally {
    state.syncing = false;
    btns.forEach((b) => { b.disabled = false; b.textContent = b.dataset.old === '🔄 Sincronizar agora' ? b.dataset.old : '🔄 Sincronizar'; });
  }
}

/* ------------------------------------------------------------------ menu */

function semFoto(p) {
  const cat = state.categories.find((c) => c.id === p.category_id)?.name || '';
  return placeholder(cat, p.unit);
}

function groupedMenu() {
  const term = state.filter.toLowerCase().trim();
  const match = (p) =>
    !term ||
    p.name.toLowerCase().includes(term) ||
    (p.description || '').toLowerCase().includes(term) ||
    (state.categories.find((c) => c.id === p.category_id)?.name || '').toLowerCase().includes(term);

  const visible = state.products.filter(match);
  const groups = [];

  const featured = visible.filter((p) => p.featured);
  if (featured.length && !term) groups.push({ id: 'top', name: 'Mais pedidos', icon: '🔥', products: featured });

  for (const c of state.categories) {
    const products = visible.filter((p) => p.category_id === c.id);
    if (products.length) groups.push({ ...c, products });
  }

  const orphans = visible.filter((p) => !state.categories.some((c) => c.id === p.category_id));
  if (orphans.length) groups.push({ id: 'outros', name: 'Outros', icon: '✨', products: orphans });

  return groups;
}

function renderMenu() {
  if (!state.products.length) return; // mantém o aviso de 1ª sincronização no HTML
  const groups = groupedMenu();

  if (!groups.length) {
    $('#cats').innerHTML = '';
    $('#menu').innerHTML = `<div class="empty"><div class="empty__ic">🔎</div><strong>Não encontramos esse sabor.</strong>
      <p>Tente outra busca.</p></div>`;
    return;
  }

  $('#cats').innerHTML = groups
    .map((g) => `<button class="cats__item" data-cat="${g.id}">${categoryIconHtml(g.icon, '🍽️')} ${escapeHtml(g.name)}</button>`)
    .join('');

  $('#menu').innerHTML = groups
    .map((g) => `
      <section class="sec" id="sec-${g.id}">
        <div class="sec__h">
          <h2>${categoryIconHtml(g.icon, '🍽️')} ${escapeHtml(g.name)}</h2>
          <span>${g.products.length}</span>
        </div>
        <div class="list">${g.products.map(card).join('')}</div>
      </section>`)
    .join('');

  syncCards();
  watchSections();
}

function card(p) {
  const media = p.image
    ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async" width="88" height="88">`
    : semFoto(p);

  return `
    <article class="item" data-p="${p.id}">
      <div class="item__ph">
        ${media}
        ${p.promo ? '<span class="item__flag">Promo</span>' : ''}
      </div>
      <div class="item__b">
        <h3 class="item__n">${escapeHtml(p.name)}</h3>
        ${p.description ? `<p class="item__d">${escapeHtml(p.description)}</p>` : ''}
        ${p.unit && p.unit !== 'unidade' ? `<span class="item__u">${escapeHtml(p.unit)}</span>` : ''}
        ${p.addonGroups.length ? '<span class="item__x">＋ adicionais</span>' : ''}
        <div class="item__f">
          <span class="item__p">
            <span class="item__price money">${money(p.cents)}</span>
            ${p.was ? `<span class="item__was money">${money(p.was)}</span>` : ''}
          </span>
          <span data-slot></span>
        </div>
      </div>
    </article>`;
}

function syncCards() {
  for (const el of $$('.item[data-p]')) {
    const id = Number(el.dataset.p);
    const qty = cart.qtyOfProduct(id);
    const slot = $('[data-slot]', el);
    el.classList.toggle('is-on', qty > 0);

    slot.innerHTML = qty > 0
      ? `<span class="qty">
           <button type="button" data-step="-1" aria-label="Diminuir">−</button>
           <span class="qty__v">${qty}</span>
           <button type="button" data-step="1" aria-label="Aumentar">+</button>
         </span>`
      : '<button type="button" class="add" data-add>Adicionar</button>';
  }
}

function watchSections() {
  const links = $$('.cats__item');
  if (!links.length) return;
  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const id = e.target.id.replace('sec-', '');
      links.forEach((l) => l.classList.toggle('is-on', l.dataset.cat === id));
    }
  }, { rootMargin: '-30% 0px -60% 0px' });
  $$('.sec').forEach((s) => obs.observe(s));
}

/* ----------------------------------------------------- folha de adicionais */

function openOptions(product) {
  state.opt = product;
  state.optPicked = new Map();

  $('#optTitle').textContent = product.name;
  $('#optBody').innerHTML = `
    <p style="margin:0 0 16px;color:var(--ink-soft);font-size:14px">${escapeHtml(product.description || '')}</p>
    ${product.addonGroups.map(groupBlock).join('')}
    <div class="f" style="margin-top:6px">
      <label for="optNotes">Observações para esta esfiha <span class="f__hint">(opcional)</span></label>
      <textarea class="in" id="optNotes" maxlength="200" placeholder="Ex.: sem cebola, bem passada…"></textarea>
    </div>`;

  updateOptButton();
  openSheet('#optSheet');
}

function groupBlock(g) {
  const rule = g.required
    ? `<span class="agroup__r req">Obrigatório</span>`
    : `<span class="agroup__r">Opcional · até ${g.max_choices}</span>`;

  return `
    <div class="agroup" data-g="${g.id}">
      <div class="agroup__h"><h4>${escapeHtml(g.name)}</h4>${rule}</div>
      ${g.addons.map((a) => `
        <label class="aopt" data-a="${a.id}" data-price="${a.price_cents}">
          <input type="checkbox" value="${a.id}">
          <span class="aopt__box" aria-hidden="true"></span>
          <span class="aopt__n">${escapeHtml(a.name)}</span>
          <span class="aopt__p ${a.price_cents === 0 ? 'free' : ''} money">${a.price_cents === 0 ? 'grátis' : `+ ${money(a.price_cents)}`}</span>
        </label>`).join('')}
    </div>`;
}

function toggleAddon(label) {
  const g = label.closest('.agroup');
  const groupId = Number(g.dataset.g);
  const group = state.opt.addonGroups.find((x) => x.id === groupId);
  const id = Number(label.dataset.a);
  const picked = state.optPicked.get(groupId) || new Set();

  if (picked.has(id)) {
    picked.delete(id);
  } else {
    if (group.max_choices === 1) picked.clear();
    else if (picked.size >= group.max_choices) {
      return toast(`Escolha no máximo ${group.max_choices} em "${group.name}".`, 'bad');
    }
    picked.add(id);
  }
  state.optPicked.set(groupId, picked);

  $$('.aopt', g).forEach((el) => el.classList.toggle('is-on', picked.has(Number(el.dataset.a))));
  $$('input', g).forEach((el) => { el.checked = picked.has(Number(el.value)); });
  updateOptButton();
}

function pickedAddons() {
  const out = [];
  for (const g of state.opt.addonGroups) {
    for (const id of state.optPicked.get(g.id) || []) {
      const a = g.addons.find((x) => x.id === id);
      if (a) out.push(a);
    }
  }
  return out;
}

function updateOptButton() {
  const extra = pickedAddons().reduce((s, a) => s + a.price_cents, 0);
  $('#optAdd').textContent = `Adicionar · ${money(state.opt.cents + extra)}`;
}

function missingRequired() {
  return state.opt.addonGroups.find((g) => {
    const n = (state.optPicked.get(g.id) || new Set()).size;
    return g.required && n < Math.max(1, g.min_choices);
  });
}

function confirmOptions() {
  const missing = missingRequired();
  if (missing) return toast(`Escolha uma opção em "${missing.name}".`, 'bad');
  const notes = $('#optNotes')?.value.trim() || '';
  cart.add(state.opt, { addons: pickedAddons(), notes });
  closeSheets();
  toast(`${state.opt.name} adicionada`, 'ok');
}

/* ---------------------------------------------------------------- carrinho */

function onCart() {
  const n = cart.count();
  const total = cart.totalCents();

  $('#cartCount').textContent = `${n} ${n === 1 ? 'item' : 'itens'}`;
  $('#cartTotal').textContent = money(total);
  $('#cartItems').textContent = `${n} ${n === 1 ? 'item' : 'itens'}`;
  $('#cartSub').textContent = money(total);
  $('#cartBig').textContent = money(total);
  $('#cartFoot').hidden = n === 0;

  const bar = $('#cartbar');
  bar.classList.toggle('is-up', n > 0);
  document.body.classList.toggle('cart-up', n > 0);

  renderCart();
  syncCards();
}

function renderCart() {
  const body = $('#cartBody');
  const items = cart.getItems();

  if (!items.length) {
    body.innerHTML = `
      <div class="empty">
        <div class="empty__ic empty__ic--svg">${ESFIHA}</div>
        <strong>Nenhum item ainda.</strong>
        <p>Toque no cardápio para montar o pedido do cliente.</p>
        <p style="margin-top:14px"><button class="btn btn--brand" data-close>VER CARDÁPIO</button></p>
      </div>`;
    return;
  }

  body.innerHTML = items.map((i) => `
    <div class="crow" data-k="${escapeHtml(i.key)}">
      <div class="crow__ph">${i.image
        ? `<img src="${escapeHtml(i.image)}" alt="" loading="lazy">`
        : semFoto(state.products.find((x) => x.id === i.productId) || {})}</div>
      <div>
        <div class="crow__n">${escapeHtml(i.name)}</div>
        <div class="crow__m money">${money(i.unitPriceCents)} cada</div>
        ${i.addons?.length ? `<div class="crow__add">+ ${i.addons.map((a) => escapeHtml(a.name)).join(', ')}</div>` : ''}
        ${i.notes ? `<div class="crow__m">📝 ${escapeHtml(i.notes)}</div>` : ''}
      </div>
      <div class="crow__s">
        <span class="crow__p money">${money(cart.lineTotal(i))}</span>
        <span class="qty qty--soft">
          <button type="button" data-step="-1" aria-label="Diminuir">−</button>
          <span class="qty__v">${i.qty}</span>
          <button type="button" data-step="1" aria-label="Aumentar">+</button>
        </span>
      </div>
    </div>`).join('');
}

/* ---------------------------------------------------------------- checkout */

function openCheckout() {
  if (cart.isEmpty()) return toast('Adicione ao menos um item.', 'bad');
  renderCheckoutSummary();
  openSheet('#coSheet');
}

function renderCheckoutSummary() {
  $('#coSum').innerHTML = `
    ${cart.getItems().map((i) => `
      <div class="sum__r"><span>${i.qty}× ${escapeHtml(i.name)}</span>
      <span class="money">${money(cart.lineTotal(i))}</span></div>`).join('')}
    <div class="sum__r sum__r--tot"><span>Total</span><b class="money">${money(cart.totalCents())}</b></div>`;
}

function finalizeOrder(e) {
  e.preventDefault();
  if (cart.isEmpty()) return toast('Adicione ao menos um item.', 'bad');

  const name = $('#cName').value.trim() || 'Cliente balcão';
  const phone = $('#cPhone').value.trim();
  const notes = $('#cNotes').value.trim();

  const order = {
    number: nextOrderNumber(),
    customer_name: name,
    customer_phone: phone,
    notes,
    items: cart.getItems().map((i) => ({
      qty: i.qty, name: i.name, addons: i.addons, notes: i.notes, cents: cart.lineTotal(i),
    })),
    total_cents: cart.totalCents(),
    created_at: new Date().toISOString(),
  };

  saveLocalOrder(order);
  printOrderTicket(order);

  cart.clear();
  $('#cName').value = ''; $('#cPhone').value = ''; $('#cNotes').value = '';
  closeSheets();
  toast(`Pedido CX-${order.number} impresso.`, 'ok');
}

/* ------------------------------------------------------------ pedidos locais */

function loadAllOrders() {
  try {
    const raw = JSON.parse(localStorage.getItem(ORDERS_KEY));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function saveAllOrders(all) {
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(all)); } catch { /* sem espaço/privado */ }
}

function nextOrderNumber() {
  const all = loadAllOrders();
  const today = all[todayKey()] || [];
  return today.length ? Math.max(...today.map((o) => o.number)) + 1 : 1;
}

function saveLocalOrder(order) {
  const all = loadAllOrders();
  const key = todayKey();
  all[key] = [...(all[key] || []), order];
  saveAllOrders(all);
  updateOrdersBadge();
}

function todayOrders() {
  return loadAllOrders()[todayKey()] || [];
}

function updateOrdersBadge() {
  const n = todayOrders().length;
  $('#ordersBadge').textContent = n ? `(${n})` : '';
}

/* --------------------------------------------------------- recibo impresso */

function ticketItemHtml({ qty, name, addons, notes, cents }) {
  const addonsText = (addons || []).map((a) => a.name).join(', ');
  return `
      <div class="ticket__item">
        <span>${qty}x ${escapeHtml(name)}</span>
        <span>${money(cents)}</span>
      </div>
      ${addonsText ? `<div class="ticket__sub">+ ${escapeHtml(addonsText)}</div>` : ''}
      ${notes ? `<div class="ticket__sub">obs: ${escapeHtml(notes)}</div>` : ''}`;
}

function ticketHtmlForOrder(order) {
  const n = order.items.reduce((s, i) => s + i.qty, 0);
  const items = order.items.map(ticketItemHtml).join('');

  return `
    <div class="ticket__h">${escapeHtml((state.store?.name || 'Esfiharia Jataí').toUpperCase())}</div>
    <div class="ticket__hr"></div>
    <div class="ticket__label">Cliente</div>
    <div class="ticket__big">${escapeHtml(order.customer_name)}</div>
    ${order.customer_phone ? `<div class="ticket__label">Telefone</div><div class="ticket__v">${maskPhone(order.customer_phone)}</div>` : ''}
    <div class="ticket__label">Atendimento</div>
    <div class="ticket__v ticket__v--big">Balcão — na hora</div>
    <div class="ticket__hr"></div>
    ${items}
    ${order.notes ? `<div class="ticket__hr"></div><div class="ticket__label">Observações</div><div class="ticket__v">${escapeHtml(order.notes)}</div>` : ''}
    <div class="ticket__hr"></div>
    <div class="ticket__item"><span>Total de itens</span><span>${n}</span></div>
    <div class="ticket__item ticket__item--tot"><span>Total</span><span>${money(order.total_cents)}</span></div>
    <div class="ticket__hr"></div>
    <div class="ticket__foot">Pedido CX-${order.number} · ${dateTimeBR(order.created_at)}</div>`;
}

function printOrderTicket(order) {
  $('#printTicket').innerHTML = ticketHtmlForOrder(order);
  document.body.classList.add('print-ticket');
  window.print();
  document.body.classList.remove('print-ticket');
}

function dayListTicketBlock(order) {
  return `
    <div class="ticket__block">
      <div class="ticket__big">CX-${order.number} · ${escapeHtml(order.customer_name)}</div>
      ${order.customer_phone ? `<div class="ticket__v">${maskPhone(order.customer_phone)}</div>` : ''}
      ${order.items.map(ticketItemHtml).join('')}
      ${order.notes ? `<div class="ticket__sub">obs geral: ${escapeHtml(order.notes)}</div>` : ''}
      <div class="ticket__item ticket__item--tot"><span>Total</span><span>${money(order.total_cents)}</span></div>
    </div>`;
}

function printDayList() {
  const orders = todayOrders();
  if (!orders.length) return toast('Nenhum pedido feito hoje ainda.', 'bad');
  const totalGeral = orders.reduce((s, o) => s + o.total_cents, 0);

  $('#printTicket').innerHTML = `
    <div class="ticket__h">${escapeHtml((state.store?.name || 'Esfiharia Jataí').toUpperCase())}</div>
    <div class="ticket__v" style="text-align:center">LISTA DO CAIXA — HOJE</div>
    <div class="ticket__v" style="text-align:center">${dateTimeBR(new Date())}</div>
    <div class="ticket__hr"></div>
    ${orders.map(dayListTicketBlock).join('<div class="ticket__hr"></div>')}
    <div class="ticket__hr"></div>
    <div class="ticket__item ticket__item--tot"><span>TOTAL GERAL</span><span>${money(totalGeral)}</span></div>
    <div class="ticket__foot">${orders.length} pedido(s)</div>`;
  document.body.classList.add('print-ticket');
  window.print();
  document.body.classList.remove('print-ticket');
}

/* --------------------------------------------------------- folha "Hoje" */

function openDaySheet() {
  const orders = todayOrders();
  const total = orders.reduce((s, o) => s + o.total_cents, 0);

  $('#dayStats').innerHTML = `
    <div class="stat"><div class="stat__l">Pedidos hoje</div><div class="stat__v">${orders.length}</div></div>
    <div class="stat stat--brand"><div class="stat__l">Total hoje</div><div class="stat__v money">${money(total)}</div></div>`;

  $('#dayRows').innerHTML = orders.length ? orders.slice().reverse().map((o) => {
    const n = o.items.reduce((s, i) => s + i.qty, 0);
    return `
      <article class="row">
        <div class="row__ph" style="font-size:17px">🧾</div>
        <div>
          <div class="row__t">CX-${o.number} · ${escapeHtml(o.customer_name)}</div>
          <p class="row__d">${n} ${n === 1 ? 'item' : 'itens'} · ${dateTimeBR(o.created_at)}</p>
        </div>
        <div class="row__a">
          <span class="tag tag--p money">${money(o.total_cents)}</span>
          <button class="mini mini--go" data-reprint="${o.number}">Reimprimir</button>
        </div>
      </article>`;
  }).join('') : '<div class="empty-box"><div class="empty-box__ic">🧾</div>Nenhum pedido ainda hoje.</div>';

  openSheet('#daySheet');
}

function closeDay() {
  const orders = todayOrders();
  if (!orders.length) return toast('Não há pedidos de hoje pra encerrar.', 'bad');
  if (!confirm(`Encerrar o dia? Isso apaga os ${orders.length} pedido(s) de hoje deste aparelho (já impressos). Essa ação não pode ser desfeita.`)) return;
  const all = loadAllOrders();
  delete all[todayKey()];
  saveAllOrders(all);
  updateOrdersBadge();
  closeSheets();
  toast('Dia encerrado.', 'ok');
}

/* -------------------------------------------------------------- folhas */

function openSheet(sel) {
  $$('.sheet').forEach((s) => { s.classList.remove('is-on'); s.setAttribute('aria-hidden', 'true'); });
  const sheet = $(sel);
  sheet.classList.add('is-on');
  sheet.setAttribute('aria-hidden', 'false');
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

/* -------------------------------------------------------------- eventos */

function bind() {
  $('#btnSync').addEventListener('click', syncCatalog);
  $('#firstSync').addEventListener('click', syncCatalog);

  $('#cartOpen').addEventListener('click', () => openSheet('#cartSheet'));
  $('#scrim').addEventListener('click', closeSheets);
  $('#toCheckout').addEventListener('click', openCheckout);
  $('#optAdd').addEventListener('click', confirmOptions);
  $('#coForm').addEventListener('submit', finalizeOrder);

  document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheets(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });

  const clearCart = () => {
    if (cart.isEmpty()) return;
    if (confirm('Deseja esvaziar o pedido?')) { cart.clear(); toast('Pedido esvaziado.'); }
  };
  $('#cartClear').addEventListener('click', clearCart);
  $('#cartClearBtn').addEventListener('click', clearCart);

  $('#menu').addEventListener('click', (e) => {
    const el = e.target.closest('.item[data-p]');
    if (!el) return;
    const p = state.products.find((x) => x.id === Number(el.dataset.p));
    if (!p) return;

    if (e.target.closest('[data-add]')) {
      if (p.addonGroups.some((g) => g.required)) return openOptions(p);
      cart.add(p);
      toast(`${p.name} adicionada`, 'ok');
      return;
    }

    const step = e.target.closest('[data-step]');
    if (step) return cart.bumpProduct(p.id, Number(step.dataset.step));

    if (p.addonGroups.length) openOptions(p);
  });

  $('#cartBody').addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    const row = e.target.closest('[data-k]');
    if (step && row) cart.bump(row.dataset.k, Number(step.dataset.step));
  });

  $('#optBody').addEventListener('click', (e) => {
    const label = e.target.closest('.aopt');
    if (label) { e.preventDefault(); toggleAddon(label); }
  });

  $('#cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (b) document.getElementById(`sec-${b.dataset.cat}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  let st;
  $('#search').addEventListener('input', (e) => {
    $('#searchWrap').classList.toggle('has-value', e.target.value.length > 0);
    clearTimeout(st);
    st = setTimeout(() => { state.filter = e.target.value; renderMenu(); }, 200);
  });
  $('#searchClear').addEventListener('click', () => {
    $('#search').value = ''; state.filter = ''; renderMenu();
    $('#searchWrap').classList.remove('has-value');
  });

  $('#btnOrders').addEventListener('click', openDaySheet);
  $('#printDayList').addEventListener('click', printDayList);
  $('#closeDay').addEventListener('click', closeDay);
  $('#dayRows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-reprint]');
    if (!b) return;
    const order = todayOrders().find((o) => o.number === Number(b.dataset.reprint));
    if (order) printOrderTicket(order);
  });

  updateOrdersBadge();
}
