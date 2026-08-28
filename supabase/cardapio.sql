-- =============================================================================
--  CARDÁPIO COMPLETO — DISK ESFIHA JATAÍ
--
--  COMO USAR:
--    SQL Editor > New query > cole este arquivo > Run
--
--  O que ele faz:
--    1. Ajusta o nome da loja
--    2. Remove os itens que vieram como EXEMPLO (só eles, pelo nome)
--    3. Cadastra as 6 categorias e os 33 itens do cardápio impresso
--    4. Cria os adicionais a R$ 1,30 e os sabores dos sucos
--
--  Pode rodar mais de uma vez: atualiza o que existe, não duplica.
--  Pedidos antigos não mudam: eles guardam nome e preço próprios.
-- =============================================================================

update public.settings set value = 'Disk Esfiha Jataí' where key = 'store_name';


-- ------------------------------------------------- 1. limpa o que era exemplo
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
  delete from public.addon_groups where name in ('Adicione um extra', 'Molho para acompanhar');
  delete from public.categories c
   where c.name in ('Esfihas Salgadas','Esfihas Especiais','Esfihas Doces','Bebidas','Acompanhamentos')
     and not exists (select 1 from public.products p where p.category_id = c.id);
end;
$limpa$;


-- --------------------------------------------------------- 2. o cardápio real
do $cardapio$
declare
  g_add   bigint;   -- adicionais das esfihas
  g_suco  bigint;   -- sabor: laranja ou uva
  g_caixa bigint;   -- sabor: abacaxi ou uva
  c_id    bigint;
  p_id    bigint;
  r       record;
