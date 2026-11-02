create or replace function public.fiskalo_set_stock(
  target_product uuid,
  target_quantity numeric,
  movement_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item public.fiskalo_products%rowtype;
  desired_quantity numeric(14,3);
  quantity_delta numeric(14,3);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if target_quantity is null or target_quantity < 0 then
    raise exception 'Stock quantity must be zero or greater';
  end if;
  if target_quantity <> round(target_quantity, 3) then
    raise exception 'Stock quantity supports up to three decimal places';
  end if;

  select * into item
  from public.fiskalo_products
  where id = target_product
  for update;

  if not found then
    raise exception 'Product not found';
  end if;
  if not public.fiskalo_has_role(
    item.organization_id,
    array['owner','administrator','manager']::public.fiskalo_organization_role[]
  ) then
    raise exception 'You do not have permission to adjust stock';
  end if;
  if not item.track_stock then
    raise exception 'Stock tracking is disabled for this item';
  end if;

  desired_quantity := target_quantity::numeric(14,3);
  quantity_delta := desired_quantity - item.stock_quantity;
  if quantity_delta = 0 then
    return desired_quantity;
  end if;

  update public.fiskalo_products
  set stock_quantity = desired_quantity
  where id = target_product;

  insert into public.fiskalo_inventory_movements(
    organization_id, product_id, created_by, movement_type, quantity, note
  )
  values (
    item.organization_id,
    target_product,
    auth.uid(),
    case when quantity_delta > 0 then 'in' else 'out' end,
    quantity_delta,
    coalesce(nullif(trim(movement_note), ''), 'Përditësim i gjendjes së stokut')
  );

  insert into public.fiskalo_audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, details
  )
  values (
    item.organization_id,
    auth.uid(),
    'stock.set',
    'product',
    target_product,
    jsonb_build_object(
      'previous_quantity', item.stock_quantity,
      'new_quantity', desired_quantity,
      'delta', quantity_delta,
      'note', movement_note
    )
  );

  return desired_quantity;
end;
$$;

revoke all on function public.fiskalo_set_stock(uuid, numeric, text) from public;
grant execute on function public.fiskalo_set_stock(uuid, numeric, text) to authenticated;
