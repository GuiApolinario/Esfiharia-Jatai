/* Conexão única com o Supabase, usada pelo site e pelo painel.

   A biblioteca vem de um CDN e é carregada com import dinâmico de propósito:
   se ela não vier (internet caindo, CDN fora do ar), o site mostra um aviso
   em vez de abrir uma página em branco. */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=8';

const LIBRARY_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

/* A página "Data API" do Supabase mostra a URL já com /rest/v1 no final, mas a
   biblioteca quer só a base do projeto. Aceitamos as duas formas e limpamos. */
function normalizaUrl(bruta) {
  const texto = String(bruta || '').trim();
  if (!texto) return '';
  try {
    const { protocol, hostname } = new URL(texto);
    if (protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/i.test(hostname)) return '';
    return `https://${hostname}`;
  } catch {
    return '';
  }
}

const URL_LIMPA = normalizaUrl(SUPABASE_URL);
const CHAVE = SUPABASE_ANON_KEY.trim();

/* TRAVA DE SEGURANÇA
   A chave secreta ignora todas as permissões do banco. Como este repositório
   é público, colar uma aqui vazaria acesso total ao cardápio e aos pedidos.
   O site se recusa a funcionar em vez de subir com ela. */
const ehChaveSecreta =
  /^sb_secret_/i.test(CHAVE) ||
  /^eyJ/.test(CHAVE) && /service_role/.test(atobSeguro(CHAVE.split('.')[1] || ''));

function atobSeguro(base64) {
  try { return atob(base64.replace(/-/g, '+').replace(/_/g, '/')); } catch { return ''; }
}

/** O site só funciona depois que config.js estiver preenchido. */
export const isConfigured = Boolean(URL_LIMPA) && CHAVE.length > 30 && !ehChaveSecreta;

export const SETUP_MESSAGE = ehChaveSecreta
  ? '⚠️ A chave preenchida em js/config.js é SECRETA e não pode ficar num repositório público. Apague, gere uma nova em Project Settings › API Keys › Secret keys (para invalidar a que vazou) e use a "Publishable key" no lugar.'
  : 'O site ainda não foi conectado ao banco de dados. Abra o arquivo js/config.js e preencha o endereço e a chave do seu projeto no Supabase.';

export const OFFLINE_MESSAGE =
  'Não foi possível carregar os dados do cardápio. Verifique sua conexão com a internet e atualize a página.';

async function connect() {
  if (!isConfigured) return null;
  try {
    const { createClient } = await import(LIBRARY_URL);
    return createClient(URL_LIMPA, CHAVE, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  } catch (error) {
    console.error('Falha ao carregar a biblioteca do Supabase:', error);
    return null;
  }
}

export const supabase = await connect();
