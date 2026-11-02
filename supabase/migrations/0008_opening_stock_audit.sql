create or replace function public.fiskalo_record_opening_stock()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.track_stock and new.stock_quantity > 0 then
    insert into public.fiskalo_inventory_movements(organization_id, product_id, created_by, movement_type, quantity, note)
    values (new.organization_id, new.id, auth.uid(), 'opening', new.stock_quantity, 'Gjendja fillestare');
  end if;
  return new;
end;
$$;
create trigger fiskalo_products_opening_stock after insert on public.fiskalo_products
for each row execute function public.fiskalo_record_opening_stock();
