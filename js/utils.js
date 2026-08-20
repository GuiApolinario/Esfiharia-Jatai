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

/** Toast discreto no rodapé da tela. */
let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
}
