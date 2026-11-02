create or replace function public.fiskalo_create_purchase(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  org_id uuid := nullif(payload->>'organization_id','')::uuid;
  supplier uuid := nullif(payload->>'supplier_id','')::uuid;
  purchase_id uuid;
  item jsonb;
  product_row public.fiskalo_products%rowtype;
  qty numeric(14,3);
  cost numeric(14,4);
  vat numeric(5,2);
  total_value numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if org_id is null or not public.fiskalo_has_role(org_id,array['owner','administrator','accountant','manager']::public.fiskalo_organization_role[]) then
    raise exception 'You do not have permission to create purchases';
  end if;
  if supplier is null or not exists(select 1 from public.fiskalo_suppliers where id=supplier and organization_id=org_id) then
    raise exception 'Supplier does not belong to this business';
  end if;
  if jsonb_typeof(payload->'items') <> 'array' or jsonb_array_length(payload->'items')=0 then
    raise exception 'Add at least one purchase item';
  end if;

  insert into public.fiskalo_purchases(organization_id,supplier_id,created_by,reference,purchase_date,notes)
  values(org_id,supplier,auth.uid(),nullif(trim(payload->>'reference'),''),coalesce(nullif(payload->>'purchase_date','')::date,current_date),nullif(trim(payload->>'notes'),''))
  returning id into purchase_id;

  for item in select value from jsonb_array_elements(payload->'items')
  loop
    if nullif(item->>'product_id','') is null then raise exception 'Select a product for every purchase line'; end if;
    qty := (item->>'quantity')::numeric;
    cost := (item->>'unit_cost')::numeric;
    vat := coalesce((item->>'vat_rate')::numeric,0);
    if qty <= 0 or cost < 0 or vat not in (0,8,18) then raise exception 'Invalid purchase line values'; end if;
    select * into product_row from public.fiskalo_products
      where id=(item->>'product_id')::uuid and organization_id=org_id and track_stock
      for update;
    if not found then raise exception 'A selected item is not stock-tracked in this business'; end if;
    insert into public.fiskalo_purchase_items(purchase_id,product_id,description,quantity,unit_cost,vat_rate)
    values(purchase_id,product_row.id,product_row.name,qty,cost,vat);
  end loop;

  select coalesce(sum(line_subtotal+line_vat),0) into total_value
  from public.fiskalo_purchase_items where purchase_id=purchase_id;
  update public.fiskalo_purchases set total=total_value where id=purchase_id;

  insert into public.fiskalo_audit_logs(organization_id,actor_id,action,entity_type,entity_id,details)
  values(org_id,auth.uid(),'purchase.created','purchase',purchase_id,
    jsonb_build_object('reference',payload->>'reference','total',total_value));
  return purchase_id;
end;
$$;
revoke all on function public.fiskalo_create_purchase(jsonb) from public, anon;
grant execute on function public.fiskalo_create_purchase(jsonb) to authenticated;
