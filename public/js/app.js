/* Site público da Esfiharia Jataí: cardápio, carrinho e agendamento da retirada. */

import { $, $$, api, escapeHtml, isValidPhone, maskPhone, money, toast } from './utils.js';
import * as cart from './cart.js';
import {
  availableDays, isOpenNow, pickupLabel, timeLabel, todayHoursLabel, WEEKDAYS,
} from './schedule.js';

const state = {
  store: null,
  categories: [],
  products: [],
  days: [],
  selectedDay: null,
  selectedSlot: null,
};

const CATEGORY_FALLBACK_ICON = '🥟';

/* -------------------------------------------------------------- inicialização */

init();

async function init() {
  bindStaticEvents();
  cart.subscribe(onCartChange);

  try {
    const data = await api('/api/catalog');
    state.store = data.store;
    state.categories = data.categories;
    state.products = data.products;

    const removed = cart.reconcile(state.products);
    if (removed) toast('Alguns itens saíram do cardápio e foram removidos do seu pedido.');

    renderStoreInfo();
    renderMenu();
  } catch (error) {
    $('#menuRoot').innerHTML = `
      <div class="empty">
        <div class="empty__icon">😕</div>
        <p><strong>Não conseguimos carregar o cardápio.</strong></p>
        <p>${escapeHtml(error.message)}</p>
        <p style="margin-top:1rem"><button class="btn btn--primary" onclick="location.reload()">Tentar de novo</button></p>
      </div>`;
  }
}

/* ------------------------------------------------------------- dados da loja */

function renderStoreInfo() {
  const store = state.store;
  const open = isOpenNow(store);

  document.title = `${store.name} — Peça sua esfiha e retire no local`;
  $('#brandName').textContent = store.name;
  $('#footerName').textContent = store.name;
  $('#footerName2').textContent = store.name;
  $('#year').textContent = String(new Date().getFullYear());

  if (store.tagline) {
    $('#heroTagline').textContent = store.tagline;
    $('#footerTagline').textContent = store.tagline;
  }

  const status = $('#storeStatus');
  status.textContent = open ? 'Aberto agora' : 'Fechado agora';
  status.className = `status ${open ? 'status--open' : 'status--closed'}`;

  $('#factAddress').textContent = store.address || 'Consulte no WhatsApp';
  $('#footerAddress').textContent = store.address || 'Consulte no WhatsApp';
  $('#factHours').textContent = todayHoursLabel(store);
  $('#factPhone').textContent = formatStorePhone(store.whatsapp);

  const whatsLink = $('#footerWhats');
  whatsLink.href = `https://wa.me/${store.whatsapp}`;
  whatsLink.textContent = formatStorePhone(store.whatsapp);

  $('#footerHours').innerHTML = WEEKDAYS.map((name, index) => {
    const config = store.hours?.[index];
    const value = !config || config.closed ? 'Fechado' : `${config.open} – ${config.close}`;
    const today = index === new Date().getDay() ? ' style="color:#fff"' : '';
    return `<li class="footer__row"${today}><span>${name}</span><span>${value}</span></li>`;
  }).join('');

  if (store.notice) {
    $('#noticeSlot').innerHTML =
      `<div class="notice"><span aria-hidden="true">📣</span><span>${escapeHtml(store.notice)}</span></div>`;
  }

  if (!open) {
    const next = availableDays(store)[0];
    if (next) {
      toast(`Estamos fechados agora, mas você já pode agendar para ${next.label.toLowerCase()}.`);
    }
  }
}

function formatStorePhone(digits) {
  const local = String(digits || '').replace(/^55/, '');
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return digits || 'WhatsApp';
}

/* ------------------------------------------------------------------ cardápio */

function renderMenu() {
  const grouped = state.categories
    .map((category) => ({
      ...category,
      products: state.products.filter((product) => product.category_id === category.id),
    }))
    .filter((category) => category.products.length);

  const orphans = state.products.filter(
    (product) => !state.categories.some((category) => category.id === product.category_id)
  );
  if (orphans.length) grouped.push({ id: 0, name: 'Outros', icon: '✨', products: orphans });

  if (!grouped.length) {
    $('#catnav').innerHTML = '';
    $('#menuRoot').innerHTML = `
      <div class="empty">
        <div class="empty__icon">🍽️</div>
        <p><strong>O cardápio está sendo preparado.</strong></p>
        <p>Volte em instantes ou fale com a gente no WhatsApp.</p>
      </div>`;
    return;
  }

  $('#catnav').innerHTML = grouped
    .map(
      (category) =>
        `<a class="catnav__link" href="#cat-${category.id}" data-cat="${category.id}">${
          category.icon || CATEGORY_FALLBACK_ICON
        } ${escapeHtml(category.name)}</a>`
    )
    .join('');

  $('#menuRoot').innerHTML = grouped
    .map(
      (category) => `
      <section class="category" id="cat-${category.id}">
        <div class="category__head">
          <h3>${category.icon || CATEGORY_FALLBACK_ICON} ${escapeHtml(category.name)}</h3>
          <span class="category__count">${category.products.length} ${
            category.products.length === 1 ? 'opção' : 'opções'
          }</span>
        </div>
        <div class="grid">${category.products.map(productCard).join('')}</div>
      </section>`
    )
    .join('');

  observeCategories();
  syncProductCards();
}

