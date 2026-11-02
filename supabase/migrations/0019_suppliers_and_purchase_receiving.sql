-- Supplier register and purchase receiving workflow. All objects remain Fiskalo-prefixed.
create table public.fiskalo_suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  name text not null,
  business_number text,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  unique (organization_id, business_number)
);

create table public.fiskalo_purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  supplier_id uuid not null references public.fiskalo_suppliers(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  reference text,
  purchase_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','received')),
  total numeric(14,2) not null default 0 check (total >= 0),
  notes text,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, reference)
);

create table public.fiskalo_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.fiskalo_purchases(id) on delete restrict,
  product_id uuid not null references public.fiskalo_products(id) on delete restrict,
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  vat_rate numeric(5,2) not null default 0 check (vat_rate in (0,8,18)),
  line_subtotal numeric(14,2) generated always as (round(quantity * unit_cost,2)) stored,
  line_vat numeric(14,2) generated always as (round(quantity * unit_cost * vat_rate / 100,2)) stored
);

create index fiskalo_suppliers_org_idx on public.fiskalo_suppliers(organization_id,name);
create index fiskalo_purchases_org_date_idx on public.fiskalo_purchases(organization_id,purchase_date desc);
create index fiskalo_purchase_items_purchase_idx on public.fiskalo_purchase_items(purchase_id);

alter table public.fiskalo_suppliers enable row level security;
alter table public.fiskalo_purchases enable row level security;
alter table public.fiskalo_purchase_items enable row level security;

create policy fiskalo_suppliers_select on public.fiskalo_suppliers for select to authenticated
using (public.fiskalo_is_member(organization_id));
create policy fiskalo_suppliers_write on public.fiskalo_suppliers for all to authenticated
using (public.fiskalo_has_role(organization_id,array['owner','administrator','accountant','manager']::public.fiskalo_organization_role[]))
with check (public.fiskalo_has_role(organization_id,array['owner','administrator','accountant','manager']::public.fiskalo_organization_role[]));

create policy fiskalo_purchases_select on public.fiskalo_purchases for select to authenticated
using (public.fiskalo_is_member(organization_id));
create policy fiskalo_purchases_insert on public.fiskalo_purchases for insert to authenticated
with check (created_by = auth.uid() and status = 'draft' and public.fiskalo_has_role(organization_id,array['owner','administrator','accountant','manager']::public.fiskalo_organization_role[]));
create policy fiskalo_purchases_update_draft on public.fiskalo_purchases for update to authenticated
using (status = 'draft' and public.fiskalo_has_role(organization_id,array['owner','administrator','accountant','manager']::public.fiskalo_organization_role[]))
with check (status = 'draft' and public.fiskalo_has_role(organization_id,array['owner','administrator','accountant','manager']::public.fiskalo_organization_role[]));

create policy fiskalo_purchase_items_select on public.fiskalo_purchase_items for select to authenticated
using (exists(select 1 from public.fiskalo_purchases p where p.id=purchase_id and public.fiskalo_is_member(p.organization_id)));
create policy fiskalo_purchase_items_insert on public.fiskalo_purchase_items for insert to authenticated
with check (exists(
  select 1 from public.fiskalo_purchases p
  join public.fiskalo_products pr on pr.id=product_id and pr.organization_id=p.organization_id and pr.track_stock
  where p.id=purchase_id and p.status='draft'
    and public.fiskalo_has_role(p.organization_id,array['owner','administrator','accountant','manager']::public.fiskalo_organization_role[])
));
create policy fiskalo_purchase_items_delete_draft on public.fiskalo_purchase_items for delete to authenticated
using (exists(select 1 from public.fiskalo_purchases p where p.id=purchase_id and p.status='draft'
  and public.fiskalo_has_role(p.organization_id,array['owner','administrator','accountant','manager']::public.fiskalo_organization_role[])));

grant select,insert,update,delete on public.fiskalo_suppliers to authenticated;
grant select,insert,update on public.fiskalo_purchases to authenticated;
grant select,insert,delete on public.fiskalo_purchase_items to authenticated;

create or replace function public.fiskalo_receive_purchase(target_purchase uuid)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  purchase_row public.fiskalo_purchases%rowtype;
  purchase_total numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into purchase_row
  from public.fiskalo_purchases
  where id=target_purchase
  for update;

  if not found then raise exception 'Purchase not found'; end if;
  if not public.fiskalo_has_role(purchase_row.organization_id,array['owner','administrator','accountant','manager']::public.fiskalo_organization_role[]) then
    raise exception 'You do not have permission to receive purchases';
  end if;
  if purchase_row.status <> 'draft' then raise exception 'Only draft purchases can be received'; end if;
  if not exists(select 1 from public.fiskalo_purchase_items where purchase_id=target_purchase) then
    raise exception 'Add at least one purchase item before receiving';
  end if;

  -- Lock all affected products in a stable order to avoid concurrent stock races.
  perform pr.id
  from public.fiskalo_products pr
  join (
    select product_id from public.fiskalo_purchase_items where purchase_id=target_purchase group by product_id
  ) items on items.product_id=pr.id
  where pr.organization_id=purchase_row.organization_id and pr.track_stock
  order by pr.id
  for update;

  if exists (
    select 1 from public.fiskalo_purchase_items pi
    join public.fiskalo_products pr on pr.id=pi.product_id
    where pi.purchase_id=target_purchase
      and (pr.organization_id <> purchase_row.organization_id or not pr.track_stock)
  ) then raise exception 'Purchase contains an item that is not stock-tracked in this business'; end if;

  update public.fiskalo_products pr
  set stock_quantity=pr.stock_quantity + received.quantity
  from (
    select product_id,sum(quantity) as quantity
    from public.fiskalo_purchase_items
    where purchase_id=target_purchase
    group by product_id
  ) received
  where pr.id=received.product_id and pr.organization_id=purchase_row.organization_id;

  insert into public.fiskalo_inventory_movements(organization_id,product_id,created_by,movement_type,quantity,note)
  select purchase_row.organization_id,pi.product_id,auth.uid(),'in',sum(pi.quantity),
    'Pranim i blerjes ' || coalesce(nullif(purchase_row.reference,''),left(target_purchase::text,8))
  from public.fiskalo_purchase_items pi
  where pi.purchase_id=target_purchase
  group by pi.product_id;

  select coalesce(sum(line_subtotal + line_vat),0) into purchase_total
  from public.fiskalo_purchase_items where purchase_id=target_purchase;

  update public.fiskalo_purchases
  set status='received', received_at=now(), total=purchase_total
  where id=target_purchase;

  insert into public.fiskalo_audit_logs(organization_id,actor_id,action,entity_type,entity_id,details)
  values (purchase_row.organization_id,auth.uid(),'purchase.received','purchase',target_purchase,
    jsonb_build_object('reference',purchase_row.reference,'total',purchase_total));

  return purchase_total;
end;
$$;

revoke all on function public.fiskalo_receive_purchase(uuid) from public, anon;
grant execute on function public.fiskalo_receive_purchase(uuid) to authenticated;
