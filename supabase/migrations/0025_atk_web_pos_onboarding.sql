-- Web POS TEST onboarding and product-level ATK catalogue mappings.
-- Isolated to Fiskalo tables; production fiscalization remains disabled.
alter table public.fiskalo_products
  add column if not exists atk_unit_code text,
  add column if not exists atk_tax_code text,
  add column if not exists atk_item_category_code text;

alter table public.fiskalo_atk_pos_installations enable row level security;
drop policy if exists fiskalo_atk_pos_update_test on public.fiskalo_atk_pos_installations;
create policy fiskalo_atk_pos_update_test
  on public.fiskalo_atk_pos_installations
  for update to authenticated
  using (
    environment = 'test'
    and public.fiskalo_has_role(organization_id, array['owner','administrator']::public.fiskalo_organization_role[])
  )
  with check (
    environment = 'test'
    and public.fiskalo_has_role(organization_id, array['owner','administrator']::public.fiskalo_organization_role[])
  );
grant update on public.fiskalo_atk_pos_installations to authenticated;
