/* Painel do administrador: login, produtos, categorias e configurações da loja. */

import { $, $$, escapeHtml, maskPhone, money, onlyDigits, parseMoney, toast } from './utils.js';
import { isConfigured, SETUP_MESSAGE } from './supabase.js';
import * as data from './data.js';

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

const state = {
  user: null,
  products: [],
  categories: [],
  settings: null,
  editingProductId: null,
  editingCategoryId: null,
  pendingImage: '',
};

boot();

async function boot() {
  bindEvents();

  if (!isConfigured) {
    showLogin();
    $('#loginForm').hidden = true;
    return showAlert('#loginError', SETUP_MESSAGE);
  }

  try {
    const user = await data.currentUser();
    if (user) await enterPanel(user);
    else showLogin();
  } catch {
    showLogin();
  }
}

/* -------------------------------------------------------------------- login */

function showLogin() {
  $('#loginScreen').style.display = 'grid';
  $('#adminShell').classList.remove('is-visible');
  $('#email').focus();
}

async function enterPanel(user) {
  state.user = user;
  $('#loginScreen').style.display = 'none';
  $('#adminShell').classList.add('is-visible');
  $('#adminUser').textContent = user.email || 'Administrador';
  await Promise.all([loadCategories(), loadProducts(), loadSettings()]);
}

async function handleLogin(event) {
  event.preventDefault();
  const button = $('#loginBtn');
  const error = $('#loginError');

  button.disabled = true;
  button.textContent = 'Entrando…';
  error.classList.remove('is-visible');

  try {
    const user = await data.signIn($('#email').value, $('#password').value);
    $('#password').value = '';
    await enterPanel(user);
  } catch (err) {
    error.textContent = err.message;
    error.classList.add('is-visible');
    $('#password').select();
  } finally {
    button.disabled = false;
    button.textContent = 'Entrar';
  }
}

async function handleLogout() {
  await data.signOut().catch(() => {});
  location.reload();
}

/** Quando a sessão expira, volta para o login em vez de mostrar erro solto. */
function guard(error) {
  if (/sess(ã|a)o expirou|JWT|token .*expired|not authenticated/i.test(error.message)) {
    toast('Sua sessão expirou. Entre novamente.');
    setTimeout(() => location.reload(), 1500);
    return true;
  }
  return false;
}

/* ----------------------------------------------------------------- produtos */

async function loadProducts() {
  try {
    state.products = await data.listProducts();
    renderProducts();
  } catch (error) {
    if (!guard(error)) toast(error.message);
  }
}

function renderProducts() {
  const term = $('#productSearch').value.trim().toLowerCase();
  const filter = $('#productFilter').value;

  const visible = state.products.filter((product) => {
    const matchesTerm =
      !term ||
      product.name.toLowerCase().includes(term) ||
      (product.description || '').toLowerCase().includes(term);
    const matchesCategory = !filter || String(product.category_id) === filter;
    return matchesTerm && matchesCategory;
  });

  const list = $('#productList');

  if (!visible.length) {
    list.innerHTML = `
      <div class="empty-box">
        <div class="empty-box__icon">🥟</div>
        <p><strong>${state.products.length ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado ainda.'}</strong></p>
        <p>${state.products.length ? 'Tente outra busca ou categoria.' : 'Clique em “Novo produto” para começar o cardápio.'}</p>
      </div>`;
    return;
  }

  list.innerHTML = visible
    .map(
      (product) => `
      <article class="row ${product.available ? '' : 'is-off'}" data-id="${product.id}">
        <div class="row__thumb">${
          product.image
            ? `<img src="${escapeHtml(product.image)}" alt="">`
            : '<span aria-hidden="true">🥟</span>'
        }</div>
        <div>
          <div class="row__title">
            ${escapeHtml(product.name)}
            ${product.available ? '' : '<span class="tag tag--off">Indisponível</span>'}
          </div>
          ${product.description ? `<p class="row__desc">${escapeHtml(product.description)}</p>` : ''}
          <div class="row__meta">
            <span class="tag tag--price">${money(product.price_cents)}</span>
            <span class="tag">${escapeHtml(product.category_name || 'Sem categoria')}</span>
            <span>por ${escapeHtml(product.unit || 'unidade')}</span>
          </div>
        </div>
        <div class="row__actions">
          <label class="switch" title="Disponível no cardápio">
            <input type="checkbox" data-toggle="${product.id}" ${product.available ? 'checked' : ''}>
            <span class="switch__track"></span>
          </label>
          <button class="mini-btn" data-edit="${product.id}">Editar</button>
          <button class="mini-btn mini-btn--danger" data-delete="${product.id}">Excluir</button>
        </div>
      </article>`
    )
    .join('');
}