function productCard(product) {
  const media = product.image
    ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">`
    : `<div class="card__placeholder" aria-hidden="true">${CATEGORY_FALLBACK_ICON}</div>`;

  return `
    <article class="card" data-product="${product.id}">
      <div class="card__media">${media}</div>
      <div class="card__body">
        <h4 class="card__name">${escapeHtml(product.name)}</h4>
        ${product.description ? `<p class="card__desc">${escapeHtml(product.description)}</p>` : ''}
        ${product.unit && product.unit !== 'unidade'
          ? `<span class="card__unit">${escapeHtml(product.unit)}</span>` : ''}
        <div class="card__foot">
          <span class="card__price">${money(product.price_cents)}</span>
          <div data-slot="action"></div>
        </div>
      </div>
    </article>`;
}

/** Alterna entre "Adicionar" e o seletor de quantidade em cada card. */
function syncProductCards() {
  for (const card of $$('.card[data-product]')) {
    const id = Number(card.dataset.product);
    const qty = cart.quantityOf(id);
    const slot = $('[data-slot="action"]', card);
    card.classList.toggle('is-in-cart', qty > 0);

    if (qty > 0) {
      slot.innerHTML = `
        <div class="stepper">
          <button type="button" data-step="-1" aria-label="Diminuir quantidade">−</button>
          <span class="stepper__value">${qty}</span>
          <button type="button" data-step="1" aria-label="Aumentar quantidade">+</button>
        </div>`;
    } else {
      slot.innerHTML = '<button type="button" class="add-btn" data-add>Adicionar</button>';
    }
  }
}

function observeCategories() {
  const links = $$('.catnav__link');
  if (!links.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target.id.replace('cat-', '');
        links.forEach((link) => link.classList.toggle('is-active', link.dataset.cat === id));
      }
    },
    { rootMargin: '-45% 0px -50% 0px' }
  );

  $$('.category').forEach((section) => observer.observe(section));
}

/* ------------------------------------------------------------------ carrinho */

function onCartChange() {
  const count = cart.totalItems();
  $('#cartCount').textContent = String(count);
  $('#cartItemsLabel').textContent = `${count} ${count === 1 ? 'item' : 'itens'}`;
  $('#cartSubtotal').textContent = money(cart.totalCents());
  $('#cartTotal').textContent = money(cart.totalCents());
  $('#cartFoot').hidden = count === 0;
  renderCartItems();
  syncProductCards();
}

function renderCartItems() {
  const body = $('#cartBody');
  const items = cart.getItems();

  if (!items.length) {
    body.innerHTML = `
      <div class="empty">
        <div class="empty__icon">🛒</div>
        <p><strong>Seu pedido está vazio.</strong></p>
        <p>Escolha suas esfihas no cardápio para começar.</p>
      </div>`;
    return;
  }

  body.innerHTML = items
    .map(
      (item) => `
      <div class="cart-item" data-item="${item.id}">
        <div class="cart-item__thumb">${
          item.image
            ? `<img src="${escapeHtml(item.image)}" alt="">`
            : `<span aria-hidden="true">${CATEGORY_FALLBACK_ICON}</span>`
        }</div>
        <div>
          <div class="cart-item__name">${escapeHtml(item.name)}</div>
          <div class="cart-item__meta">${money(item.price_cents)} cada</div>
        </div>
        <div class="cart-item__side">
          <span class="cart-item__price">${money(item.price_cents * item.qty)}</span>
          <div class="stepper stepper--light">
            <button type="button" data-step="-1" aria-label="Diminuir">−</button>
            <span class="stepper__value">${item.qty}</span>
            <button type="button" data-step="1" aria-label="Aumentar">+</button>
          </div>
        </div>
      </div>`
    )
    .join('');
}

