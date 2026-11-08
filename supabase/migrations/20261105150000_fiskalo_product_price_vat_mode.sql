-- Preserve how the business entered the selling price while keeping unit_price net of VAT for accounting and ATK.
alter table public.fiskalo_products
  add column if not exists price_includes_vat boolean not null default false;

comment on column public.fiskalo_products.price_includes_vat is
  'Whether the entered/displayed selling price includes VAT. unit_price remains the net amount used by invoice calculations.';