function openProductModal(product = null) {
  state.editingProductId = product?.id ?? null;
  state.pendingImage = product?.image || '';

  $('#productModalTitle').textContent = product ? 'Editar produto' : 'Novo produto';
  $('#productName').value = product?.name || '';
  $('#productDescription').value = product?.description || '';
  $('#productPrice').value = product ? (product.price_cents / 100).toFixed(2).replace('.', ',') : '';
  $('#productUnit').value = product?.unit || 'unidade';
  $('#productOrder').value = product?.sort_order ?? '';
  $('#productAvailable').checked = product ? Boolean(product.available) : true;

  $('#productCategory').innerHTML =
    '<option value="">Sem categoria</option>' +
    state.categories
      .map(
        (category) =>
          `<option value="${category.id}" ${
            product?.category_id === category.id ? 'selected' : ''
          }>${escapeHtml(category.name)}</option>`
      )
      .join('');

  if (!product && state.categories.length) $('#productCategory').value = String(state.categories[0].id);

  renderImagePreview();
  hideAlert('#productError');
  openModal('#productModal');
  setTimeout(() => $('#productName').focus(), 240);
}

async function saveProduct(event) {
  event.preventDefault();
  const button = $('#saveProductBtn');
  const priceCents = parseMoney($('#productPrice').value);

  if (!$('#productName').value.trim()) return showAlert('#productError', 'Informe o nome do produto.');
  if (!Number.isFinite(priceCents) || priceCents < 0) {
    return showAlert('#productError', 'Informe um preço válido, por exemplo 8,00.');
  }

  const payload = {
    name: $('#productName').value.trim(),
    description: $('#productDescription').value.trim(),
    price_cents: priceCents,
    unit: $('#productUnit').value.trim() || 'unidade',
    category_id: $('#productCategory').value ? Number($('#productCategory').value) : null,
    image: state.pendingImage,
    available: $('#productAvailable').checked,
  };
  const order = $('#productOrder').value;
  if (order !== '') payload.sort_order = Number(order);

  button.disabled = true;
  button.textContent = 'Salvando…';

  try {
    if (state.editingProductId) await data.updateProduct(state.editingProductId, payload);
    else await data.createProduct(payload);
    closeModal('#productModal');
    toast(state.editingProductId ? 'Produto atualizado.' : 'Produto cadastrado.');
    await loadProducts();
  } catch (error) {
    if (!guard(error)) showAlert('#productError', error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Salvar produto';
  }
}

async function deleteProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  if (!confirm(`Excluir "${product.name}" do cardápio? Essa ação não pode ser desfeita.`)) return;

  try {
    await data.deleteProduct(id);
    toast('Produto excluído.');
    await loadProducts();
  } catch (error) {
    if (!guard(error)) toast(error.message);
  }
}

async function toggleProduct(id, available) {
  try {
    await data.updateProduct(id, { available });
    const product = state.products.find((item) => item.id === id);
    if (product) product.available = available;
    renderProducts();
    toast(available ? 'Produto disponível no cardápio.' : 'Produto escondido do cardápio.');
  } catch (error) {
    if (!guard(error)) toast(error.message);
    await loadProducts();
  }
}

/* ------------------------------------------------------------------ imagem */

