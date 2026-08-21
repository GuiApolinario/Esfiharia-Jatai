/* =============================================================================
   Ícones desenhados à mão em SVG.

   O emoji 🥟 é um pastel/guioza fechado — não parece nada com uma esfiha,
   que é aberta e redonda, com o recheio à mostra. Estes desenhos entram no
   lugar da foto enquanto o produto não tem uma.
   ========================================================================== */

/** Esfiha aberta vista de cima: massa dourada com recheio no meio. */
export const ESFIHA = `
<svg viewBox="0 0 64 64" class="ic" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="esf-massa" cx="38%" cy="30%" r="78%">
      <stop offset="0" stop-color="#f8dca6"/>
      <stop offset=".62" stop-color="#eebc6f"/>
      <stop offset="1" stop-color="#d99b45"/>
    </radialGradient>
    <radialGradient id="esf-recheio" cx="40%" cy="32%" r="72%">
      <stop offset="0" stop-color="#b96a33"/>
      <stop offset="1" stop-color="#783d1a"/>
    </radialGradient>
  </defs>

  <!-- massa, de propósito um pouco irregular: esfiha é feita à mão -->
  <path fill="url(#esf-massa)" d="M32 4.6c8.4-.2 15.2 2.6 20.6 7.7 5.4 5.2 8 11.8 7.7 19.9-.3 8-3.2 14.6-8.7 19.4C46.1 56.4 39.6 58.6 32 58.4c-7.8.2-14.4-2.2-19.8-7.1C6.8 46.4 4 39.8 4 31.8c0-8 2.6-14.6 7.9-19.7C17.1 7 23.8 4.5 32 4.6Z"/>
  <path fill="#c98c3c" opacity=".45" d="M32 4.6c8.4-.2 15.2 2.6 20.6 7.7 5.4 5.2 8 11.8 7.7 19.9-.3 8-3.2 14.6-8.7 19.4C46.1 56.4 39.6 58.6 32 58.4c-7.8.2-14.4-2.2-19.8-7.1C6.8 46.4 4 39.8 4 31.8c0-8 2.6-14.6 7.9-19.7C17.1 7 23.8 4.5 32 4.6Zm0 5.2c-6.7 0-12.2 2-16.4 6.1-4.3 4.1-6.4 9.4-6.4 15.9 0 6.6 2.2 11.9 6.5 16 4.3 4 9.8 5.9 16.3 5.8 6.4.1 11.8-1.8 16.1-5.8 4.4-4.1 6.6-9.5 6.7-16.1 0-6.6-2-11.9-6.3-16-4.2-4-9.7-6-16.5-5.9Z"/>

  <!-- recheio -->
  <path fill="url(#esf-recheio)" d="M32 12.4c6.2-.1 11.3 1.7 15.2 5.5 3.9 3.7 5.8 8.4 5.7 14.1.1 5.7-1.8 10.4-5.8 14.1-3.9 3.6-9 5.4-15.1 5.3-6-.1-11-1.9-14.9-5.5-3.8-3.7-5.7-8.3-5.7-13.9 0-5.6 1.9-10.3 5.8-14 3.8-3.7 8.7-5.5 14.8-5.6Z"/>

  <!-- pedacinhos do recheio -->
  <circle cx="24.5" cy="25.5" r="2.6" fill="#8f5127" opacity=".9"/>
  <circle cx="38.5" cy="23.5" r="1.9" fill="#8f5127" opacity=".75"/>
  <circle cx="41" cy="35"   r="2.3" fill="#8f5127" opacity=".8"/>
  <circle cx="30"  cy="40"  r="2.7" fill="#8f5127" opacity=".85"/>
  <circle cx="22"  cy="36"  r="1.8" fill="#8f5127" opacity=".7"/>
  <circle cx="32"  cy="30"  r="1.5" fill="#a35f2e" opacity=".65"/>

  <!-- brilho da assadeira -->
  <ellipse cx="23" cy="19" rx="7" ry="3.6" fill="#fff" opacity=".18" transform="rotate(-24 23 19)"/>
</svg>`;

/** Copo com canudo, para bebidas. */
export const BEBIDA = `
<svg viewBox="0 0 64 64" class="ic" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="beb-liq" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e2564a"/>
      <stop offset="1" stop-color="#b4271f"/>
    </linearGradient>
  </defs>
  <rect x="35" y="6" width="5" height="18" rx="2.5" fill="#e9eef2" transform="rotate(14 37 15)"/>
  <path fill="url(#beb-liq)" d="M17 22h30l-3.4 30.6c-.4 3.6-2.4 5.4-6 5.4H26.4c-3.6 0-5.6-1.8-6-5.4L17 22Z"/>
  <path fill="#fff" opacity=".22" d="M22 22h5l3 34h-4.2c-1.6 0-2.5-.8-2.7-2.4L22 22Z"/>
  <rect x="14" y="17" width="36" height="7" rx="3.5" fill="#f3f6f8"/>
  <rect x="14" y="17" width="36" height="3.4" rx="1.7" fill="#fff"/>
</svg>`;

