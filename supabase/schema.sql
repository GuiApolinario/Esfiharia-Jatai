-- =============================================================================
--  ESFIHARIA JATAÍ — banco de dados completo
--
--  COMO USAR (uma única vez):
--    1. No Supabase, abra "SQL Editor" e clique em "New query"
--    2. Cole ESTE ARQUIVO INTEIRO e clique em "Run"
--    3. Siga o PASSO FINAL lá embaixo para liberar seu acesso ao painel
--
--  Pode rodar quantas vezes quiser: nada é duplicado nem apagado.
--
--  -------------------------------------------------------------------------
--  ARQUITETURA — LEIA ISTO ANTES DE MEXER
--
--  O site é estático (GitHub Pages), então NÃO existe servidor de aplicação.
--  O "servidor" é este banco: a função create_order() roda com SECURITY
--  DEFINER dentro do Postgres.
--
--  O navegador manda SOMENTE ids e quantidades. Os preços são lidos aqui,
--  da tabela products. Qualquer preço que venha do navegador é IGNORADO.
--
--  A mensagem do WhatsApp é apenas uma cópia amigável do pedido. A fonte
--  oficial de itens, preços e total é a linha gravada em public.orders.
--  Se o cliente editar a mensagem antes de enviar, o painel continua
--  mostrando o valor real.
-- =============================================================================


-- =============================================================================
--  1. TABELAS
-- =============================================================================

create table if not exists public.categories (
  id         bigint  generated always as identity primary key,
  name       text    not null,
  icon       text    not null default '',
  sort_order int     not null default 0,
  active     boolean not null default true
);

create table if not exists public.products (
  id                bigint  generated always as identity primary key,
  category_id       bigint  references public.categories(id) on delete set null,
  name              text    not null,
  description       text    not null default '',
  price_cents       int     not null default 0 check (price_cents >= 0),
  promo_price_cents int              check (promo_price_cents is null or promo_price_cents >= 0),
  promo_start       timestamptz,
  promo_end         timestamptz,
  image             text    not null default '',
  unit              text    not null default 'unidade',
  available         boolean not null default true,
  featured          boolean not null default false,
  sort_order        int     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category_id);

-- Grupos de adicionais: "Adicione um extra", "Escolha o molho"…
create table if not exists public.addon_groups (
  id          bigint  generated always as identity primary key,
  name        text    not null,
  required    boolean not null default false,
  min_choices int     not null default 0 check (min_choices >= 0),
  max_choices int     not null default 1 check (max_choices >= 1),
  sort_order  int     not null default 0,
  active      boolean not null default true
);

create table if not exists public.addons (
  id          bigint  generated always as identity primary key,
  group_id    bigint  not null references public.addon_groups(id) on delete cascade,
  name        text    not null,
  price_cents int     not null default 0 check (price_cents >= 0),
  active      boolean not null default true,
  sort_order  int     not null default 0
);

create index if not exists addons_group_idx on public.addons (group_id);

-- Quais grupos de adicionais cada produto oferece.
create table if not exists public.product_addon_groups (
  product_id bigint not null references public.products(id)     on delete cascade,
  group_id   bigint not null references public.addon_groups(id) on delete cascade,
  sort_order int    not null default 0,
  primary key (product_id, group_id)
);

-- Configurações da loja: uma linha por chave, para nunca precisar de migração
-- quando surgir uma configuração nova.
create table if not exists public.settings (
  key   text primary key,
  value text not null
);

-- Quem pode administrar. Estar logado NÃO basta: precisa estar aqui.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);


-- =============================================================================
--  1b. MIGRAÇÃO DE BANCO JÁ EXISTENTE
--
--  "create table if not exists" acima não mexe em tabela que já existe, então
--  quem rodou uma versão anterior deste arquivo ficaria sem as colunas novas.
--  Os comandos abaixo completam o que faltar, SEM apagar nada do que já está lá.
-- =============================================================================

alter table public.categories   add column if not exists active     boolean not null default true;