function renderImagePreview() {
  const preview = $('#imagePreview');
  preview.innerHTML = state.pendingImage
    ? `<img src="${escapeHtml(state.pendingImage)}" alt="">`
    : '<span aria-hidden="true">📷</span>';
  $('#removeImageBtn').hidden = !state.pendingImage;
}

/** Reduz a foto no navegador antes de enviar, para o site carregar rápido. */
function shrinkImage(file, maxSize = 1000, quality = 0.82) {
  return new Promise((resolve) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return resolve(file);

    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      if (scale === 1 && file.size < 400_000) return resolve(file);

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : file),
        'image/jpeg',
        quality
      );
    };

    image.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    image.src = url;
  });
}

async function uploadImage(file) {
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) return showAlert('#productError', 'Essa imagem é grande demais.');

  const button = $('#pickImageBtn');
  button.disabled = true;
  button.textContent = 'Enviando…';
  hideAlert('#productError');

  try {
    state.pendingImage = await data.uploadImage(await shrinkImage(file));
    renderImagePreview();
  } catch (error) {
    if (!guard(error)) showAlert('#productError', error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Escolher foto';
    $('#imageInput').value = '';
  }
}

/* --------------------------------------------------------------- categorias */

async function loadCategories() {
  try {
    state.categories = await data.listCategories();
    renderCategories();

    const filter = $('#productFilter');
    const current = filter.value;
    filter.innerHTML =
      '<option value="">Todas as categorias</option>' +
      state.categories
        .map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
        .join('');
    filter.value = current;
  } catch (error) {
    if (!guard(error)) toast(error.message);
  }
}

function renderCategories() {
  const list = $('#categoryList');

  if (!state.categories.length) {
    list.innerHTML = `
      <div class="empty-box">
        <div class="empty-box__icon">🗂️</div>
        <p><strong>Nenhuma categoria cadastrada.</strong></p>
        <p>Crie categorias como “Esfihas Salgadas” e “Bebidas” para organizar o cardápio.</p>
      </div>`;
    return;
  }

  list.innerHTML = state.categories
    .map(
      (category) => `
      <article class="row" data-id="${category.id}">
        <div class="row__thumb" style="font-size:1.8rem">${escapeHtml(category.icon || '🗂️')}</div>
        <div>
          <div class="row__title">${escapeHtml(category.name)}</div>
          <div class="row__meta">
            <span>${category.product_count} ${category.product_count === 1 ? 'produto' : 'produtos'}</span>
            <span>ordem ${category.sort_order}</span>
          </div>
        </div>
        <div class="row__actions">
          <button class="mini-btn" data-edit-cat="${category.id}">Editar</button>
          <button class="mini-btn mini-btn--danger" data-delete-cat="${category.id}">Excluir</button>
        </div>
      </article>`
    )
    .join('');
}

function openCategoryModal(category = null) {
  state.editingCategoryId = category?.id ?? null;
  $('#categoryModalTitle').textContent = category ? 'Editar categoria' : 'Nova categoria';
  $('#categoryName').value = category?.name || '';
  $('#categoryIcon').value = category?.icon || '';
  $('#categoryOrder').value = category?.sort_order ?? '';
  hideAlert('#categoryError');
  openModal('#categoryModal');
  setTimeout(() => $('#categoryName').focus(), 240);
}

async function saveCategory(event) {
  event.preventDefault();
  const name = $('#categoryName').value.trim();
  if (!name) return showAlert('#categoryError', 'Informe o nome da categoria.');

  const payload = { name, icon: $('#categoryIcon').value.trim() };
  const order = $('#categoryOrder').value;
  if (order !== '') payload.sort_order = Number(order);

  try {
    if (state.editingCategoryId) await data.updateCategory(state.editingCategoryId, payload);
    else await data.createCategory(payload);
    closeModal('#categoryModal');
    toast(state.editingCategoryId ? 'Categoria atualizada.' : 'Categoria criada.');
    await Promise.all([loadCategories(), loadProducts()]);
  } catch (error) {
    if (!guard(error)) showAlert('#categoryError', error.message);
  }
}