const PALAVRAS_BEBIDA = /bebida|refriger|cerveja|suco|lata|garrafa|água|agua|litro/i;

/** Escolhe o desenho certo conforme a categoria ou a unidade do produto. */
export function placeholder(nomeCategoria = '', unidade = '') {
  return PALAVRAS_BEBIDA.test(`${nomeCategoria} ${unidade}`) ? BEBIDA : ESFIHA;
}

/* ---------------------------------------------------------------------------
   Cena da tela de carregamento: prato de madeira com quatro esfihas abertas.
   Desenhada à mão porque o site não carrega imagem de fora.
   -------------------------------------------------------------------------- */

/** Uma esfiha aberta, com o recheio na cor pedida. */
function esfihaCena(x, y, r, recheio, pontos, id) {
  return `
  <g transform="translate(${x} ${y})">
    <ellipse cx="0" cy="${r * 0.16}" rx="${r * 1.02}" ry="${r * 0.42}" fill="#000" opacity=".18"/>
    <ellipse cx="0" cy="0" rx="${r}" ry="${r * 0.62}" fill="url(#massa${id})"/>
    <ellipse cx="0" cy="${-r * 0.06}" rx="${r * 0.74}" ry="${r * 0.44}" fill="${recheio}"/>
    <ellipse cx="${-r * 0.3}" cy="${-r * 0.28}" rx="${r * 0.3}" ry="${r * 0.1}" fill="#fff" opacity=".14"/>
    ${pontos.map(([px, py, pr, cor]) => `<ellipse cx="${px * r}" cy="${py * r}" rx="${pr * r}" ry="${pr * r * 0.62}" fill="${cor}" opacity=".85"/>`).join('')}
  </g>`;
}

export const CENA_ESFIHAS = `
<svg viewBox="0 0 340 210" class="splash__art" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="massa1" cx="38%" cy="26%"><stop offset="0" stop-color="#fadfa8"/><stop offset="1" stop-color="#dd9f47"/></radialGradient>
    <radialGradient id="massa2" cx="38%" cy="26%"><stop offset="0" stop-color="#fadfa8"/><stop offset="1" stop-color="#dd9f47"/></radialGradient>
    <radialGradient id="massa3" cx="38%" cy="26%"><stop offset="0" stop-color="#fadfa8"/><stop offset="1" stop-color="#dd9f47"/></radialGradient>
    <radialGradient id="massa4" cx="38%" cy="26%"><stop offset="0" stop-color="#fadfa8"/><stop offset="1" stop-color="#dd9f47"/></radialGradient>
    <linearGradient id="tabua" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a9743d"/><stop offset="1" stop-color="#7a4f26"/>
    </linearGradient>
  </defs>

  <!-- fumaça -->
  <g class="splash__steam" fill="none" stroke="#fff" stroke-opacity=".26" stroke-width="4" stroke-linecap="round">
    <path d="M126 62c-7-11 6-16-1-27"/>
    <path d="M170 52c-7-12 6-17-1-28"/>
    <path d="M214 62c-7-11 6-16-1-27"/>
  </g>

  <!-- tábua -->
  <ellipse cx="170" cy="150" rx="150" ry="52" fill="#5f3c1c"/>
  <ellipse cx="170" cy="144" rx="150" ry="52" fill="url(#tabua)"/>
  <ellipse cx="170" cy="142" rx="132" ry="43" fill="#936435" opacity=".55"/>

  ${esfihaCena(108, 122, 58, '#7b4520', [[-.3,-.1,.1,'#5d3115'],[.12,-.22,.08,'#5d3115'],[.3,.08,.09,'#5d3115'],[-.05,.14,.07,'#5d3115'],[.02,-.05,.06,'#3f7a2a']], 1)}
  ${esfihaCena(232, 100, 50, '#8a4d22', [[-.25,-.12,.1,'#63341a'],[.2,-.05,.09,'#63341a'],[-.02,.16,.08,'#63341a'],[.05,-.24,.06,'#3f7a2a']], 2)}
  ${esfihaCena(252, 148, 52, '#efd794', [[-.28,-.05,.09,'#c99a3f'],[.22,-.14,.07,'#c99a3f'],[.05,.16,.08,'#c99a3f'],[-.08,-.22,.06,'#c99a3f']], 3)}
  ${esfihaCena(150, 168, 60, '#c0392b', [[-.3,-.08,.11,'#8e1f16'],[.18,-.18,.09,'#8e1f16'],[.28,.1,.1,'#8e1f16'],[-.06,.18,.08,'#8e1f16'],[-.02,-.02,.06,'#3f7a2a']], 4)}
</svg>`;
