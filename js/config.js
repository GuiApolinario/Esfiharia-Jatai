/* =============================================================================
   CONFIGURAÇÃO DO SITE — preencha as duas linhas do final, uma única vez.

   ONDE ENCONTRAR CADA VALOR no painel do Supabase (supabase.com/dashboard):

   SUPABASE_URL
     Menu lateral > Data API  (ou o botão verde "Connect" no topo)
     Copie o "Project URL". Fica parecido com: https://abcdefgh.supabase.co

   SUPABASE_ANON_KEY
     Menu lateral > Project Settings > API Keys
     Aba "Publishable and secret API keys"
     Copie a "Publishable key" — começa com  sb_publishable_...

     (Se o seu projeto for antigo e só tiver a aba "Legacy anon, service_role
      API keys", use a chave "anon public" de lá. As duas funcionam.)

   -------------------------------------------------------------------------
   PODE PUBLICAR ESSES DOIS VALORES SEM MEDO.
   A chave publicável foi feita para ficar visível no navegador: sozinha, ela
   só permite LER o cardápio. Quem decide o que pode ser alterado são as
   permissões criadas pelo arquivo supabase/schema.sql.

   NUNCA COLE AQUI a chave da seção "Secret keys" (sb_secret_...) nem a
   "service_role". Elas ignoram todas as permissões e dariam acesso total ao
   banco para qualquer pessoa que abrisse o repositório.
   O site tem uma trava e se recusa a funcionar se detectar uma delas.
   ========================================================================== */

export const SUPABASE_URL = 'https://ytlyfcjzxuojhlfergch.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_w6Dj1d0pUeoUhl8fUveaAg_7y7kFjtZ';