begin
  ------------------------------------------------------------------ categorias
  for r in select * from (values
    ('Salgadas',            '🫓', 1),
    ('Doces',               '🍫', 2),
    ('Refrigerantes 2L',    '🥤', 3),
    ('Refrigerantes Lata',  '🥫', 4),
    ('Cervejas',            '🍺', 5),
    ('Sucos',               '🧃', 6)
  ) as t(nome, icone, ordem) loop
    if not exists (select 1 from public.categories where name = r.nome) then
      insert into public.categories (name, icon, sort_order, active)
      values (r.nome, r.icone, r.ordem, true);
    else
      update public.categories set icon = r.icone, sort_order = r.ordem, active = true
       where name = r.nome;
    end if;
  end loop;

  ----------------------------------------------------------------- adicionais
  select id into g_add from public.addon_groups where name = 'Adicionais';
  if g_add is null then
    insert into public.addon_groups (name, required, min_choices, max_choices, sort_order, active)
    values ('Adicionais', false, 0, 4, 1, true) returning id into g_add;
  end if;
  insert into public.addons (group_id, name, price_cents, sort_order, active)
  select g_add, v.nome, 130, v.ordem, true
    from (values ('Queijo',1),('Cheddar',2),('Bacon',3),('Catupiry',4)) as v(nome, ordem)
   where not exists (select 1 from public.addons a where a.group_id = g_add and a.name = v.nome);

  -- Sabores dos sucos: escolha obrigatória, sem custo extra.
  select id into g_suco from public.addon_groups where name = 'Sabor do suco';
  if g_suco is null then
    insert into public.addon_groups (name, required, min_choices, max_choices, sort_order, active)
    values ('Sabor do suco', true, 1, 1, 2, true) returning id into g_suco;
  end if;
  insert into public.addons (group_id, name, price_cents, sort_order, active)
  select g_suco, v.nome, 0, v.ordem, true
    from (values ('Laranja',1),('Uva',2)) as v(nome, ordem)
   where not exists (select 1 from public.addons a where a.group_id = g_suco and a.name = v.nome);

  select id into g_caixa from public.addon_groups where name = 'Sabor da caixa';
  if g_caixa is null then
    insert into public.addon_groups (name, required, min_choices, max_choices, sort_order, active)
    values ('Sabor da caixa', true, 1, 1, 3, true) returning id into g_caixa;
  end if;
  insert into public.addons (group_id, name, price_cents, sort_order, active)
  select g_caixa, v.nome, 0, v.ordem, true
    from (values ('Abacaxi',1),('Uva',2)) as v(nome, ordem)
   where not exists (select 1 from public.addons a where a.group_id = g_caixa and a.name = v.nome);

  ------------------------------------------------------------------- produtos
  -- categoria, nome, descrição, centavos, unidade, ordem, destaque, grupo extra
  for r in select * from (values
    -- SALGADAS a R$ 4,20
    ('Salgadas','Queijo',            'Muçarela e orégano',                                    420,'unidade', 1, true,  'add'),
    ('Salgadas','Pizza',             'Muçarela, presunto e tomate',                           420,'unidade', 2, true,  'add'),
    ('Salgadas','Carne',             'Carne moída',                                           420,'unidade', 3, true,  'add'),
    ('Salgadas','Carne Seca',        'Carne seca desfiada',                                   420,'unidade', 4, false, 'add'),
    ('Salgadas','Frango',            'Frango desfiado',                                       420,'unidade', 5, false, 'add'),
    ('Salgadas','Toscana',           'Linguiça fresca moída',                                 420,'unidade', 6, false, 'add'),
    ('Salgadas','Calabresa',         'Linguiça calabresa moída',                              420,'unidade', 7, false, 'add'),
    ('Salgadas','Cachorrão',         'Linguiça calabresa, tomate, milho, salsicha e ketchup', 420,'unidade', 8, false, 'add'),
    ('Salgadas','Milho',             'Muçarela e milho',                                      420,'unidade', 9, false, 'add'),
    -- SALGADAS especiais
    ('Salgadas','Queijo com Alho',   'Muçarela, orégano e alho frito',                        550,'unidade',10, false, 'add'),
    ('Salgadas','Queijo com Bacon',  'Muçarela, orégano e bacon',                             550,'unidade',11, false, 'add'),
    ('Salgadas','Brócolis',          'Muçarela, orégano e brócolis',                          550,'unidade',12, false, 'add'),
    ('Salgadas','Burguer Esfiha',    'Pizza, 1 hambúrguer, catupiry e tomate',                600,'unidade',13, false, 'add'),
    -- DOCES a R$ 5,50
    ('Doces','Chocolate',            'Chocolate ao leite com granulado',                      550,'unidade',14, false, 'add'),
    ('Doces','Doce de Leite',        'Doce de leite',                                         550,'unidade',15, false, 'add'),
    ('Doces','Brigadeiro',           'Brigadeiro com cereais preto e branco',                 550,'unidade',16, false, 'add'),
    ('Doces','Goiabada',             'Muçarela e goiabada',                                   550,'unidade',17, false, 'add'),
    -- REFRIGERANTES 2 LITROS
    ('Refrigerantes 2L','Coca-Cola 2L',          '', 1400,'garrafa 2L',18, false, ''),
    ('Refrigerantes 2L','Fanta Uva 2L',          '', 1200,'garrafa 2L',19, false, ''),
    ('Refrigerantes 2L','Fanta Laranja 2L',      '', 1200,'garrafa 2L',20, false, ''),
    ('Refrigerantes 2L','Guaraná Antártica 2L',  '', 1200,'garrafa 2L',21, false, ''),
    ('Refrigerantes 2L','Sprite 2L',             '', 1200,'garrafa 2L',22, false, ''),
    ('Refrigerantes 2L','Vedete Guaraná 2L',     '',  600,'garrafa 2L',23, false, ''),
    ('Refrigerantes 2L','Vedete Taubaina 2L',    '',  600,'garrafa 2L',24, false, ''),
    -- LATAS
    ('Refrigerantes Lata','Coca-Cola Lata',      '',  500,'lata',      25, false, ''),
    ('Refrigerantes Lata','Sprite Lata',         '',  500,'lata',      26, false, ''),
    ('Refrigerantes Lata','Fanta Laranja Lata',  '',  500,'lata',      27, false, ''),
    -- CERVEJAS
    ('Cervejas','Brahma Lata', 'Venda proibida para menores de 18 anos.', 500,'lata',28, false, ''),
    ('Cervejas','Skol Lata',   'Venda proibida para menores de 18 anos.', 500,'lata',29, false, ''),
    -- SUCOS DELL VALLE
    ('Sucos','Dell Valle Garrafa 450ml', 'Escolha o sabor: laranja ou uva.',   350,'garrafa 450ml',30, false, 'suco'),
    ('Sucos','Dell Valle Garrafa 1 Litro','Escolha o sabor: laranja ou uva.',  450,'garrafa 1L',   31, false, 'suco'),
    ('Sucos','Dell Valle Caixa 1 Litro',  'Escolha o sabor: abacaxi ou uva.',  900,'caixa 1L',     32, false, 'caixa')
  ) as t(categoria, nome, descricao, centavos, unidade, ordem, destaque, extras)
  loop
    select id into c_id from public.categories where name = r.categoria;
    select id into p_id from public.products   where name = r.nome;

    if p_id is null then
      insert into public.products
        (category_id, name, description, price_cents, unit, sort_order, featured, available)
      values
        (c_id, r.nome, r.descricao, r.centavos, r.unidade, r.ordem, r.destaque, true)
      returning id into p_id;
    else
      update public.products
         set category_id = c_id, description = r.descricao, price_cents = r.centavos,
             unit = r.unidade, sort_order = r.ordem, featured = r.destaque,
             available = true, updated_at = now()
       where id = p_id;
    end if;

    -- Refaz os vínculos de adicionais deste produto
    delete from public.product_addon_groups where product_id = p_id;
    if r.extras = 'add' then
      insert into public.product_addon_groups (product_id, group_id) values (p_id, g_add);
    elsif r.extras = 'suco' then
      insert into public.product_addon_groups (product_id, group_id) values (p_id, g_suco);
    elsif r.extras = 'caixa' then
      insert into public.product_addon_groups (product_id, group_id) values (p_id, g_caixa);
    end if;
  end loop;
end;
$cardapio$;


-- ------------------------------------------------------------- 3. conferência
select c.name as categoria, count(p.id) as itens,
       'R$ ' || to_char(min(p.price_cents)/100.0,'FM990D00') ||
       ' a R$ ' || to_char(max(p.price_cents)/100.0,'FM990D00') as faixa
  from public.categories c left join public.products p on p.category_id = c.id
 group by c.name, c.sort_order order by c.sort_order;
