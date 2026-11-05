-- Restaurant-style quick-service POS catalog metadata.
alter table public.fiskalo_products
  add column if not exists pos_category text not null default 'Tjera',
  add column if not exists image_url text;

create index if not exists fiskalo_products_org_pos_category_active_idx
  on public.fiskalo_products (organization_id, pos_category, name)
  where is_active = true;