async function deleteCategory(id) {
  const category = state.categories.find((item) => item.id === id);
  if (!category) return;

  const warning = category.product_count
    ? `A categoria "${category.name}" tem ${category.product_count} produto(s). Eles continuarão cadastrados, mas ficarão sem categoria. Excluir mesmo assim?`
    : `Excluir a categoria "${category.name}"?`;
  if (!confirm(warning)) return;

  try {
    await data.deleteCategory(id);
    toast('Categoria excluída.');
    await Promise.all([loadCategories(), loadProducts()]);
  } catch (error) {
    if (!guard(error)) toast(error.message);
  }
}

/* ------------------------------------------------------------ configurações */

async function loadSettings() {
  try {
    state.settings = await data.getSettings();
    renderSettings();
  } catch (error) {
    if (!guard(error)) toast(error.message);
  }
}

function renderSettings() {
  const settings = state.settings;
  $('#storeName').value = settings.store_name;
  $('#storeTagline').value = settings.tagline;
  $('#storeAddress').value = settings.address;
  $('#storeNotice').value = settings.notice;
  $('#storeWhats').value = maskPhone(String(settings.whatsapp).replace(/^55/, ''));
  $('#leadMinutes').value = settings.lead_minutes;
  $('#slotMinutes').value = settings.slot_minutes;
  $('#maxDays').value = settings.max_days_ahead;
  $('#minOrder').value = (settings.min_order_cents / 100).toFixed(2).replace('.', ',');

  $('#hoursGrid').innerHTML = WEEKDAYS.map((day, index) => {
    const config = settings.hours?.[index] || { open: '18:00', close: '22:30', closed: true };
    return `
      <div class="hours-row ${config.closed ? 'is-closed' : ''}" data-day="${index}">
        <span class="hours-row__day">${day}</span>
        <input class="input" type="time" data-open="${index}" value="${config.open}">
        <input class="input" type="time" data-close="${index}" value="${config.close}">
        <label class="switch">
          <input type="checkbox" data-open-day="${index}" ${config.closed ? '' : 'checked'}>
          <span class="switch__track"></span>
          <span>${config.closed ? 'Fechado' : 'Aberto'}</span>
        </label>
      </div>`;
  }).join('');
}

function collectHours() {
  const hours = {};
  for (const row of $$('.hours-row')) {
    const index = row.dataset.day;
    hours[index] = {
      open: $(`[data-open="${index}"]`, row).value || '18:00',
      close: $(`[data-close="${index}"]`, row).value || '22:30',
      closed: !$(`[data-open-day="${index}"]`, row).checked,
    };
  }
  return hours;
}