alter table public.products     add column if not exists promo_price_cents int;
alter table public.products     add column if not exists promo_start timestamptz;
alter table public.products     add column if not exists promo_end   timestamptz;
alter table public.products     add column if not exists featured    boolean not null default false;
alter table public.products     add column if not exists unit        text    not null default 'unidade';
alter table public.products     add column if not exists image       text    not null default '';

do $migra$
begin
  -- Garante a regra do preço promocional mesmo em tabela antiga.
  if not exists (select 1 from pg_constraint where conname = 'products_promo_price_cents_check') then
    alter table public.products
      add constraint products_promo_price_cents_check
      check (promo_price_cents is null or promo_price_cents >= 0);
  end if;

end;
$migra$;


-- =============================================================================
--  2. PEDIDOS
--
--  Os campos "_snapshot" guardam nome e preço no momento da compra. Se o
--  preço mudar amanhã, o pedido de hoje continua mostrando o valor cobrado.
-- =============================================================================

create table if not exists public.orders (
  id             bigint generated always as identity primary key,
  public_code    text   not null unique,
  client_token   uuid   unique,
  customer_name  text   not null,
  customer_phone text   not null,
  order_type     text   not null default 'retirada',
  notes          text   not null default '',
  pickup_at      timestamptz,
  subtotal_cents int    not null default 0,
  total_cents    int    not null default 0,
  status         text   not null default 'novo'
                 check (status in ('novo','confirmado','preparando','finalizado','cancelado')),
  created_at     timestamptz not null default now()
);

create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx  on public.orders (status);

create table if not exists public.order_items (
  id                       bigint generated always as identity primary key,
  order_id                 bigint not null references public.orders(id) on delete cascade,
  product_id               bigint references public.products(id) on delete set null,
  product_name_snapshot    text   not null,
  unit_price_cents_snapshot int   not null,
  quantity                 int    not null check (quantity > 0),
  notes                    text   not null default '',
  subtotal_cents           int    not null
);

create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.order_item_addons (
  id                    bigint generated always as identity primary key,
  order_item_id         bigint not null references public.order_items(id) on delete cascade,
  addon_id              bigint references public.addons(id) on delete set null,
  addon_name_snapshot   text   not null,
  addon_price_cents_snapshot int not null
);

create index if not exists order_item_addons_item_idx on public.order_item_addons (order_item_id);


-- =============================================================================
--  3. FUNÇÕES DE APOIO
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select exists (select 1 from public.admins where user_id = auth.uid());
$fn$;

-- Preço que vale AGORA: promoção só conta se estiver dentro da validade.
-- Quem decide é o banco, nunca o navegador.
create or replace function public.effective_price_cents(
  p_price_cents int, p_promo_price_cents int,
  p_promo_start timestamptz, p_promo_end timestamptz
)
returns int
language sql immutable
as $fn$
  select case
    when p_promo_price_cents is not null
     and p_promo_price_cents > 0
     and p_promo_price_cents < p_price_cents
     and (p_promo_start is null or p_promo_start <= now())
     and (p_promo_end   is null or p_promo_end   >= now())
    then p_promo_price_cents
    else p_price_cents
  end;
$fn$;

-- Código curto, fácil de ditar no telefone e difícil de adivinhar.
-- Sem 0/O/1/I para não confundir na hora de falar.
create or replace function public.generate_order_code()
returns text
language plpgsql volatile
as $fn$
declare
  alfabeto constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidato text;
  tentativa int := 0;
begin
  loop
    candidato := 'JT-';
    for i in 1..5 loop
      candidato := candidato || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from public.orders where public_code = candidato);
    tentativa := tentativa + 1;
    if tentativa > 50 then
      candidato := 'JT-' || to_char(clock_timestamp(), 'SSMS');
      exit;
    end if;
  end loop;
  return candidato;
end;
$fn$;

create or replace function public.get_setting(p_key text, p_default text default '')
returns text
language sql stable
as $fn$
  select coalesce((select value from public.settings where key = p_key), p_default);
$fn$;


