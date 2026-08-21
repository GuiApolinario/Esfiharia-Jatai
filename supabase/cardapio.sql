-- =============================================================================
--  CARDÁPIO REAL — DISK ESFIHA JATAÍ
--
--  COMO USAR:
--    SQL Editor > New query > cole este arquivo > Run
--
--  O que ele faz:
--    1. Corrige o nome da loja para "Disk Esfiha Jataí"
--    2. Remove os produtos e categorias que vieram como EXEMPLO
--       (só os de exemplo, pelo nome — o que você cadastrou fica intacto)
--    3. Cadastra as 9 esfihas salgadas a R$ 4,20
--    4. Cria o grupo de adicionais a R$ 1,30 e liga em todas as salgadas
--
--  Pode rodar mais de uma vez: nada é duplicado.
--  Pedidos antigos não são afetados: eles guardam nome e preço próprios.
-- =============================================================================

-- ----------------------------------------------------------------- 1. nome
update public.settings set value = 'Disk Esfiha Jataí' where key = 'store_name';


-- ------------------------------------------------- 2. limpa o que era exemplo
do $limpa$
declare
  exemplos text[] := array[
    'Esfiha de Carne','Esfiha de Carne com Queijo','Esfiha de Frango com Catupiry',
    'Esfiha de Queijo','Esfiha de Calabresa','Esfiha de Portuguesa','Esfiha de Palmito',
    'Esfiha de Bacon com Cheddar','Esfiha de Costela','Esfiha de Camarão',
    'Esfiha de Chocolate','Esfiha de Chocolate com Morango','Esfiha de Romeu e Julieta',
    'Esfiha de Banana com Canela','Esfiha de Doce de Leite','Esfiha de Prestígio',
    'Coca-Cola Lata 350ml','Coca-Cola 600ml','Coca-Cola 2L',
    'Guaraná Antarctica Lata 350ml','Guaraná Antarctica 2L',
    'Suco de Laranja Natural 500ml','Água Mineral 500ml','Água com Gás 500ml',
    'Molho de Alho 60ml','Molho Especial 60ml','Porção de Azeitonas'
  ];
begin
  delete from public.products where name = any(exemplos);

  -- Grupos de adicionais que vieram de exemplo
  delete from public.addon_groups where name in ('Adicione um extra', 'Molho para acompanhar');

  -- Categorias de exemplo que ficaram sem nenhum produto
  delete from public.categories c
   where c.name in ('Esfihas Salgadas','Esfihas Especiais','Esfihas Doces','Bebidas','Acompanhamentos')
     and not exists (select 1 from public.products p where p.category_id = c.id);
end;
$limpa$;


-- ------------------------------------------------- 3. cardápio de verdade
do $cardapio$
declare
  c_salgadas bigint;
  g_add      bigint;
  p_id       bigint;
  r          record;
begin
  ---------------------------------------------------------------- categoria
  select id into c_salgadas from public.categories where name = 'Salgadas';
  if c_salgadas is null then
    insert into public.categories (name, icon, sort_order, active)
    values ('Salgadas', '🥟', 1, true) returning id into c_salgadas;
  end if;

  ---------------------------------------------------------------- adicionais
  select id into g_add from public.addon_groups where name = 'Adicionais';
  if g_add is null then
    insert into public.addon_groups (name, required, min_choices, max_choices, sort_order, active)
    values ('Adicionais', false, 0, 4, 1, true) returning id into g_add;
  end if;

  -- R$ 1,30 cada, conforme o cardápio
  insert into public.addons (group_id, name, price_cents, sort_order, active)
  select g_add, v.nome, 130, v.ordem, true
    from (values ('Queijo',1), ('Cheddar',2), ('Bacon',3), ('Catupiry',4)) as v(nome, ordem)
   where not exists (
     select 1 from public.addons a where a.group_id = g_add and a.name = v.nome);

  ---------------------------------------------------------------- as esfihas
  -- Todas a R$ 4,20. As três primeiras entram como destaque ("Mais pedidos").
  for r in
    select * from (values
      ('Queijo',     'Muçarela e orégano',                                        1, true),
      ('Pizza',      'Muçarela, presunto e tomate',                               2, true),
      ('Carne',      'Carne moída',                                               3, true),
      ('Carne Seca', 'Carne seca desfiada',                                       4, false),
      ('Frango',     'Frango desfiado',                                           5, false),
      ('Toscana',    'Linguiça fresca moída',                                     6, false),
      ('Calabresa',  'Linguiça calabresa moída',                                  7, false),
      ('Cachorrão',  'Linguiça calabresa, tomate, milho, salsicha e ketchup',     8, false),
      ('Milho',      'Muçarela e milho',                                          9, false)
    ) as t(nome, descricao, ordem, destaque)
  loop
    select id into p_id from public.products where name = r.nome;

    if p_id is null then
      insert into public.products
        (category_id, name, description, price_cents, unit, sort_order, featured, available)
      values
        (c_salgadas, r.nome, r.descricao, 420, 'unidade', r.ordem, r.destaque, true)
      returning id into p_id;
    else
      update public.products
         set category_id = c_salgadas,
             description  = r.descricao,
             price_cents  = 420,
             sort_order   = r.ordem,
             featured     = r.destaque,
             available    = true,
             updated_at   = now()
       where id = p_id;
    end if;

    -- Toda salgada oferece os adicionais
    insert into public.product_addon_groups (product_id, group_id)
    values (p_id, g_add)
    on conflict do nothing;
  end loop;
end;
$cardapio$;


-- ------------------------------------------------------------- 4. conferência
select 'Loja'        as item, value                         as valor from public.settings where key = 'store_name'
union all
select 'Categorias',  count(*)::text from public.categories
union all
select 'Produtos',    count(*)::text from public.products
union all
select 'Adicionais',  count(*)::text from public.addons;
