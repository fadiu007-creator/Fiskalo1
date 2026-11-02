create or replace function public.fiskalo_adjust_stock(target_product uuid, quantity_delta numeric, movement_note text default null)
returns numeric language plpgsql security definer set search_path = public, pg_temp
as $$
declare item public.fiskalo_products%rowtype;
declare new_quantity numeric(14,3);
declare kind text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if quantity_delta is null or quantity_delta = 0 then raise exception 'Enter a non-zero quantity adjustment'; end if;
  select * into item from public.fiskalo_products where id = target_product for update;
  if not found then raise exception 'Product not found'; end if;
  if not public.fiskalo_has_role(item.organization_id, array['owner','administrator','manager']::public.fiskalo_organization_role[]) then
    raise exception 'You do not have permission to adjust stock';
  end if;
  if not item.track_stock then raise exception 'Stock tracking is disabled for this item'; end if;
  new_quantity := item.stock_quantity + quantity_delta;
  if new_quantity < 0 then raise exception 'Stock cannot be negative'; end if;
  kind := case when quantity_delta > 0 then 'in' else 'out' end;
  update public.fiskalo_products set stock_quantity = new_quantity where id = target_product;
  insert into public.fiskalo_inventory_movements(organization_id, product_id, created_by, movement_type, quantity, note)
  values (item.organization_id, target_product, auth.uid(), kind, quantity_delta, nullif(trim(movement_note), ''));
  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (item.organization_id, auth.uid(), 'stock.adjusted', 'product', target_product, jsonb_build_object('delta', quantity_delta, 'new_quantity', new_quantity, 'note', movement_note));
  return new_quantity;
end;
$$;
revoke all on function public.fiskalo_adjust_stock(uuid, numeric, text) from public;
grant execute on function public.fiskalo_adjust_stock(uuid, numeric, text) to authenticated;