-- =============================================================================
--  4. CRIAÇÃO DO PEDIDO — O CORAÇÃO DA SEGURANÇA
--
--  Entrada esperada em p_items (o navegador manda só isto):
--    [{ "product_id": 12, "quantity": 2, "notes": "sem cebola",
--       "addon_ids": [3, 7] }]
--
--  Preço NÃO é aceito como entrada. É lido aqui da tabela products.
--
--  Retorno possível:
--    { "status": "ok",              ...resumo oficial do pedido... }
--    { "status": "price_changed",   "changes": [...] }   -> pedir confirmação
--    { "status": "unavailable",     "items":   [...] }   -> remover do carrinho
--    { "status": "closed",          "message": "..."  }
--    { "status": "below_minimum",   "minimum_cents": N }
-- =============================================================================

create or replace function public.create_order(
  p_customer_name  text,
  p_customer_phone text,
  p_items          jsonb,
  p_notes          text        default '',
  p_pickup_at      timestamptz default null,
  p_expected_total_cents int   default null,
  p_client_token   uuid        default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item            jsonb;
  v_produto         public.products%rowtype;
  v_preco           int;
  v_quantidade      int;
  v_addon           public.addons%rowtype;
  v_addon_id        bigint;
  v_addons_cents    int;
  v_item_subtotal   int;
  v_subtotal        int := 0;
  v_order_id        bigint;
  v_order_item_id   bigint;
  v_codigo          text;
  v_nome            text;
  v_telefone        text;
  v_indisponiveis   jsonb := '[]'::jsonb;
  v_mudancas        jsonb := '[]'::jsonb;
  v_resumo          jsonb := '[]'::jsonb;
  v_addons_resumo   jsonb;
  v_minimo          int;
  v_existente       public.orders%rowtype;
  v_dias_evento     jsonb;
  v_prazo_dias      int;
  v_hoje            date;
  v_dentro_prazo    boolean;
begin
  -- ---------------------------------------------------------------------
  -- Idempotência: o mesmo token nunca cria dois pedidos, então tocar
  -- várias vezes em "enviar" não duplica nada.
  -- ---------------------------------------------------------------------
  if p_client_token is not null then
    select * into v_existente from public.orders where client_token = p_client_token;
    if found then
      return public.order_summary(v_existente.id);
    end if;
  end if;

  -- ---------------------------------------------------------------------
  -- A loja está aceitando pedidos?
  -- ---------------------------------------------------------------------
  if public.get_setting('accepting_orders', 'true') <> 'true' then
    return jsonb_build_object(
      'status', 'closed',
      'message', public.get_setting('closed_message', 'Não estamos aceitando pedidos no momento.')
    );
  end if;

  -- ---------------------------------------------------------------------
  -- O site é usado por festivais: a retirada precisa cair num dos dias de
  -- evento cadastrados, e o pedido precisa estar dentro do prazo (o painel
  -- define quantos dias antes do evento os pedidos param de ser aceitos).
  -- Sem dias de evento cadastrados, mantém o comportamento antigo (livre).
  -- ---------------------------------------------------------------------
  v_dias_evento := coalesce(nullif(public.get_setting('event_days', '[]'), '')::jsonb, '[]'::jsonb);
  if jsonb_typeof(v_dias_evento) = 'array' and jsonb_array_length(v_dias_evento) > 0 then
    if p_pickup_at is null then
      raise exception 'Escolha o dia e o horário de retirada.' using errcode = 'P0001';
    end if;

    v_prazo_dias := coalesce(nullif(public.get_setting('order_cutoff_days', '1'), '')::int, 1);
    v_hoje := (now() at time zone 'America/Sao_Paulo')::date;

    select exists (
      select 1 from jsonb_array_elements(v_dias_evento) as ev
      where (ev->>'date') = to_char(p_pickup_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
        and v_hoje <= (to_date(ev->>'date', 'YYYY-MM-DD') - v_prazo_dias)
    ) into v_dentro_prazo;

    if not v_dentro_prazo then
      return jsonb_build_object(
        'status', 'closed',
        'message', 'Esse dia de retirada não está mais disponível. Escolha outro dia do evento.'
      );
    end if;
  end if;

  -- ---------------------------------------------------------------------
  -- Dados do cliente
  -- ---------------------------------------------------------------------
  v_nome := btrim(coalesce(p_customer_name, ''));
  v_telefone := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');

  if length(v_nome) < 2 then
    raise exception 'Informe o seu nome.' using errcode = 'P0001';
  end if;
  if length(v_nome) > 80 then
    v_nome := substr(v_nome, 1, 80);
  end if;
  if length(v_telefone) not in (10, 11) then
    raise exception 'Informe um WhatsApp válido com DDD.' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Seu pedido está vazio.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 60 then
    raise exception 'Pedido muito grande. Fale com a gente no WhatsApp.' using errcode = 'P0001';
  end if;

  -- ---------------------------------------------------------------------
  -- PRIMEIRA PASSAGEM — validar tudo e calcular usando os preços do banco
  -- ---------------------------------------------------------------------
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantidade := coalesce((v_item->>'quantity')::int, 0);
    if v_quantidade < 1 or v_quantidade > 99 then
      raise exception 'Quantidade inválida no pedido.' using errcode = 'P0001';
    end if;

    select * into v_produto from public.products
      where id = (v_item->>'product_id')::bigint;

    if not found then
      raise exception 'Um dos produtos não existe mais.' using errcode = 'P0001';
    end if;

    if not v_produto.available then
      v_indisponiveis := v_indisponiveis || jsonb_build_object(
        'product_id', v_produto.id, 'name', v_produto.name);
      continue;
    end if;

    -- O preço vem DAQUI. Nunca do que o navegador mandou.
    v_preco := public.effective_price_cents(
      v_produto.price_cents, v_produto.promo_price_cents,
      v_produto.promo_start, v_produto.promo_end);

    -- Comparação apenas para AVISAR o cliente (item 27 do projeto).
    if v_item ? 'unit_price_cents'
       and (v_item->>'unit_price_cents')::int is distinct from v_preco then
      v_mudancas := v_mudancas || jsonb_build_object(
        'product_id', v_produto.id,
        'name',       v_produto.name,
        'old_cents',  (v_item->>'unit_price_cents')::int,
        'new_cents',  v_preco);
    end if;

    -- Adicionais: só valem se estiverem ativos E ligados a este produto.
    v_addons_cents := 0;
    if v_item ? 'addon_ids' and jsonb_typeof(v_item->'addon_ids') = 'array' then
      for v_addon_id in select (value)::text::bigint from jsonb_array_elements(v_item->'addon_ids') loop
        select a.* into v_addon
          from public.addons a
          join public.addon_groups g on g.id = a.group_id
          join public.product_addon_groups pag
            on pag.group_id = g.id and pag.product_id = v_produto.id
         where a.id = v_addon_id and a.active and g.active;

        if not found then
          raise exception 'Um dos adicionais escolhidos não está disponível.' using errcode = 'P0001';
        end if;
        v_addons_cents := v_addons_cents + v_addon.price_cents;
      end loop;
    end if;

    v_subtotal := v_subtotal + (v_preco + v_addons_cents) * v_quantidade;
  end loop;

  -- Item 28: produto ficou indisponível enquanto o cliente montava o pedido.
  if jsonb_array_length(v_indisponiveis) > 0 then
    return jsonb_build_object('status', 'unavailable', 'items', v_indisponiveis);
  end if;

  -- Item 27: preço mudou durante a navegação — confirmar antes de gravar.
  if jsonb_array_length(v_mudancas) > 0
     and p_expected_total_cents is not null
     and p_expected_total_cents <> v_subtotal then
    return jsonb_build_object(
      'status', 'price_changed',
      'changes', v_mudancas,
      'total_cents', v_subtotal);
  end if;

  -- Pedido mínimo
  v_minimo := coalesce(nullif(public.get_setting('min_order_cents', '0'), '')::int, 0);
  if v_minimo > 0 and v_subtotal < v_minimo then
    return jsonb_build_object('status', 'below_minimum', 'minimum_cents', v_minimo);
  end if;

  -- ---------------------------------------------------------------------
  -- SEGUNDA PASSAGEM — gravar o pedido com os valores já validados
  -- ---------------------------------------------------------------------
  v_codigo := public.generate_order_code();

  insert into public.orders (
    public_code, client_token, customer_name, customer_phone,
    order_type, notes, pickup_at, subtotal_cents, total_cents, status)
  values (
    v_codigo, p_client_token, v_nome, v_telefone,
    'retirada', substr(btrim(coalesce(p_notes, '')), 1, 500),
    p_pickup_at, v_subtotal, v_subtotal, 'novo')
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantidade := (v_item->>'quantity')::int;

    select * into v_produto from public.products
      where id = (v_item->>'product_id')::bigint;

    v_preco := public.effective_price_cents(
      v_produto.price_cents, v_produto.promo_price_cents,
      v_produto.promo_start, v_produto.promo_end);

    v_addons_cents := 0;
    v_addons_resumo := '[]'::jsonb;

    insert into public.order_items (
      order_id, product_id, product_name_snapshot,
      unit_price_cents_snapshot, quantity, notes, subtotal_cents)
    values (
      v_order_id, v_produto.id, v_produto.name,
      v_preco, v_quantidade,
      substr(btrim(coalesce(v_item->>'notes', '')), 1, 200), 0)
    returning id into v_order_item_id;

    if v_item ? 'addon_ids' and jsonb_typeof(v_item->'addon_ids') = 'array' then
      for v_addon_id in select (value)::text::bigint from jsonb_array_elements(v_item->'addon_ids') loop
        select * into v_addon from public.addons where id = v_addon_id;

        insert into public.order_item_addons (
          order_item_id, addon_id, addon_name_snapshot, addon_price_cents_snapshot)
        values (v_order_item_id, v_addon.id, v_addon.name, v_addon.price_cents);

        v_addons_cents := v_addons_cents + v_addon.price_cents;
        v_addons_resumo := v_addons_resumo || jsonb_build_object(
          'name', v_addon.name, 'price_cents', v_addon.price_cents);
      end loop;
    end if;

    v_item_subtotal := (v_preco + v_addons_cents) * v_quantidade;
    update public.order_items set subtotal_cents = v_item_subtotal
      where id = v_order_item_id;

    v_resumo := v_resumo || jsonb_build_object(
      'name',            v_produto.name,
      'quantity',        v_quantidade,
      'unit_price_cents', v_preco,
      'addons',          v_addons_resumo,
      'notes',           coalesce(v_item->>'notes', ''),
      'subtotal_cents',  v_item_subtotal);
  end loop;

  return jsonb_build_object(
    'status',         'ok',
    'code',           v_codigo,
    'customer_name',  v_nome,
    'customer_phone', v_telefone,
    'notes',          substr(btrim(coalesce(p_notes, '')), 1, 500),
    'pickup_at',      p_pickup_at,
    'items',          v_resumo,
    'total_cents',    v_subtotal,
    'created_at',     now());
end;
$fn$;

-- Resumo oficial de um pedido já existente (usado pela idempotência).
create or replace function public.order_summary(p_order_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order public.orders%rowtype;
  v_itens jsonb;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name',             i.product_name_snapshot,
           'quantity',         i.quantity,
           'unit_price_cents', i.unit_price_cents_snapshot,
           'notes',            i.notes,
           'subtotal_cents',   i.subtotal_cents,
           'addons', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', a.addon_name_snapshot,
                      'price_cents', a.addon_price_cents_snapshot))
               from public.order_item_addons a where a.order_item_id = i.id
           ), '[]'::jsonb)
         ) order by i.id), '[]'::jsonb)
    into v_itens
    from public.order_items i where i.order_id = v_order.id;

  return jsonb_build_object(
    'status',         'ok',
    'code',           v_order.public_code,
    'customer_name',  v_order.customer_name,
    'customer_phone', v_order.customer_phone,
    'notes',          v_order.notes,
    'pickup_at',      v_order.pickup_at,
    'items',          v_itens,
    'total_cents',    v_order.total_cents,
    'created_at',     v_order.created_at);