async function saveSettings(event) {
  event.preventDefault();
  const button = $('#saveSettingsBtn');
  hideAlert('#settingsOk');
  hideAlert('#settingsError');

  const whatsappDigits = onlyDigits($('#storeWhats').value);
  if (whatsappDigits.length < 10) {
    return showAlert('#settingsError', 'Informe o WhatsApp com DDD, por exemplo (15) 99736-5401.');
  }

  const minOrder = $('#minOrder').value.trim() === '' ? 0 : parseMoney($('#minOrder').value);
  if (!Number.isFinite(minOrder) || minOrder < 0) {
    return showAlert('#settingsError', 'Informe um pedido mínimo válido, por exemplo 20,00.');
  }

  button.disabled = true;
  button.textContent = 'Salvando…';

  try {
    state.settings = await data.saveSettings({
      store_name: $('#storeName').value.trim(),
      tagline: $('#storeTagline').value.trim(),
      address: $('#storeAddress').value.trim(),
      notice: $('#storeNotice').value.trim(),
      whatsapp: whatsappDigits.startsWith('55') ? whatsappDigits : `55${whatsappDigits}`,
      lead_minutes: $('#leadMinutes').value,
      slot_minutes: $('#slotMinutes').value,
      max_days_ahead: $('#maxDays').value,
      min_order_cents: String(minOrder),
      hours: collectHours(),
    });
    renderSettings();
    showAlert('#settingsOk');
    toast('Configurações salvas.');
  } catch (error) {
    if (!guard(error)) showAlert('#settingsError', error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Salvar configurações';
  }
}

/* -------------------------------------------------------------------- senha */

async function changePassword(event) {
  event.preventDefault();
  hideAlert('#passwordError');
  hideAlert('#passwordOk');

  const current = $('#currentPassword').value;
  const next = $('#newPassword').value;

  if (next.length < 6) return showAlert('#passwordError', 'A nova senha precisa ter pelo menos 6 caracteres.');
  if (next !== $('#confirmPassword').value) return showAlert('#passwordError', 'As senhas não conferem.');

  try {
    await data.changePassword(current, next);
    $('#passwordForm').reset();
    showAlert('#passwordOk');
  } catch (error) {
    showAlert('#passwordError', error.message);
  }
}

/* ------------------------------------------------------------------ helpers */

function showAlert(selector, message) {
  const el = $(selector);
  if (message) el.textContent = message;
  el.classList.add('is-visible');
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

const hideAlert = (selector) => $(selector).classList.remove('is-visible');

function openModal(selector) {
  $(selector).classList.add('is-open');
  document.body.classList.add('no-scroll');
}

function closeModal(selector) {
  $(selector).classList.remove('is-open');
  document.body.classList.remove('no-scroll');
}

/* ------------------------------------------------------------------ eventos */

function bindEvents() {
  $('#loginForm').addEventListener('submit', handleLogin);
  $('#logoutBtn').addEventListener('click', handleLogout);

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((item) => item.classList.toggle('is-active', item === tab));
      $$('.panel').forEach((panel) =>
        panel.classList.toggle('is-active', panel.dataset.panel === tab.dataset.tab)
      );
    });
  });

  // Produtos
  $('#newProductBtn').addEventListener('click', () => openProductModal());
  $('#productSearch').addEventListener('input', renderProducts);
  $('#productFilter').addEventListener('change', renderProducts);
  $('#productForm').addEventListener('submit', saveProduct);

  $('#productList').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit]');
    if (edit) return openProductModal(state.products.find((p) => p.id === Number(edit.dataset.edit)));
    const remove = event.target.closest('[data-delete]');
    if (remove) return deleteProduct(Number(remove.dataset.delete));
  });

  $('#productList').addEventListener('change', (event) => {
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) toggleProduct(Number(toggle.dataset.toggle), toggle.checked);
  });

  // Foto
  $('#pickImageBtn').addEventListener('click', () => $('#imageInput').click());
  $('#imageInput').addEventListener('change', (event) => uploadImage(event.target.files?.[0]));
  $('#removeImageBtn').addEventListener('click', () => {
    state.pendingImage = '';
    renderImagePreview();
  });

  // Categorias
  $('#newCategoryBtn').addEventListener('click', () => openCategoryModal());
  $('#categoryForm').addEventListener('submit', saveCategory);

  $('#categoryList').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-cat]');
    if (edit) return openCategoryModal(state.categories.find((c) => c.id === Number(edit.dataset.editCat)));
    const remove = event.target.closest('[data-delete-cat]');
    if (remove) return deleteCategory(Number(remove.dataset.deleteCat));
  });

  // Loja e conta
  $('#settingsForm').addEventListener('submit', saveSettings);
  $('#passwordForm').addEventListener('submit', changePassword);
  $('#storeWhats').addEventListener('input', (event) => {
    event.target.value = maskPhone(event.target.value);
  });

  $('#hoursGrid').addEventListener('change', (event) => {
    const toggle = event.target.closest('[data-open-day]');
    if (!toggle) return;
    const row = toggle.closest('.hours-row');
    row.classList.toggle('is-closed', !toggle.checked);
    toggle.parentElement.querySelector('span:last-child').textContent = toggle.checked ? 'Aberto' : 'Fechado';
  });

  // Fechar modais
  $$('[data-close]').forEach((el) =>
    el.addEventListener('click', () => closeModal(`#${el.dataset.close}Modal`))
  );

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeModal('#productModal');
    closeModal('#categoryModal');
  });
}
