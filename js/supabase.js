/* Conexão única com o Supabase, usada pelo site e pelo painel.

   A biblioteca vem de um CDN e é carregada com import dinâmico de propósito:
   se ela não vier (internet caindo, CDN fora do ar), o site mostra um aviso
   em vez de abrir uma página em branco. */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const LIBRARY_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

/** O site só funciona depois que config.js estiver preenchido. */
export const isConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SUPABASE_URL.trim()) &&
  SUPABASE_ANON_KEY.trim().length > 30;

export const SETUP_MESSAGE =
  'O site ainda não foi conectado ao banco de dados. Abra o arquivo js/config.js e preencha o endereço e a chave do seu projeto no Supabase.';

export const OFFLINE_MESSAGE =
  'Não foi possível carregar os dados do cardápio. Verifique sua conexão com a internet e atualize a página.';

async function connect() {
  if (!isConfigured) return null;
  try {
    const { createClient } = await import(LIBRARY_URL);
    return createClient(SUPABASE_URL.trim().replace(/\/$/, ''), SUPABASE_ANON_KEY.trim(), {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  } catch (error) {
    console.error('Falha ao carregar a biblioteca do Supabase:', error);
    return null;
  }
}

export const supabase = await connect();
