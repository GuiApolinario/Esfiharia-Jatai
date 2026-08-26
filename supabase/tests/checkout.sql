-- =============================================================================
--  TESTES DA SEGURANÇA FINANCEIRA DO CHECKOUT
--  Rode com:  psql -f supabase/tests/checkout.sql
--  Todo teste que falhar interrompe a execução com "FALHOU".
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off

do $t$
declare
  v_carne   bigint;
  v_costela bigint;
  v_agua    bigint;
  v_catupiry bigint;
  v_molho_alho bigint;
  v_r       jsonb;
  v_token   uuid;
  v_code1   text;
begin
  select id into v_carne    from public.products where name = 'Esfiha de Carne';
  select id into v_costela  from public.products where name = 'Esfiha de Costela';
  select id into v_agua     from public.products where name = 'Água Mineral 500ml';
  select id into v_catupiry from public.addons   where name = 'Catupiry';
  select id into v_molho_alho from public.addons where name = 'Molho de alho';

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 1: cliente tenta enviar preço de R$ 1,00 num produto de R$ 8,00';
  v_r := public.create_order('João Teste', '15999998888',
    jsonb_build_array(jsonb_build_object(
      'product_id', v_carne, 'quantity', 1, 'unit_price_cents', 100)));

  if (v_r->>'total_cents')::int <> 800 then
    raise exception 'FALHOU: esperava 800, veio %', v_r->>'total_cents';
  end if;
  raise notice '    OK: servidor cobrou % centavos, ignorando o preço enviado', v_r->>'total_cents';

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 2: 3x Esfiha de Carne (R$ 8,00) = R$ 24,00';
  v_r := public.create_order('Maria Teste', '15999998888',
    jsonb_build_array(jsonb_build_object('product_id', v_carne, 'quantity', 3)));

  if (v_r->>'total_cents')::int <> 2400 then
    raise exception 'FALHOU: esperava 2400, veio %', v_r->>'total_cents';
  end if;
  raise notice '    OK: total % centavos', v_r->>'total_cents';

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 3: preço adulterado em VÁRIOS itens ao mesmo tempo';
  v_r := public.create_order('Hacker Teste', '15999998888',
    jsonb_build_array(
      jsonb_build_object('product_id', v_carne, 'quantity', 2, 'unit_price_cents', 1),
      jsonb_build_object('product_id', v_agua,  'quantity', 1, 'unit_price_cents', 1)));
  -- esperado: 2 x 800 + 1 x 400 = 2000
  if (v_r->>'total_cents')::int <> 2000 then
    raise exception 'FALHOU: esperava 2000, veio %', v_r->>'total_cents';
  end if;
  raise notice '    OK: total % centavos, todos os preços vieram do banco', v_r->>'total_cents';

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 4: produto inexistente deve ser recusado';
  begin
    v_r := public.create_order('Teste', '15999998888',
      jsonb_build_array(jsonb_build_object('product_id', 99999999, 'quantity', 1)));
    raise exception 'FALHOU: deveria ter recusado produto inexistente';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '    OK: recusado com "%"', sqlerrm;
  end;

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 5: produto indisponível deve avisar, não cobrar';
  update public.products set available = false where id = v_agua;
  v_r := public.create_order('Teste', '15999998888',
    jsonb_build_array(
      jsonb_build_object('product_id', v_carne, 'quantity', 1),
      jsonb_build_object('product_id', v_agua,  'quantity', 1)));

  if v_r->>'status' <> 'unavailable' then
    raise exception 'FALHOU: esperava status unavailable, veio %', v_r->>'status';
  end if;
  raise notice '    OK: status=% avisando sobre "%"',
    v_r->>'status', v_r->'items'->0->>'name';
  update public.products set available = true where id = v_agua;

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 6: preço mudou durante a compra -> pedir confirmação';
  v_r := public.create_order('Teste', '15999998888',
    jsonb_build_array(jsonb_build_object(
      'product_id', v_carne, 'quantity', 1, 'unit_price_cents', 700)),
    p_expected_total_cents := 700);

  if v_r->>'status' <> 'price_changed' then
    raise exception 'FALHOU: esperava price_changed, veio %', v_r->>'status';
  end if;
  raise notice '    OK: avisou % -> % centavos, sem gravar o pedido',
    v_r->'changes'->0->>'old_cents', v_r->'changes'->0->>'new_cents';

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 7: adicional usa o preço do banco, não o enviado';
  v_r := public.create_order('Teste', '15999998888',
    jsonb_build_array(jsonb_build_object(
      'product_id', v_carne, 'quantity', 2,
      'addon_ids', jsonb_build_array(v_catupiry),
      'unit_price_cents', 800)));
  -- esperado: (800 + 200) * 2 = 2000
  if (v_r->>'total_cents')::int <> 2000 then
    raise exception 'FALHOU: esperava 2000, veio %', v_r->>'total_cents';
  end if;
  raise notice '    OK: (esfiha 800 + catupiry 200) x2 = % centavos', v_r->>'total_cents';

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 8: adicional de OUTRO produto deve ser recusado';
  -- molho de alho pertence ao grupo "Molhos", que não está ligado à Esfiha de Carne
  begin
    v_r := public.create_order('Teste', '15999998888',
      jsonb_build_array(jsonb_build_object(
        'product_id', v_carne, 'quantity', 1,
        'addon_ids', jsonb_build_array(v_molho_alho))));
    raise exception 'FALHOU: deveria recusar adicional não vinculado ao produto';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '    OK: recusado com "%"', sqlerrm;
  end;

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 9: promoção válida é aplicada pelo servidor';
  v_r := public.create_order('Teste', '15999998888',
    jsonb_build_array(jsonb_build_object('product_id', v_costela, 'quantity', 1)));
  if (v_r->>'total_cents')::int <> 1090 then
    raise exception 'FALHOU: esperava 1090 (promo), veio %', v_r->>'total_cents';
  end if;
  raise notice '    OK: cobrou o preço promocional de % centavos', v_r->>'total_cents';

  raise notice '--- TESTE 10: promoção VENCIDA volta ao preço cheio';
  update public.products set promo_end = now() - interval '1 day' where id = v_costela;
  v_r := public.create_order('Teste', '15999998888',
    jsonb_build_array(jsonb_build_object('product_id', v_costela, 'quantity', 1)));
  if (v_r->>'total_cents')::int <> 1350 then
    raise exception 'FALHOU: esperava 1350 (promo vencida), veio %', v_r->>'total_cents';
  end if;
  raise notice '    OK: promoção vencida ignorada, cobrou % centavos', v_r->>'total_cents';
  update public.products set promo_end = null where id = v_costela;

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 11: quantidade inválida é recusada';
  begin
    v_r := public.create_order('Teste', '15999998888',
      jsonb_build_array(jsonb_build_object('product_id', v_carne, 'quantity', 0)));
    raise exception 'FALHOU: deveria recusar quantidade 0';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '    OK: recusado com "%"', sqlerrm;
  end;

  begin
    v_r := public.create_order('Teste', '15999998888',
      jsonb_build_array(jsonb_build_object('product_id', v_carne, 'quantity', -5)));
    raise exception 'FALHOU: deveria recusar quantidade negativa';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '    OK: quantidade negativa recusada';
  end;

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 12: telefone e nome inválidos são recusados';
  begin
    v_r := public.create_order('X', '15999998888',
      jsonb_build_array(jsonb_build_object('product_id', v_carne, 'quantity', 1)));
    raise exception 'FALHOU: deveria recusar nome de 1 letra';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '    OK: nome curto recusado';
  end;

  begin
    v_r := public.create_order('Teste', '123',
      jsonb_build_array(jsonb_build_object('product_id', v_carne, 'quantity', 1)));
    raise exception 'FALHOU: deveria recusar telefone curto';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice '    OK: telefone inválido recusado';
  end;

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 13: idempotência (tocar 3x em enviar cria 1 pedido)';
  v_token := gen_random_uuid();
  v_r := public.create_order('Teste Duplo', '15999998888',
    jsonb_build_array(jsonb_build_object('product_id', v_carne, 'quantity', 1)),
    p_client_token := v_token);
  v_code1 := v_r->>'code';

  v_r := public.create_order('Teste Duplo', '15999998888',
    jsonb_build_array(jsonb_build_object('product_id', v_carne, 'quantity', 1)),
    p_client_token := v_token);
  if v_r->>'code' <> v_code1 then
    raise exception 'FALHOU: criou pedido novo (% vs %)', v_r->>'code', v_code1;
  end if;

  v_r := public.create_order('Teste Duplo', '15999998888',
    jsonb_build_array(jsonb_build_object('product_id', v_carne, 'quantity', 1)),
    p_client_token := v_token);
  if v_r->>'code' <> v_code1 then
    raise exception 'FALHOU: terceiro toque criou pedido novo';
  end if;
  raise notice '    OK: os 3 toques devolveram o mesmo pedido %', v_code1;

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 14: loja fechada recusa pedido';
  update public.settings set value = 'false' where key = 'accepting_orders';
  v_r := public.create_order('Teste', '15999998888',
    jsonb_build_array(jsonb_build_object('product_id', v_carne, 'quantity', 1)));
  if v_r->>'status' <> 'closed' then
    raise exception 'FALHOU: esperava closed, veio %', v_r->>'status';
  end if;
  raise notice '    OK: recusado com "%"', v_r->>'message';
  update public.settings set value = 'true' where key = 'accepting_orders';

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 15: pedido mínimo é respeitado';
  update public.settings set value = '5000' where key = 'min_order_cents';
  v_r := public.create_order('Teste', '15999998888',
    jsonb_build_array(jsonb_build_object('product_id', v_carne, 'quantity', 1)));
  if v_r->>'status' <> 'below_minimum' then
    raise exception 'FALHOU: esperava below_minimum, veio %', v_r->>'status';
  end if;
  raise notice '    OK: bloqueou abaixo do mínimo de % centavos', v_r->>'minimum_cents';
  update public.settings set value = '0' where key = 'min_order_cents';

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 16: snapshot preserva o preço histórico';
  v_r := public.create_order('Teste Snapshot', '15999998888',
    jsonb_build_array(jsonb_build_object('product_id', v_carne, 'quantity', 1)));
  v_code1 := v_r->>'code';
  update public.products set price_cents = 9999 where id = v_carne;

  if (select unit_price_cents_snapshot from public.order_items i
      join public.orders o on o.id = i.order_id
      where o.public_code = v_code1) <> 800 then
    raise exception 'FALHOU: snapshot foi alterado junto com o produto';
  end if;
  raise notice '    OK: pedido antigo ainda mostra 800 mesmo com produto a 9999';
  update public.products set price_cents = 800 where id = v_carne;

  ---------------------------------------------------------------------------
  raise notice '--- TESTE 17: pedido fora do prazo do dia de evento é recusado';
  update public.settings set value = '1' where key = 'order_cutoff_days';
  update public.settings set value =
    jsonb_build_array(jsonb_build_object(
      'date', to_char(current_date, 'YYYY-MM-DD'), 'open', '18:00', 'close', '22:30'
    ))::text
    where key = 'event_days';

  v_r := public.create_order('Teste Evento', '15999998888',
    jsonb_build_array(jsonb_build_object('product_id', v_carne, 'quantity', 1)),
    p_pickup_at := (current_date::timestamp + interval '19 hours'));
  if v_r->>'status' <> 'closed' then
    raise exception 'FALHOU: esperava closed (prazo de 1 dia antes do evento já passou), veio %', v_r->>'status';
  end if;
  raise notice '    OK: recusado com "%"', v_r->>'message';

  raise notice '--- TESTE 18: pedido dentro do prazo do dia de evento é aceito';
  update public.settings set value =
    jsonb_build_array(jsonb_build_object(
      'date', to_char(current_date + 2, 'YYYY-MM-DD'), 'open', '18:00', 'close', '22:30'
    ))::text
    where key = 'event_days';

  v_r := public.create_order('Teste Evento', '15999998888',
    jsonb_build_array(jsonb_build_object('product_id', v_carne, 'quantity', 1)),
    p_pickup_at := ((current_date + 2)::timestamp + interval '19 hours'));
  if (v_r->>'total_cents')::int <> 800 then
    raise exception 'FALHOU: pedido dentro do prazo deveria ter sido aceito, veio %', v_r;
  end if;
  raise notice '    OK: pedido para evento daqui a 2 dias aceito normalmente';
  update public.settings set value = '[]' where key = 'event_days';

  raise notice '';
  raise notice '================================================';
  raise notice '  TODOS OS 18 TESTES PASSARAM';
  raise notice '================================================';
end;
$t$;
