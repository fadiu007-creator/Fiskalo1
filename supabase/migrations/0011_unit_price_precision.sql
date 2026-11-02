alter table public.fiskalo_products
  alter column unit_price type numeric(14,4) using unit_price::numeric(14,4);
alter table public.fiskalo_invoice_items
  alter column unit_price type numeric(14,4) using unit_price::numeric(14,4);
