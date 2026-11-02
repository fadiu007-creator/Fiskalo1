-- Fiskalo business MVP schema. All objects are namespaced to protect shared Supabase project zikos.
create extension if not exists pgcrypto;

create type public.fiskalo_organization_role as enum ('owner', 'administrator', 'accountant', 'cashier', 'manager');
create type public.fiskalo_invoice_status as enum ('draft', 'issued', 'cancelled');

create table public.fiskalo_organizations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  legal_name text not null,
  trade_name text,
  nui text not null unique,
  fiscal_number text,
  vat_registered boolean not null default false,
  business_type text,
  business_activity text,
  address text,
  municipality text not null,
  phone text,
  email text,
  fiscalization_status text not null default 'not_configured'
    check (fiscalization_status in ('not_configured', 'pending', 'test', 'certified', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fiskalo_organization_users (
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role public.fiskalo_organization_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.fiskalo_branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  name text not null,
  address text,
  municipality text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.fiskalo_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  branch_id uuid references public.fiskalo_branches(id) on delete set null,
  sku text,
  name text not null,
  description text,
  item_type text not null default 'product' check (item_type in ('product', 'service')),
  unit text not null default 'copë',
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  vat_rate numeric(5,2) not null default 18 check (vat_rate in (0, 8, 18)),
  stock_quantity numeric(14,3) not null default 0,
  track_stock boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku)
);

create table public.fiskalo_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  name text not null,
  business_number text,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table public.fiskalo_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  branch_id uuid references public.fiskalo_branches(id) on delete set null,
  customer_id uuid references public.fiskalo_customers(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  invoice_number text,
  status public.fiskalo_invoice_status not null default 'draft',
  issue_date date not null default current_date,
  due_date date,
  currency char(3) not null default 'EUR' check (currency = 'EUR'),
  notes text,
  subtotal numeric(14,2) not null default 0,
  vat_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  fiscalization_status text not null default 'not_fiscalized'
    check (fiscalization_status in ('not_fiscalized', 'queued', 'submitted', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  unique (organization_id, invoice_number)
);

create table public.fiskalo_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.fiskalo_invoices(id) on delete restrict,
  product_id uuid references public.fiskalo_products(id) on delete set null,
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  vat_rate numeric(5,2) not null check (vat_rate in (0, 8, 18)),
  line_subtotal numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  line_vat numeric(14,2) generated always as (round(quantity * unit_price * vat_rate / 100, 2)) stored
);

create table public.fiskalo_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  branch_id uuid references public.fiskalo_branches(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  supplier_name text,
  description text not null,
  category text not null default 'Tjetër',
  amount numeric(14,2) not null check (amount > 0),
  vat_rate numeric(5,2) not null default 0 check (vat_rate in (0, 8, 18)),
  expense_date date not null default current_date,
  reference text,
  created_at timestamptz not null default now()
);

create table public.fiskalo_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  product_id uuid not null references public.fiskalo_products(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  movement_type text not null check (movement_type in ('opening', 'in', 'out', 'adjustment')),
  quantity numeric(14,3) not null check (quantity <> 0),
  note text,
  created_at timestamptz not null default now()
);

create table public.fiskalo_audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index fiskalo_members_user_idx on public.fiskalo_organization_users(user_id);
create index fiskalo_products_org_idx on public.fiskalo_products(organization_id);
create index fiskalo_customers_org_idx on public.fiskalo_customers(organization_id);
create index fiskalo_invoices_org_date_idx on public.fiskalo_invoices(organization_id, issue_date desc);
create index fiskalo_expenses_org_date_idx on public.fiskalo_expenses(organization_id, expense_date desc);
create index fiskalo_movements_product_idx on public.fiskalo_inventory_movements(product_id, created_at desc);

create or replace function public.fiskalo_is_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.fiskalo_organization_users m where m.organization_id = target_org and m.user_id = auth.uid()); $$;

create or replace function public.fiskalo_has_role(target_org uuid, allowed_roles public.fiskalo_organization_role[])
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.fiskalo_organization_users m where m.organization_id = target_org and m.user_id = auth.uid() and m.role = any(allowed_roles)); $$;

