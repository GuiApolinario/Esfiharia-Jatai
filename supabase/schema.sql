-- =============================================================================
--  Esfiharia Jataí — estrutura do banco no Supabase
--
--  COMO USAR:
--  1. No painel do Supabase, abra "SQL Editor" e clique em "New query".
--  2. Cole este arquivo inteiro e clique em "Run".
--  3. Depois crie o usuário do administrador em Authentication > Users e rode
--     o comando que está no final deste arquivo para dar permissão a ele.
--
--  Pode rodar mais de uma vez sem problema: nada é duplicado nem apagado.
-- =============================================================================


-- =============================================================================
--  1. TABELAS
-- =============================================================================

create table if not exists public.categories (
  id         bigint generated always as identity primary key,
  name       text   not null,
  icon       text   not null default '',
  sort_order int    not null default 0
);

create table if not exists public.products (
  id          bigint  generated always as identity primary key,
  category_id bigint  references public.categories(id) on delete set null,
  name        text    not null,
  description text    not null default '',
  price_cents int     not null default 0 check (price_cents >= 0),
  unit        text    not null default 'unidade',
  image       text    not null default '',
  available   boolean not null default true,
  sort_order  int     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category_id);

-- Configurações da loja (nome, WhatsApp, horários…), uma linha por chave.
create table if not exists public.settings (
  key   text primary key,
  value text not null
);

-- Quem pode mexer no cardápio. Estar logado NÃO basta: o usuário
-- precisa estar nesta tabela.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);


-- =============================================================================
--  2. QUEM É ADMINISTRADOR
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;


-- =============================================================================
--  3. PERMISSÕES (Row Level Security)
--
--  Visitante  -> só consegue LER o cardápio e as configurações.
--  Admin      -> lê e escreve tudo.
-- =============================================================================

alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.settings   enable row level security;
alter table public.admins     enable row level security;

drop policy if exists "categorias visiveis para todos" on public.categories;
create policy "categorias visiveis para todos"
  on public.categories for select using (true);

drop policy if exists "admin gerencia categorias" on public.categories;
create policy "admin gerencia categorias"
  on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- O visitante só enxerga o que está disponível; o admin enxerga tudo
-- (as duas regras se somam para quem está logado).
drop policy if exists "cardapio visivel para todos" on public.products;
create policy "cardapio visivel para todos"
  on public.products for select using (available = true);

drop policy if exists "admin gerencia produtos" on public.products;
create policy "admin gerencia produtos"
  on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "configuracoes visiveis para todos" on public.settings;
create policy "configuracoes visiveis para todos"
  on public.settings for select using (true);

drop policy if exists "admin gerencia configuracoes" on public.settings;
create policy "admin gerencia configuracoes"
  on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin ve a si mesmo" on public.admins;
create policy "admin ve a si mesmo"
  on public.admins for select to authenticated using (user_id = auth.uid());


-- =============================================================================
--  4. FOTOS DOS PRODUTOS
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do update set public = true;

drop policy if exists "fotos visiveis para todos" on storage.objects;
create policy "fotos visiveis para todos"
  on storage.objects for select using (bucket_id = 'produtos');

drop policy if exists "admin envia fotos" on storage.objects;
create policy "admin envia fotos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and public.is_admin());

drop policy if exists "admin troca fotos" on storage.objects;
create policy "admin troca fotos"
  on storage.objects for update to authenticated
  using (bucket_id = 'produtos' and public.is_admin());

drop policy if exists "admin apaga fotos" on storage.objects;
create policy "admin apaga fotos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and public.is_admin());


-- =============================================================================
--  5. CONFIGURAÇÕES INICIAIS DA LOJA
--     (só entram se ainda não existirem — depois você edita pelo painel)
-- =============================================================================

insert into public.settings (key, value) values
  ('store_name',      'Esfiharia Jataí'),
  ('tagline',         'Esfihas na hora, feitas com massa artesanal'),
  ('whatsapp',        '5515997365401'),
  ('address',         'Jataí'),
  ('notice',          ''),
  ('slot_minutes',    '15'),
  ('lead_minutes',    '30'),
  ('max_days_ahead',  '7'),
  ('min_order_cents', '0'),
  ('hours', '{"0":{"open":"18:00","close":"22:30","closed":false},
              "1":{"open":"18:00","close":"22:30","closed":true},
              "2":{"open":"18:00","close":"22:30","closed":false},
              "3":{"open":"18:00","close":"22:30","closed":false},
              "4":{"open":"18:00","close":"22:30","closed":false},
              "5":{"open":"18:00","close":"23:30","closed":false},
              "6":{"open":"18:00","close":"23:30","closed":false}}')
