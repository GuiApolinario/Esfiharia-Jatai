/* =============================================================================
   Loja da Esfiharia Jataí.

   Fluxo: escolher -> conferir -> dados -> servidor registra -> WhatsApp.
   O total mostrado aqui é só para a interface; o valor oficial vem do banco.
   ========================================================================== */

import { $, $$, escapeHtml, isValidPhone, maskPhone, money, toast } from './utils.js';
import { fetchCatalog, createOrder } from './data.js';
import * as cart from './cart.js';
import { CENA_ESFIHAS, ESFIHA, placeholder } from './icons.js';
import { availableDays, isOpenNow, todayHoursLabel, pickupLabel, timeLabel, dateKey, WEEKDAYS } from './schedule.js';

const state = {
  store: null,
  categories: [],
  products: [],
  days: [],
  day: null,
  slot: null,
  opt: null,          // produto aberto na folha de adicionais
  optPicked: new Map(),
  filter: '',
  order: null,        // pedido já registrado no servidor
  token: null,
  sending: false,
};

/** Desenho usado enquanto o produto não tem foto. */
function semFoto(p) {
  const cat = state.categories.find((c) => c.id === p.category_id)?.name || '';
  return placeholder(cat, p.unit);
}

/* A tela de carregamento aparece inteira na primeira visita da sessão, para
   não atrasar quem está só voltando ao cardápio. Nas próximas vezes ela sai
   assim que os dados chegam. */
const JA_VIU = (() => {
  try {
    const viu = sessionStorage.getItem('esfiharia:splash') === '1';
    sessionStorage.setItem('esfiharia:splash', '1');
    return viu;
  } catch {
    return false;   // aba anônima: mostra sempre
  }
})();

const SPLASH_MIN_MS = JA_VIU ? 0 : 1600;
const splashInicio = Date.now();

init();

function pintaSplash() {
  document.body.classList.add('loading');
  const el = document.getElementById('splash');
  if (JA_VIU) el?.classList.add('splash--quick');
  const art = document.getElementById('splashArt');
  if (art) art.innerHTML = CENA_ESFIHAS;
}

async function fechaSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const falta = SPLASH_MIN_MS - (Date.now() - splashInicio);
  if (falta > 0) await new Promise((r) => setTimeout(r, falta));
  el.classList.add('is-out');
  document.body.classList.remove('loading');
  setTimeout(() => el.remove(), 500);
}

async function init() {
  pintaSplash();
  bind();
  cart.subscribe(onCart);
  try {
    const data = await fetchCatalog();
    state.store = data.store;
    state.categories = data.categories;
    state.products = data.products;

    const dropped = cart.reconcile(state.products);
    if (dropped) toast('Alguns itens saíram do cardápio e foram removidos.', 'bad');

    applyTheme();
    renderStore();
    renderMenu();
    await fechaSplash();
  } catch (err) {
    await fechaSplash();
    $('#menu').innerHTML = `
      <div class="empty">
        <div class="empty__ic">😕</div>
        <strong>Não conseguimos carregar o cardápio.</strong>
        <p>${escapeHtml(err.message)}</p>
        <p style="margin-top:14px"><button class="btn btn--brand" onclick="location.reload()">Tentar de novo</button></p>
      </div>`;
  }
}

/* ------------------------------------------------------------------ marca */

function applyTheme() {
  const s = state.store;
  const root = document.documentElement.style;
  if (isColor(s.primary_color)) root.setProperty('--brand', s.primary_color);
  if (isColor(s.accent_color)) root.setProperty('--accent', s.accent_color);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && isColor(s.primary_color)) meta.content = s.primary_color;
}

const isColor = (v) => /^#[0-9a-f]{3,8}$/i.test(String(v || '').trim());

