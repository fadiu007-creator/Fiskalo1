alter table public.fiskalo_invoice_items
  drop column line_subtotal,
  drop column line_vat;

alter table public.fiskalo_products
  alter column unit_price type numeric(14,4) using unit_price::numeric(14,4);
alter table public.fiskalo_invoice_items
  alter column unit_price type numeric(14,4) using unit_price::numeric(14,4);

alter table public.fiskalo_invoice_items
  add column line_subtotal numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  add column line_vat numeric(14,2) generated always as (round(quantity * unit_price * vat_rate / 100, 2)) stored;
