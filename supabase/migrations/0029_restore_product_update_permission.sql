-- Restore product editing for authenticated business managers.
-- Row-level security remains the authorization boundary: fiskalo_products_write
-- permits only owners, administrators, and managers in their own organization.
revoke all on table public.fiskalo_products from anon;
grant select, insert, update on table public.fiskalo_products to authenticated;