revoke all on function public.fiskalo_is_member(uuid) from public;
revoke all on function public.fiskalo_has_role(uuid, public.fiskalo_organization_role[]) from public;
grant execute on function public.fiskalo_is_member(uuid) to authenticated;
grant execute on function public.fiskalo_has_role(uuid, public.fiskalo_organization_role[]) to authenticated;

create or replace function public.fiskalo_touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp
as $$ begin new.updated_at = now(); return new; end; $$;
create trigger fiskalo_organizations_touch before update on public.fiskalo_organizations for each row execute function public.fiskalo_touch_updated_at();
create trigger fiskalo_products_touch before update on public.fiskalo_products for each row execute function public.fiskalo_touch_updated_at();

-- Issued and cancelled invoices are immutable. Corrections require a separate legally valid document workflow.
create or replace function public.fiskalo_guard_invoice()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if old.status in ('issued', 'cancelled') then
    raise exception 'Issued or cancelled invoices cannot be modified';
  end if;
  if new.status = 'issued' then
    new.issued_at = now();
    if new.invoice_number is null then
      raise exception 'Invoice number must be assigned before issue';
    end if;
  end if;
  return new;
end;
$$;
create trigger fiskalo_invoice_immutable before update on public.fiskalo_invoices for each row execute function public.fiskalo_guard_invoice();

create or replace function public.fiskalo_refresh_invoice_totals()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
declare target_id uuid;
begin
  target_id := coalesce(new.invoice_id, old.invoice_id);
  update public.fiskalo_invoices i
    set subtotal = coalesce((select sum(li.line_subtotal) from public.fiskalo_invoice_items li where li.invoice_id = target_id), 0),
        vat_total = coalesce((select sum(li.line_vat) from public.fiskalo_invoice_items li where li.invoice_id = target_id), 0),
        total = coalesce((select sum(li.line_subtotal + li.line_vat) from public.fiskalo_invoice_items li where li.invoice_id = target_id), 0)
  where i.id = target_id and i.status = 'draft';
  return coalesce(new, old);
end;
$$;
create trigger fiskalo_invoice_items_totals after insert or update or delete on public.fiskalo_invoice_items for each row execute function public.fiskalo_refresh_invoice_totals();

alter table public.fiskalo_organizations enable row level security;
alter table public.fiskalo_organization_users enable row level security;
alter table public.fiskalo_branches enable row level security;
alter table public.fiskalo_products enable row level security;
alter table public.fiskalo_customers enable row level security;
alter table public.fiskalo_invoices enable row level security;
alter table public.fiskalo_invoice_items enable row level security;
alter table public.fiskalo_expenses enable row level security;
alter table public.fiskalo_inventory_movements enable row level security;
alter table public.fiskalo_audit_logs enable row level security;

create policy fiskalo_org_select on public.fiskalo_organizations for select to authenticated
using (created_by = auth.uid() or public.fiskalo_is_member(id));
create policy fiskalo_org_insert on public.fiskalo_organizations for insert to authenticated
with check (created_by = auth.uid());
create policy fiskalo_org_update on public.fiskalo_organizations for update to authenticated
using (public.fiskalo_has_role(id, array['owner','administrator']::public.fiskalo_organization_role[]))
with check (public.fiskalo_has_role(id, array['owner','administrator']::public.fiskalo_organization_role[]));

create policy fiskalo_members_select on public.fiskalo_organization_users for select to authenticated
using (user_id = auth.uid() or public.fiskalo_has_role(organization_id, array['owner','administrator']::public.fiskalo_organization_role[]));
create policy fiskalo_members_insert_owner on public.fiskalo_organization_users for insert to authenticated
with check (user_id = auth.uid() and role = 'owner' and exists (select 1 from public.fiskalo_organizations o where o.id = organization_id and o.created_by = auth.uid()));

create policy fiskalo_branches_all on public.fiskalo_branches for all to authenticated
using (public.fiskalo_has_role(organization_id, array['owner','administrator','manager']::public.fiskalo_organization_role[]))
with check (public.fiskalo_has_role(organization_id, array['owner','administrator','manager']::public.fiskalo_organization_role[]));