on conflict (key) do nothing;


-- =============================================================================
--  6. CARDÁPIO DE EXEMPLO
--     Some assim que você cadastrar os seus produtos pelo painel.
-- =============================================================================

do $$
declare
  salgadas bigint;
  doces    bigint;
  bebidas  bigint;
begin
  -- Não faz nada se você já tiver cadastrado alguma coisa.
  if exists (select 1 from public.products) then
    return;
  end if;

  insert into public.categories (name, icon, sort_order)
  values ('Esfihas Salgadas', '🥟', 1) returning id into salgadas;
  insert into public.categories (name, icon, sort_order)
  values ('Esfihas Doces', '🍫', 2) returning id into doces;
  insert into public.categories (name, icon, sort_order)
  values ('Bebidas', '🥤', 3) returning id into bebidas;

  insert into public.products (category_id, name, description, price_cents, unit, sort_order) values
    (salgadas, 'Esfiha de Carne',              'Carne bovina moída temperada com cebola, tomate e limão.', 800,  'unidade', 1),
    (salgadas, 'Esfiha de Carne com Queijo',   'Carne temperada coberta com mussarela derretida.',          950,  'unidade', 2),
    (salgadas, 'Esfiha de Frango com Catupiry','Frango desfiado com catupiry cremoso.',                     950,  'unidade', 3),
    (salgadas, 'Esfiha de Queijo',             'Mussarela derretida com um toque de orégano.',              850,  'unidade', 4),
    (salgadas, 'Esfiha de Calabresa',          'Calabresa fatiada com cebola e mussarela.',                 900,  'unidade', 5),
    (salgadas, 'Esfiha de Portuguesa',         'Presunto, queijo, ovo, cebola e azeitona.',                 950,  'unidade', 6),
    (salgadas, 'Esfiha de Palmito',            'Palmito picado no creme de queijo.',                        950,  'unidade', 7),
    (salgadas, 'Esfiha de Bacon com Cheddar',  'Bacon crocante com cheddar cremoso.',                       1050, 'unidade', 8),

    (doces,    'Esfiha de Chocolate',            'Chocolate ao leite derretido na massa quentinha.', 900,  'unidade', 9),
    (doces,    'Esfiha de Chocolate com Morango','Chocolate ao leite com morangos frescos.',         1100, 'unidade', 10),
    (doces,    'Esfiha de Romeu e Julieta',      'Goiabada com queijo mussarela.',                   950,  'unidade', 11),
    (doces,    'Esfiha de Banana com Canela',    'Banana, açúcar e canela.',                         900,  'unidade', 12),
    (doces,    'Esfiha de Doce de Leite',        'Doce de leite cremoso com leite em pó.',           950,  'unidade', 13),
    (doces,    'Esfiha de Prestígio',            'Chocolate com coco ralado.',                       1000, 'unidade', 14),

    (bebidas,  'Coca-Cola Lata 350ml',           'Refrigerante gelado.',   600,  'lata 350ml',    15),
    (bebidas,  'Coca-Cola 600ml',                'Garrafa gelada.',        900,  'garrafa 600ml', 16),
    (bebidas,  'Guaraná Antarctica Lata 350ml',  'Refrigerante gelado.',   600,  'lata 350ml',    17),
    (bebidas,  'Guaraná Antarctica 2L',          'Ideal para dividir.',    1400, 'garrafa 2L',    18),
    (bebidas,  'Suco de Laranja Natural 500ml',  'Feito na hora, sem açúcar.', 1000, 'copo 500ml', 19),
    (bebidas,  'Água Mineral 500ml',             'Sem gás.',               400,  'garrafa 500ml', 20),
    (bebidas,  'Água com Gás 500ml',             'Gelada.',                500,  'garrafa 500ml', 21);
end $$;


-- =============================================================================
--  7. ÚLTIMO PASSO — LIBERAR O SEU ACESSO AO PAINEL
--
--  Antes de rodar o comando abaixo:
--    a) Vá em Authentication > Users > "Add user" > "Create new user"
--    b) Informe o seu e-mail e uma senha, e marque "Auto Confirm User"
--
--  Depois troque o e-mail abaixo pelo seu, tire os dois tracinhos "--"
--  do começo da linha e rode:
-- =============================================================================

-- insert into public.admins (user_id)
-- select id from auth.users where email = 'seu-email@exemplo.com'
-- on conflict (user_id) do nothing;
