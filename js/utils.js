/* Funções auxiliares compartilhadas pelo site e pelo painel. */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const money = (cents) => BRL.format((Number(cents) || 0) / 100);

/** "7,50" | "7.50" | "R$ 7,50" -> 750 */
export function parseMoney(input) {
  const normalized = String(input ?? '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

/** Aplica a máscara (15) 99999-9999 conforme o usuário digita. */
export function maskPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export const onlyDigits = (value) => String(value ?? '').replace(/\D/g, '');

export const isValidPhone = (value) => {
  const digits = onlyDigits(value);
  return digits.length === 10 || digits.length === 11;
};

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

/** Aviso discreto no rodapé da tela. tipo: '' | 'ok' | 'bad' */
let toastTimer;
export function toast(message, tipo = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast is-on${tipo ? ` toast--${tipo}` : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2800);
}

/** Reduz a foto no navegador antes de enviar, para o site carregar rápido. */
export function shrinkImage(file, maxSize = 1000, quality = 0.82) {
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
        'image/jpeg', quality);
    };

    image.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    image.src = url;
  });
}

/** O ícone da categoria aceita um emoji digitado OU uma foto enviada no painel. */
export const isImageIcon = (value) => {
  const v = String(value || '').trim();
  return /^https?:\/\//.test(v) || v.startsWith('data:image');
};

/** Emoji vira texto puro; foto vira <img> do tamanho da fonte ao redor. */
export function categoryIconHtml(icon, fallback) {
  const v = String(icon || '').trim();
  if (!v) return escapeHtml(fallback);
  if (isImageIcon(v)) return `<img class="cat-ic" src="${escapeHtml(v)}" alt="">`;
  return escapeHtml(v);
}

/** 20/08/2026 20:45 */
export function dateTimeBR(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