function openCart() {
  $('#cartDrawer').classList.add('is-open');
  $('#cartDrawer').setAttribute('aria-hidden', 'false');
  $('#overlay').classList.add('is-open');
  document.body.classList.add('no-scroll');
}

function closeCart() {
  $('#cartDrawer').classList.remove('is-open');
  $('#cartDrawer').setAttribute('aria-hidden', 'true');
  $('#overlay').classList.remove('is-open');
  if (!$('#checkoutModal').classList.contains('is-open')) document.body.classList.remove('no-scroll');
}

/* ----------------------------------------------------------------- checkout */

function openCheckout() {
  if (cart.isEmpty()) return toast('Adicione pelo menos um item ao pedido.');

  const minimum = state.store.min_order_cents || 0;
  if (minimum && cart.totalCents() < minimum) {
    return toast(`O pedido mínimo é de ${money(minimum)}.`);
  }

  state.days = availableDays(state.store);
  if (!state.days.length) {
    return toast('No momento não há horários disponíveis. Fale com a gente no WhatsApp.');
  }

  if (!state.days.some((day) => day.key === state.selectedDay?.key)) {
    state.selectedDay = state.days[0];
    state.selectedSlot = null;
  }

  renderDateChips();
  renderTimeChips();
  renderSummary();

  closeCart();
  $('#checkoutModal').classList.add('is-open');
  document.body.classList.add('no-scroll');
  setTimeout(() => $('#customerName').focus(), 260);
}

function closeCheckout() {
  $('#checkoutModal').classList.remove('is-open');
  document.body.classList.remove('no-scroll');
}

function renderDateChips() {
  $('#dateChips').innerHTML = state.days
    .map(
      (day) => `
      <button type="button" class="chip ${day.key === state.selectedDay?.key ? 'is-active' : ''}"
              data-day="${day.key}">${day.label}<small>${day.sublabel}</small></button>`
    )
    .join('');
}

function renderTimeChips() {
  const day = state.selectedDay;
  const container = $('#timeChips');

  if (!day) {
    container.innerHTML = '<p class="field__hint">Escolha primeiro o dia.</p>';
    return;
  }

  container.innerHTML = day.slots
    .map((slot) => {
      const value = timeLabel(slot);
      const active = state.selectedSlot && timeLabel(state.selectedSlot) === value ? 'is-active' : '';
      return `<button type="button" class="chip ${active}" data-time="${value}">${value}</button>`;
    })
    .join('');
}

function renderSummary() {
  const items = cart.getItems();
  const pickup =
    state.selectedDay && state.selectedSlot
      ? pickupLabel(state.selectedDay, state.selectedSlot)
      : 'Escolha o dia e o horário';

  $('#orderSummary').innerHTML = `
    ${items
      .map(
        (item) => `<div class="summary__row"><span>${item.qty}× ${escapeHtml(item.name)}</span>
          <span>${money(item.price_cents * item.qty)}</span></div>`
      )
      .join('')}
    <div class="summary__row summary__row--total"><span>Total</span><span>${money(cart.totalCents())}</span></div>
    <div class="summary__row" style="margin-top:.6rem"><span>Retirada</span><span>${escapeHtml(pickup)}</span></div>
    <div class="summary__row"><span>Pagamento</span><span>Na retirada ou Pix no WhatsApp</span></div>`;
}

/* --------------------------------------------------- envio para o WhatsApp */

function buildWhatsAppMessage({ name, phone, notes }) {
  const items = cart.getItems();
  const lines = [
    `*NOVO PEDIDO — ${state.store.name}*`,
    '',
    `*Cliente:* ${name}`,
    `*WhatsApp:* ${phone}`,
    '',
    '*Itens do pedido:*',
    ...items.map((item) => `• ${item.qty}x ${item.name} — ${money(item.price_cents * item.qty)}`),
    '',
    `*Total: ${money(cart.totalCents())}*`,
    '',
    `*Retirada no local:* ${pickupLabel(state.selectedDay, state.selectedSlot)}`,
    '*Pagamento:* a combinar (Pix pelo WhatsApp ou na retirada)',
  ];

  if (notes) lines.push('', `*Observações:* ${notes}`);
  lines.push('', '_Pedido enviado pelo site._');

  return lines.join('\n');
}

