-- Allow business managers to delete products in their own organization.
-- Historical invoice references remain protected by the existing foreign keys.
revoke delete on table public.fiskalo_products from anon;
grant delete on table public.fiskalo_products to authenticated;

drop policy if exists fiskalo_products_delete on public.fiskalo_products;
create policy fiskalo_products_delete
  on public.fiskalo_products
  for delete to authenticated
  using (
    public.fiskalo_has_role(
      organization_id,
      array['owner','administrator','manager']::public.fiskalo_organization_role[]
    )
  );