end;
$fn$;

-- Deixa o site (visitante anônimo) chamar apenas estas duas funções.
grant execute on function public.create_order(text, text, jsonb, text, timestamptz, int, uuid) to anon, authenticated;
revoke execute on function public.order_summary(bigint) from anon, authenticated;


-- =============================================================================
--  5. PERMISSÕES (Row Level Security)
--
--  Visitante  -> lê cardápio e configurações. NÃO lê pedidos (tem telefone).
--  Admin      -> lê e escreve tudo.
--  Pedidos    -> criados só pela função create_order(), nunca por INSERT direto.
-- =============================================================================

alter table public.categories           enable row level security;
alter table public.products             enable row level security;
alter table public.addon_groups         enable row level security;
alter table public.addons               enable row level security;
alter table public.product_addon_groups enable row level security;
alter table public.settings             enable row level security;
alter table public.admins               enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_item_addons    enable row level security;

do $policies$
declare
  t text;
begin
  -- Leitura pública do cardápio
  foreach t in array array['categories','addon_groups','addons','product_addon_groups','settings'] loop
    execute format('drop policy if exists "leitura publica" on public.%I', t);
    execute format('create policy "leitura publica" on public.%I for select using (true)', t);
  end loop;

  -- Escrita só para administradores
  foreach t in array array['categories','products','addon_groups','addons',
                           'product_addon_groups','settings','orders',
                           'order_items','order_item_addons'] loop
    execute format('drop policy if exists "admin gerencia" on public.%I', t);
    execute format('create policy "admin gerencia" on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end;
$policies$;

-- Produtos: o visitante só enxerga o que está disponível.
drop policy if exists "cardapio publico" on public.products;
create policy "cardapio publico"
  on public.products for select using (available = true);

drop policy if exists "admin ve a si mesmo" on public.admins;
create policy "admin ve a si mesmo"
  on public.admins for select to authenticated using (user_id = auth.uid());


-- =============================================================================
--  6. FOTOS DOS PRODUTOS
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
--  7. CONFIGURAÇÕES INICIAIS
--     (só entram se ainda não existirem — depois você edita pelo painel)
-- =============================================================================

insert into public.settings (key, value) values
  ('store_name',        'Esfiharia Jataí'),
  ('headline',          'Sua esfiha favorita a poucos toques.'),
  ('whatsapp',          '5515997365401'),
  ('address',           'Jataí'),
  ('instagram',         ''),
  ('announcement',      ''),
  ('announcement_active','false'),
  ('accepting_orders',  'true'),
  ('closed_message',    'Estamos fechados agora. Fale com a gente no WhatsApp.'),
  ('pickup_enabled',    'true'),
  ('prep_time_note',    ''),
  ('min_order_cents',   '0'),
  ('slot_minutes',      '15'),
  ('lead_minutes',      '30'),
  ('order_cutoff_days', '1'),
  ('primary_color',     '#C8102E'),
  ('secondary_color',   '#FFFFFF'),
  ('accent_color',      '#F2B233'),
  ('logo_url',          ''),
  ('whatsapp_footer',   'Pedido registrado no sistema.'),
  -- Dias específicos do festival de esfihas, cadastrados pelo painel.
  -- Ex.: [{"date":"2026-09-05","open":"18:00","close":"22:30"}]
  ('event_days', '[]')
on conflict (key) do nothing;


-- Quem vem da versão anterior tinha "tagline" e "notice". Se esses textos
-- estavam personalizados, leva para as chaves novas — mas só se a nova ainda
-- estiver com o valor de fábrica, para nunca sobrescrever algo que você editou.
do $migra_cfg$
declare
  v_antigo text;
begin
  select value into v_antigo from public.settings where key = 'tagline';
  if v_antigo is not null and v_antigo <> '' and v_antigo <> 'Esfihas na hora, feitas com massa artesanal' then
    update public.settings set value = v_antigo
     where key = 'headline' and value = 'Sua esfiha favorita a poucos toques.';
  end if;

  select value into v_antigo from public.settings where key = 'notice';
  if v_antigo is not null and v_antigo <> '' then
    update public.settings set value = v_antigo   where key = 'announcement' and value = '';
    update public.settings set value = 'true'     where key = 'announcement_active' and value = 'false';
  end if;
end;
$migra_cfg$;


-- =============================================================================
--  8. CARDÁPIO DE EXEMPLO
--     Some assim que você cadastrar os seus produtos pelo painel.
-- =============================================================================

do $seed$
declare
  c_salgadas bigint; c_doces bigint; c_especiais bigint;
  c_bebidas  bigint; c_acomp bigint;
  g_extras   bigint; g_molhos bigint;
  p_id       bigint;
begin
  if exists (select 1 from public.products) then
    return;
  end if;

  insert into public.categories (name, icon, sort_order) values
    ('Esfihas Salgadas',  '🥩', 1) returning id into c_salgadas;
  insert into public.categories (name, icon, sort_order) values
    ('Esfihas Especiais', '⭐', 2) returning id into c_especiais;
  insert into public.categories (name, icon, sort_order) values
    ('Esfihas Doces',     '🍫', 3) returning id into c_doces;
  insert into public.categories (name, icon, sort_order) values
    ('Bebidas',           '🥤', 4) returning id into c_bebidas;
  insert into public.categories (name, icon, sort_order) values
    ('Acompanhamentos',   '➕', 5) returning id into c_acomp;

  -- Grupos de adicionais
  insert into public.addon_groups (name, required, min_choices, max_choices, sort_order)
    values ('Adicione um extra', false, 0, 3, 1) returning id into g_extras;
  insert into public.addons (group_id, name, price_cents, sort_order) values
    (g_extras, 'Catupiry',      200, 1),
    (g_extras, 'Cheddar',       200, 2),
    (g_extras, 'Bacon',         300, 3),
    (g_extras, 'Queijo extra',  250, 4);

  insert into public.addon_groups (name, required, min_choices, max_choices, sort_order)
    values ('Molho para acompanhar', false, 0, 2, 2) returning id into g_molhos;
  insert into public.addons (group_id, name, price_cents, sort_order) values
    (g_molhos, 'Molho de alho',   200, 1),
    (g_molhos, 'Molho especial',  250, 2),
    (g_molhos, 'Ketchup',           0, 3),
    (g_molhos, 'Maionese',          0, 4);

  -- Esfihas salgadas (as três primeiras marcadas como destaque)
  insert into public.products (category_id, name, description, price_cents, unit, featured, sort_order)
    values (c_salgadas, 'Esfiha de Carne', 'Carne bovina moída temperada com cebola, tomate e limão.', 800, 'unidade', true, 1)
    returning id into p_id;
  insert into public.product_addon_groups (product_id, group_id) values (p_id, g_extras);

  insert into public.products (category_id, name, description, price_cents, unit, featured, sort_order)
    values (c_salgadas, 'Esfiha de Frango com Catupiry', 'Frango desfiado com catupiry cremoso.', 950, 'unidade', true, 2)
    returning id into p_id;
  insert into public.product_addon_groups (product_id, group_id) values (p_id, g_extras);

  insert into public.products (category_id, name, description, price_cents, unit, featured, sort_order)
    values (c_salgadas, 'Esfiha de Queijo', 'Mussarela derretida com um toque de orégano.', 850, 'unidade', true, 3)
    returning id into p_id;
  insert into public.product_addon_groups (product_id, group_id) values (p_id, g_extras);

  insert into public.products (category_id, name, description, price_cents, unit, sort_order) values
    (c_salgadas, 'Esfiha de Carne com Queijo', 'Carne temperada coberta com mussarela derretida.', 950, 'unidade', 4),
    (c_salgadas, 'Esfiha de Calabresa',        'Calabresa fatiada com cebola e mussarela.',        900, 'unidade', 5),
    (c_salgadas, 'Esfiha de Portuguesa',       'Presunto, queijo, ovo, cebola e azeitona.',        950, 'unidade', 6),
    (c_salgadas, 'Esfiha de Palmito',          'Palmito picado no creme de queijo.',               950, 'unidade', 7);

  -- Especiais (uma com promoção ativa, para você ver como fica)
  insert into public.products (category_id, name, description, price_cents, promo_price_cents, unit, sort_order) values
    (c_especiais, 'Esfiha de Costela',          'Costela desfiada com cebola caramelizada.', 1350, 1090, 'unidade', 8);
  insert into public.products (category_id, name, description, price_cents, unit, sort_order) values
    (c_especiais, 'Esfiha de Bacon com Cheddar', 'Bacon crocante com cheddar cremoso.',      1050, 'unidade', 9),
    (c_especiais, 'Esfiha de Camarão',           'Camarão ao creme de alho e queijo.',       1590, 'unidade', 10);

  -- Doces
  insert into public.products (category_id, name, description, price_cents, unit, sort_order) values
    (c_doces, 'Esfiha de Chocolate',             'Chocolate ao leite derretido na massa quentinha.', 900,  'unidade', 11),
    (c_doces, 'Esfiha de Chocolate com Morango', 'Chocolate ao leite com morangos frescos.',        1100, 'unidade', 12),
    (c_doces, 'Esfiha de Romeu e Julieta',       'Goiabada com queijo mussarela.',                   950, 'unidade', 13),
    (c_doces, 'Esfiha de Banana com Canela',     'Banana, açúcar e canela.',                         900, 'unidade', 14),
    (c_doces, 'Esfiha de Doce de Leite',         'Doce de leite cremoso com leite em pó.',           950, 'unidade', 15),
    (c_doces, 'Esfiha de Prestígio',             'Chocolate com coco ralado.',                      1000, 'unidade', 16);

  -- Bebidas
  insert into public.products (category_id, name, description, price_cents, unit, sort_order) values
    (c_bebidas, 'Coca-Cola Lata 350ml',          'Refrigerante gelado.',       600,  'lata 350ml',    17),
    (c_bebidas, 'Coca-Cola 600ml',               'Garrafa gelada.',            900,  'garrafa 600ml', 18),
    (c_bebidas, 'Coca-Cola 2L',                  'Ideal para dividir.',       1400,  'garrafa 2L',    19),
    (c_bebidas, 'Guaraná Antarctica Lata 350ml', 'Refrigerante gelado.',       600,  'lata 350ml',    20),
    (c_bebidas, 'Guaraná Antarctica 2L',         'Ideal para dividir.',       1300,  'garrafa 2L',    21),
    (c_bebidas, 'Suco de Laranja Natural 500ml', 'Feito na hora, sem açúcar.',1000,  'copo 500ml',    22),
    (c_bebidas, 'Água Mineral 500ml',            'Sem gás.',                   400,  'garrafa 500ml', 23),
    (c_bebidas, 'Água com Gás 500ml',            'Gelada.',                    500,  'garrafa 500ml', 24);

  -- Acompanhamentos
  insert into public.products (category_id, name, description, price_cents, unit, sort_order) values
    (c_acomp, 'Molho de Alho 60ml',     'Cremoso, feito na casa.',      400, 'pote 60ml', 25),
    (c_acomp, 'Molho Especial 60ml',    'Levemente apimentado.',        450, 'pote 60ml', 26),
    (c_acomp, 'Porção de Azeitonas',    'Azeitonas verdes temperadas.', 700, 'porção',    27);
end;
$seed$;


-- =============================================================================
--  9. PASSO FINAL — LIBERAR O SEU ACESSO AO PAINEL
--
--  ANTES de rodar o comando abaixo:
--    a) Vá em  Authentication > Users > "Add user" > "Create new user"
--    b) Informe o SEU e-mail e uma senha (mínimo 6 caracteres)
--    c) MARQUE a opção "Auto Confirm User"
--    d) Clique em "Create user"
--
--  Depois troque o e-mail abaixo pelo seu, apague os dois tracinhos "--"
--  do começo das três linhas, e rode:
-- =============================================================================

-- insert into public.admins (user_id)
-- select id from auth.users where email = 'seu-email@exemplo.com'
-- on conflict (user_id) do nothing;


-- =============================================================================
--  10. CONFERÊNCIA — rode para ver se deu tudo certo
-- =============================================================================

-- select 'categorias' as tabela, count(*) from public.categories
-- union all select 'produtos',    count(*) from public.products
-- union all select 'adicionais',  count(*) from public.addons
-- union all select 'configs',     count(*) from public.settings
-- union all select 'admins',      count(*) from public.admins;