function submitOrder(event) {
  event.preventDefault();

  const name = $('#customerName').value.trim();
  const phone = $('#customerPhone').value.trim();
  const notes = $('#customerNotes').value.trim();

  const problems = [
    ['#fieldName', name.length >= 2],
    ['#fieldPhone', isValidPhone(phone)],
    ['#fieldDate', Boolean(state.selectedDay)],
    ['#fieldTime', Boolean(state.selectedSlot)],
  ];

  let firstInvalid = null;
  for (const [selector, valid] of problems) {
    const field = $(selector);
    field.classList.toggle('has-error', !valid);
    $$('.input, .select', field).forEach((el) => el.classList.toggle('is-invalid', !valid));
    if (!valid && !firstInvalid) firstInvalid = field;
  }

  if (firstInvalid) {
    firstInvalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return toast('Confira os campos destacados para continuar.');
  }

  // O horário escolhido pode ter passado enquanto o cliente preenchia o formulário.
  const stillAvailable = availableDays(state.store).some(
    (day) => day.key === state.selectedDay.key && day.slots.some((slot) => timeLabel(slot) === timeLabel(state.selectedSlot))
  );
  if (!stillAvailable) {
    state.days = availableDays(state.store);
    state.selectedDay = state.days[0] || null;
    state.selectedSlot = null;
    renderDateChips();
    renderTimeChips();
    renderSummary();
    return toast('Esse horário acabou de passar. Escolha outro, por favor.');
  }

  const message = buildWhatsAppMessage({ name, phone, notes });
  const url = `https://wa.me/${state.store.whatsapp}?text=${encodeURIComponent(message)}`;

  localStorage.setItem('esfiharia-jatai:cliente', JSON.stringify({ name, phone }));
  window.open(url, '_blank', 'noopener');

  closeCheckout();
  cart.clear();
  toast('Pedido enviado! Confirme o envio na conversa do WhatsApp.');
}

/* -------------------------------------------------------------------- eventos */

function bindStaticEvents() {
  $('#cartToggle').addEventListener('click', openCart);
  $('#closeCart').addEventListener('click', closeCart);
  $('#overlay').addEventListener('click', closeCart);
  $('#checkoutBtn').addEventListener('click', openCheckout);

  $('#clearCart').addEventListener('click', () => {
    if (cart.isEmpty()) return;
    if (confirm('Deseja esvaziar o pedido?')) {
      cart.clear();
      toast('Pedido esvaziado.');
    }
  });

  // Cliques nos cards do cardápio (adicionar / + / −).
  $('#menuRoot').addEventListener('click', (event) => {
    const card = event.target.closest('.card[data-product]');
    if (!card) return;
    const product = state.products.find((item) => item.id === Number(card.dataset.product));
    if (!product) return;

    if (event.target.closest('[data-add]')) {
      cart.add(product, 1);
      toast(`${product.name} adicionada ao pedido.`);
      return;
    }
    const step = event.target.closest('[data-step]');
    if (step) cart.increment(product.id, Number(step.dataset.step));
  });

  // Cliques nos itens do carrinho (+ / −).
  $('#cartBody').addEventListener('click', (event) => {
    const step = event.target.closest('[data-step]');
    if (!step) return;
    const row = event.target.closest('[data-item]');
    if (row) cart.increment(Number(row.dataset.item), Number(step.dataset.step));
  });

  // Escolha de dia e horário no checkout.
  $('#dateChips').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-day]');
    if (!chip) return;
    state.selectedDay = state.days.find((day) => day.key === chip.dataset.day) || null;
    state.selectedSlot = null;
    $('#fieldDate').classList.remove('has-error');
    renderDateChips();
    renderTimeChips();
    renderSummary();
  });

  $('#timeChips').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-time]');
    if (!chip || !state.selectedDay) return;
    state.selectedSlot =
      state.selectedDay.slots.find((slot) => timeLabel(slot) === chip.dataset.time) || null;
    $('#fieldTime').classList.remove('has-error');
    renderTimeChips();
    renderSummary();
  });

  $('#customerPhone').addEventListener('input', (event) => {
    event.target.value = maskPhone(event.target.value);
  });

  $('#checkoutForm').addEventListener('submit', submitOrder);

  $$('[data-close-modal]').forEach((el) => el.addEventListener('click', closeCheckout));

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if ($('#checkoutModal').classList.contains('is-open')) closeCheckout();
    else closeCart();
  });

  // Reaproveita nome e telefone de um pedido anterior.
  try {
    const saved = JSON.parse(localStorage.getItem('esfiharia-jatai:cliente') || 'null');
    if (saved) {
      $('#customerName').value = saved.name || '';
      $('#customerPhone').value = maskPhone(saved.phone || '');
    }
  } catch { /* ignora dados corrompidos */ }
}