create policy fiskalo_products_select on public.fiskalo_products for select to authenticated using (public.fiskalo_is_member(organization_id));
create policy fiskalo_products_write on public.fiskalo_products for all to authenticated
using (public.fiskalo_has_role(organization_id, array['owner','administrator','manager']::public.fiskalo_organization_role[]))
with check (public.fiskalo_has_role(organization_id, array['owner','administrator','manager']::public.fiskalo_organization_role[]));

create policy fiskalo_customers_select on public.fiskalo_customers for select to authenticated using (public.fiskalo_is_member(organization_id));
create policy fiskalo_customers_write on public.fiskalo_customers for all to authenticated
using (public.fiskalo_is_member(organization_id))
with check (public.fiskalo_is_member(organization_id));

create policy fiskalo_invoices_select on public.fiskalo_invoices for select to authenticated using (public.fiskalo_is_member(organization_id));
create policy fiskalo_invoices_insert on public.fiskalo_invoices for insert to authenticated
with check (created_by = auth.uid() and public.fiskalo_is_member(organization_id));
create policy fiskalo_invoices_update_draft on public.fiskalo_invoices for update to authenticated
using (status = 'draft' and public.fiskalo_is_member(organization_id))
with check (status in ('draft','issued') and public.fiskalo_is_member(organization_id));

create policy fiskalo_invoice_items_select on public.fiskalo_invoice_items for select to authenticated
using (exists (select 1 from public.fiskalo_invoices i where i.id = invoice_id and public.fiskalo_is_member(i.organization_id)));
create policy fiskalo_invoice_items_insert on public.fiskalo_invoice_items for insert to authenticated
with check (exists (select 1 from public.fiskalo_invoices i where i.id = invoice_id and i.status = 'draft' and public.fiskalo_is_member(i.organization_id)));
create policy fiskalo_invoice_items_update on public.fiskalo_invoice_items for update to authenticated
using (exists (select 1 from public.fiskalo_invoices i where i.id = invoice_id and i.status = 'draft' and public.fiskalo_is_member(i.organization_id)))
with check (exists (select 1 from public.fiskalo_invoices i where i.id = invoice_id and i.status = 'draft' and public.fiskalo_is_member(i.organization_id)));
create policy fiskalo_invoice_items_delete on public.fiskalo_invoice_items for delete to authenticated
using (exists (select 1 from public.fiskalo_invoices i where i.id = invoice_id and i.status = 'draft' and public.fiskalo_is_member(i.organization_id)));

create policy fiskalo_expenses_select on public.fiskalo_expenses for select to authenticated using (public.fiskalo_is_member(organization_id));
create policy fiskalo_expenses_write on public.fiskalo_expenses for all to authenticated
using (public.fiskalo_has_role(organization_id, array['owner','administrator','accountant','manager']::public.fiskalo_organization_role[]))
with check (created_by = auth.uid() and public.fiskalo_has_role(organization_id, array['owner','administrator','accountant','manager']::public.fiskalo_organization_role[]));

create policy fiskalo_movements_select on public.fiskalo_inventory_movements for select to authenticated using (public.fiskalo_is_member(organization_id));
create policy fiskalo_movements_insert on public.fiskalo_inventory_movements for insert to authenticated
with check (created_by = auth.uid() and public.fiskalo_has_role(organization_id, array['owner','administrator','manager']::public.fiskalo_organization_role[]));

create policy fiskalo_audit_select on public.fiskalo_audit_logs for select to authenticated using (public.fiskalo_is_member(organization_id));

grant select, insert, update on public.fiskalo_organizations to authenticated;
grant select, insert on public.fiskalo_organization_users to authenticated;
grant select, insert, update on public.fiskalo_branches to authenticated;
grant select, insert, update, delete on public.fiskalo_products, public.fiskalo_customers, public.fiskalo_invoice_items to authenticated;
grant select, insert, update on public.fiskalo_invoices to authenticated;
grant select, insert on public.fiskalo_expenses, public.fiskalo_inventory_movements to authenticated;
grant select on public.fiskalo_audit_logs to authenticated;
grant usage, select on sequence public.fiskalo_audit_logs_id_seq to authenticated;