function renderStore() {
  const s = state.store;
  const open = isOpenNow(s) && s.accepting_orders;

  document.title = `${s.name} | Peça pelo WhatsApp`;
  $('#storeName').textContent = s.name;
  $('#ftName').textContent = s.name;
  $('#ftName2').textContent = s.name;
  $('#year').textContent = String(new Date().getFullYear());
  if (s.headline) $('#headline').innerHTML = highlight(s.headline);
  $('#ftAddr').textContent = s.address || 'Consulte no WhatsApp';

  $('#mark').innerHTML = s.logo_url ? `<img src="${escapeHtml(s.logo_url)}" alt="">` : ESFIHA;

  // Com logotipo enviado, ele substitui o texto na tela de carregamento.
  const splashLogo = $('#splashLogo');
  if (s.logo_url && splashLogo) {
    splashLogo.innerHTML = `<img src="${escapeHtml(s.logo_url)}" alt="${escapeHtml(s.name)}">`;
  }

  const status = $('#status');
  status.textContent = open ? 'Aberto' : 'Fechado';
  status.className = `pill ${open ? 'pill--open' : 'pill--closed'}`;
  $('#hoursTag').textContent = `🕒 ${todayHoursLabel(s)}`;

  const wa = `https://wa.me/${s.whatsapp}`;
  $('#ftWhats').href = wa;
  $('#ftWhats').textContent = prettyPhone(s.whatsapp);
  $('#wfab').href = `${wa}?text=${encodeURIComponent('Olá! Tenho uma dúvida sobre o cardápio.')}`;

  if (s.instagram) {
    const handle = s.instagram.replace(/^@/, '');
    $('#ftInsta').hidden = false;
    $('#ftInstaLink').href = `https://instagram.com/${handle}`;
    $('#ftInstaLink').textContent = `@${handle}`;
  }

  const todayKey = dateKey(new Date());
  const upcoming = [...(s.event_days || [])].sort((a, b) => a.date.localeCompare(b.date));
  $('#ftHours').innerHTML = upcoming.length ? upcoming.map((ev) => {
    const [y, m, d] = ev.date.split('-').map(Number);
    const dow = WEEKDAYS[new Date(y, m - 1, d).getDay()];
    const label = `${dow}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
    const today = ev.date === todayKey ? ' style="color:#fff"' : '';
    return `<li class="ft__r"${today}><span>${label}</span><b>${ev.open} – ${ev.close}</b></li>`;
  }).join('') : '<li class="ft__r"><span>Nenhum evento agendado no momento.</span></li>';

  if (s.announcement_active && s.announcement) {
    $('#noticeSlot').innerHTML =
      `<div class="notice"><span aria-hidden="true">📣</span><span>${escapeHtml(s.announcement)}</span></div>`;
  }

  if (!s.accepting_orders) {
    $('#closedSlot').innerHTML = `
      <div class="closed-banner">
        <strong>🔴 Pedidos online indisponíveis no momento.</strong>
        ${escapeHtml(s.closed_message)}
        <p style="margin:10px 0 0"><a class="btn btn--whats" href="${wa}" target="_blank" rel="noopener">FALAR NO WHATSAPP</a></p>
      </div>`;
  }
}

/** Deixa a segunda metade da frase em destaque, sem permitir HTML do banco. */
function highlight(text) {
  const safe = escapeHtml(text);
  const i = safe.indexOf(' ', Math.floor(safe.length / 2));
  return i === -1 ? safe : `${safe.slice(0, i)} <em>${safe.slice(i + 1)}</em>`;
}

function prettyPhone(digits) {
  const n = String(digits || '').replace(/^55/, '');
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return digits || 'WhatsApp';
}

/* ---------------------------------------------------------------- cardápio */

function groupedMenu() {
  const term = state.filter.toLowerCase().trim();
  const match = (p) =>
    !term ||
    p.name.toLowerCase().includes(term) ||
    (p.description || '').toLowerCase().includes(term) ||
    (state.categories.find((c) => c.id === p.category_id)?.name || '').toLowerCase().includes(term);

  const visible = state.products.filter(match);
  const groups = [];

  // "Mais pedidos" só aparece se o dono marcou produtos como destaque.
  const featured = visible.filter((p) => p.featured);
  if (featured.length && !term) {
    groups.push({ id: 'top', name: 'Mais pedidos', icon: '🔥', products: featured });
  }

  for (const c of state.categories) {
    const products = visible.filter((p) => p.category_id === c.id);
    if (products.length) groups.push({ ...c, products });
  }

  const orphans = visible.filter((p) => !state.categories.some((c) => c.id === p.category_id));
  if (orphans.length) groups.push({ id: 'outros', name: 'Outros', icon: '✨', products: orphans });

  return groups;
}

function renderMenu() {
  const groups = groupedMenu();

  if (!groups.length) {
    $('#cats').innerHTML = '';
    $('#menu').innerHTML = state.filter
      ? `<div class="empty"><div class="empty__ic">🔎</div><strong>Não encontramos esse sabor.</strong>
         <p>Tente outra busca.</p></div>`
      : `<div class="empty"><div class="empty__ic">🍽️</div><strong>O cardápio está sendo preparado.</strong>
         <p>Volte em instantes ou fale com a gente no WhatsApp.</p></div>`;
    return;
  }

  $('#cats').innerHTML = groups
    .map((g) => `<button class="cats__item" data-cat="${g.id}">${g.icon || '🍽️'} ${escapeHtml(g.name)}</button>`)
    .join('');

  $('#menu').innerHTML = groups
    .map((g) => `
      <section class="sec" id="sec-${g.id}">
        <div class="sec__h">
          <h2>${g.icon || '🍽️'} ${escapeHtml(g.name)}</h2>
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

/** Alterna entre "Adicionar" e o seletor de quantidade em cada card. */
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

/* ----------------------------------------------- folha de adicionais */

function openOptions(product) {
  state.opt = product;
  state.optPicked = new Map();

  $('#optTitle').textContent = product.name;
  $('#optBody').innerHTML = `
    <p style="margin:0 0 16px;color:var(--ink-soft);font-size:14px">${escapeHtml(product.description || '')}</p>
    ${product.addonGroups.map(groupBlock).join('')}`;

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
    // Seleção única troca a escolha; múltipla respeita o teto do grupo.
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
  cart.add(state.opt, { addons: pickedAddons() });
  closeSheets();
  toast(`${state.opt.name} adicionada`, 'ok');
}

/* ----------------------------------------------------------------- carrinho */

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
  if (n > 0) {
    const t = $('#cartTotal');
    t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
  }

  renderCart();
  syncCards();
}

function renderCart() {
  const body = $('#cartBody');
  const items = cart.getItems();

  if (!items.length) {
    body.innerHTML = `
      <div class="empty">
        <div class="empty__ic">🥟</div>
        <strong>Seu pedido ainda está vazio.</strong>
        <p>Escolha suas esfihas no cardápio.</p>
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
      </div>
      <div class="crow__s">
        <span class="crow__p money">${money(cart.lineTotal(i))}</span>
        <span class="qty qty--soft">
          <button type="button" data-step="-1" aria-label="Diminuir">−</button>
          <span class="qty__v">${i.qty}</span>
          <button type="button" data-step="1" aria-label="Aumentar">+</button>
        </span>
      </div>
    </div>`).join('') + upsellBlock();
}

/** Sugestão discreta de bebida ou acompanhamento (item 12 do projeto). */
function upsellBlock() {
  const inCart = new Set(cart.getItems().map((i) => i.productId));
  const wanted = state.categories.filter((c) => /bebida|acompanh|adicion/i.test(c.name)).map((c) => c.id);
  if (!wanted.length) return '';

  const picks = state.products
    .filter((p) => wanted.includes(p.category_id) && !inCart.has(p.id))
    .slice(0, 6);
  if (!picks.length) return '';

  return `
    <div class="upsell">
      <div class="upsell__t">Que tal completar o pedido? 🥤</div>
      <div class="upsell__row">
        ${picks.map((p) => `
          <button class="upcard" data-up="${p.id}">
            <span class="upcard__ph">${p.image
              ? `<img src="${escapeHtml(p.image)}" alt="" loading="lazy">`
              : semFoto(p)}</span>
            <span class="upcard__n">${escapeHtml(p.name)}</span>
            <span class="upcard__p money">${money(p.cents)}</span>
          </button>`).join('')}
      </div>
    </div>`;
}

/* ----------------------------------------------------------------- checkout */

function openCheckout() {
  if (cart.isEmpty()) return toast('Adicione ao menos um item.', 'bad');
  if (!state.store.accepting_orders) return toast(state.store.closed_message, 'bad');

  const min = state.store.min_order_cents || 0;
  if (min && cart.totalCents() < min) return toast(`O pedido mínimo é de ${money(min)}.`, 'bad');

  state.days = availableDays(state.store);
  if (!state.days.length) return toast('Sem horários disponíveis. Fale com a gente no WhatsApp.', 'bad');

  if (!state.days.some((d) => d.key === state.day?.key)) {
    state.day = state.days[0];
    state.slot = null;
  }

  renderDays();
  renderTimes();
  renderSummary();
  openSheet('#coSheet');
}

function renderDays() {
  $('#dayChips').innerHTML = state.days.map((d) => `
    <button type="button" class="chip ${d.key === state.day?.key ? 'is-on' : ''}" data-day="${d.key}">
      ${d.label}<small>${d.sublabel}</small>
    </button>`).join('');
}

function renderTimes() {
  const box = $('#timeChips');
  if (!state.day) return (box.innerHTML = '<p class="f__hint">Escolha primeiro o dia.</p>');
  box.innerHTML = state.day.slots.map((s) => {
    const v = timeLabel(s);
    const on = state.slot && timeLabel(state.slot) === v ? 'is-on' : '';
    return `<button type="button" class="chip ${on}" data-time="${v}">${v}</button>`;
  }).join('');
}

function renderSummary() {
  const pickup = state.day && state.slot ? pickupLabel(state.day, state.slot) : 'Escolha dia e horário';
  const note = state.store.prep_time_note;

  $('#coSum').innerHTML = `
    ${cart.getItems().map((i) => `
      <div class="sum__r"><span>${i.qty}× ${escapeHtml(i.name)}</span>
      <span class="money">${money(cart.lineTotal(i))}</span></div>`).join('')}
    <div class="sum__r sum__r--tot"><span>Total</span><b class="money">${money(cart.totalCents())}</b></div>
    <div class="sum__r" style="margin-top:8px"><span>Retirada</span><span>${escapeHtml(pickup)}</span></div>
    <div class="sum__r"><span>Pagamento</span><span>Na retirada ou Pix</span></div>
    ${note ? `<div class="sum__r"><span>Preparo</span><span>${escapeHtml(note)}</span></div>` : ''}`;
}

/* --------------------------------------------- envio: servidor -> WhatsApp */

async function submit(e) {
  e.preventDefault();
  if (state.sending) return;

  const name = $('#cName').value.trim();
  const phone = $('#cPhone').value.trim();
  const notes = $('#cNotes').value.trim();

  const checks = [
    ['#fName', name.length >= 2],
    ['#fPhone', isValidPhone(phone)],
    ['#fDate', Boolean(state.day)],
    ['#fTime', Boolean(state.slot)],
  ];
  let firstBad = null;
  for (const [sel, ok] of checks) {
    const f = $(sel);
    f.classList.toggle('bad', !ok);
    $$('.in', f).forEach((el) => el.classList.toggle('bad', !ok));
    if (!ok && !firstBad) firstBad = f;
  }
  if (firstBad) {
    firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return toast('Confira os campos destacados.', 'bad');
  }

  const btn = $('#coSend');
  state.sending = true;
  btn.disabled = true;
  btn.textContent = 'Calculando pedido…';

  // Um token por tentativa: tocar duas vezes não cria dois pedidos.
  state.token = state.token || crypto.randomUUID();

  try {
    const pickupAt = new Date(state.slot);
    const res = await createOrder({
      name, phone, notes,
      pickupAt: pickupAt.toISOString(),
      items: cart.toOrderItems(),
      expectedTotal: cart.totalCents(),
      token: state.token,
    });

    if (res.status === 'unavailable') {
      state.token = null;
      const names = res.items.map((i) => i.name).join(', ');
      toast(`Ficou indisponível: ${names}`, 'bad');
      return;
    }

    if (res.status === 'price_changed') {
      state.token = null;
      const lines = res.changes
        .map((c) => `${c.name}: ${money(c.old_cents)} → ${money(c.new_cents)}`).join('\n');
      if (confirm(`O preço de alguns itens foi atualizado:\n\n${lines}\n\nDeseja continuar com o novo total de ${money(res.total_cents)}?`)) {
        for (const c of res.changes) {
          const p = state.products.find((x) => x.id === c.product_id);
          if (p) p.cents = c.new_cents;
        }
        cart.reconcile(state.products);
        renderSummary();
        toast('Preços atualizados. Confira e envie novamente.', 'bad');
      }
      return;
    }

    if (res.status === 'closed') { toast(res.message, 'bad'); return; }
    if (res.status === 'below_minimum') { toast(`O pedido mínimo é de ${money(res.minimum_cents)}.`, 'bad'); return; }

    // Pedido registrado no servidor: só agora abrimos o WhatsApp.
    btn.textContent = 'Abrindo WhatsApp…';
    state.order = res;
    localStorage.setItem('esfiharia-jatai:cliente', JSON.stringify({ name, phone }));
    showConfirmation(res);
  } catch (err) {
    state.token = null;
    toast(err.message || 'Não conseguimos finalizar seu pedido agora. Tente novamente.', 'bad');
  } finally {
    state.sending = false;
    btn.disabled = false;
    btn.innerHTML = '<span aria-hidden="true">💬</span> ENVIAR PELO WHATSAPP';
  }
}

function showConfirmation(order) {
  $('#okCode').innerHTML = `<small>Pedido</small>${escapeHtml(order.code)}`;
  $('#okSum').innerHTML = `
    ${order.items.map((i) => `
      <div class="sum__r">
        <span>${i.quantity}× ${escapeHtml(i.name)}${i.addons?.length ? `<br><small style="color:var(--ink-faint)">+ ${i.addons.map((a) => escapeHtml(a.name)).join(', ')}</small>` : ''}</span>
        <span class="money">${money(i.subtotal_cents)}</span>
      </div>`).join('')}
    <div class="sum__r sum__r--tot"><span>Total</span><b class="money">${money(order.total_cents)}</b></div>`;

  $('#okGo').href = `https://wa.me/${state.store.whatsapp}?text=${encodeURIComponent(buildMessage(order))}`;
  closeSheets();
  setTimeout(() => openSheet('#okSheet'), 220);
}

/** Mensagem do WhatsApp: cópia amigável. A fonte oficial é o banco. */
function buildMessage(o) {
  const L = [
    `🥟 *NOVO PEDIDO — ${state.store.name.toUpperCase()}*`,
    '',
    `🧾 *Pedido:* ${o.code}`,
    `👤 *Cliente:* ${o.customer_name}`,
    `📱 *WhatsApp:* ${maskPhone(o.customer_phone)}`,
    '━━━━━━━━━━━━━━',
    '*PEDIDO*',
    '',
  ];

  for (const i of o.items) {
    L.push(`*${i.quantity}x ${i.name}*`);
    if (i.addons?.length) {
      for (const a of i.addons) {
        L.push(`   + ${a.name}${a.price_cents ? ` (${money(a.price_cents)})` : ''}`);
      }
    }
    if (i.notes) L.push(`   _obs: ${i.notes}_`);
    L.push(`   ${money(i.unit_price_cents)} cada · Subtotal: ${money(i.subtotal_cents)}`, '');
  }

  L.push(
    '━━━━━━━━━━━━━━',
    `💰 *TOTAL CONFIRMADO PELO SISTEMA:*`,
    `*${money(o.total_cents)}*`,
    '',
    `🛍️ *Retirada:* ${state.day && state.slot ? pickupLabel(state.day, state.slot) : 'a combinar'}`,
    `📍 ${state.store.address || 'Consultar endereço'}`,
  );

  if (o.notes) L.push('', `📝 *Observação:* ${o.notes}`);
  L.push('', '━━━━━━━━━━━━━━', `✅ ${state.store.whatsapp_footer || 'Pedido registrado no sistema.'}`, `Pedido ${o.code}`);

  return L.join('\n');
}

/* -------------------------------------------------------------- folhas */

function openSheet(sel) {
  $$('.sheet').forEach((s) => {
    s.classList.remove('is-on');
    s.setAttribute('aria-hidden', 'true');
  });
  const sheet = $(sel);
  sheet.classList.add('is-on');
  sheet.setAttribute('aria-hidden', 'false');
  $('#scrim').classList.add('is-on');
  document.body.classList.add('sheet-open');
  document.body.style.overflow = 'hidden';
}

function closeSheets() {
  $$('.sheet').forEach((s) => {
    s.classList.remove('is-on');
    s.setAttribute('aria-hidden', 'true');
  });
  $('#scrim').classList.remove('is-on');
  document.body.classList.remove('sheet-open');
  document.body.style.overflow = '';
}

/* -------------------------------------------------------------- eventos */

function bind() {
  $('#cartOpen').addEventListener('click', () => openSheet('#cartSheet'));
  $('#scrim').addEventListener('click', closeSheets);
  $('#toCheckout').addEventListener('click', openCheckout);
  $('#optAdd').addEventListener('click', confirmOptions);

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeSheets();
  });

  $('#cartClear').addEventListener('click', () => {
    if (cart.isEmpty()) return;
    if (confirm('Deseja esvaziar o pedido?')) { cart.clear(); toast('Pedido esvaziado.'); }
  });

  // Cardápio: adicionar / + / −
  $('#menu').addEventListener('click', (e) => {
    const el = e.target.closest('.item[data-p]');
    if (!el) return;
    const p = state.products.find((x) => x.id === Number(el.dataset.p));
    if (!p) return;

    if (e.target.closest('[data-add]')) {
      // Grupo obrigatório precisa de escolha; os opcionais não travam o pedido.
      if (p.addonGroups.some((g) => g.required)) return openOptions(p);
      cart.add(p);
      toast(`${p.name} adicionada`, 'ok');
      return;
    }

    const step = e.target.closest('[data-step]');
    if (step) return cart.bumpProduct(p.id, Number(step.dataset.step));

    // Tocar no card (foto, nome, descrição) abre os adicionais.
    if (p.addonGroups.length) openOptions(p);
  });

  // Carrinho: + / − e upsell
  $('#cartBody').addEventListener('click', (e) => {
    const up = e.target.closest('[data-up]');
    if (up) {
      const p = state.products.find((x) => x.id === Number(up.dataset.up));
      if (p) { cart.add(p); toast(`${p.name} adicionada`, 'ok'); }
      return;
    }
    const step = e.target.closest('[data-step]');
    const row = e.target.closest('[data-k]');
    if (step && row) cart.bump(row.dataset.k, Number(step.dataset.step));
  });

  // Adicionais
  $('#optBody').addEventListener('click', (e) => {
    const label = e.target.closest('.aopt');
    if (label) { e.preventDefault(); toggleAddon(label); }
  });

  // Categorias
  $('#cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (b) document.getElementById(`sec-${b.dataset.cat}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Busca
  let t;
  $('#search').addEventListener('input', (e) => {
    $('#searchWrap').classList.toggle('has-value', e.target.value.length > 0);
    clearTimeout(t);
    t = setTimeout(() => { state.filter = e.target.value; renderMenu(); }, 160);
  });
  $('#searchClear').addEventListener('click', () => {
    $('#search').value = '';
    $('#searchWrap').classList.remove('has-value');
    state.filter = '';
    renderMenu();
  });

  // Checkout
  $('#dayChips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-day]');
    if (!c) return;
    state.day = state.days.find((d) => d.key === c.dataset.day) || null;
    state.slot = null;
    $('#fDate').classList.remove('bad');
    renderDays(); renderTimes(); renderSummary();
  });

  $('#timeChips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-time]');
    if (!c || !state.day) return;
    state.slot = state.day.slots.find((s) => timeLabel(s) === c.dataset.time) || null;
    $('#fTime').classList.remove('bad');
    renderTimes(); renderSummary();
  });

  $('#cPhone').addEventListener('input', (e) => { e.target.value = maskPhone(e.target.value); });
  $('#coForm').addEventListener('submit', submit);

  $('#okGo').addEventListener('click', () => {
    setTimeout(() => { cart.clear(); state.token = null; }, 400);
  });
  $('#okDone').addEventListener('click', () => {
    cart.clear(); state.token = null; state.order = null; closeSheets();
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });

  // Reaproveita nome e telefone de um pedido anterior.
  try {
    const saved = JSON.parse(localStorage.getItem('esfiharia-jatai:cliente') || 'null');
    if (saved) {
      $('#cName').value = saved.name || '';
      $('#cPhone').value = maskPhone(saved.phone || '');
    }
  } catch { /* dado corrompido, ignora */ }
}
