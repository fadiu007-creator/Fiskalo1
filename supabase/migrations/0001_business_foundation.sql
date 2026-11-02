-- Fiskalo initial business foundation.
-- Apply only to the dedicated Fiskalo Supabase project after reviewing the target project.
-- No ATK fiscalization endpoints or credentials are configured by this migration.

create extension if not exists pgcrypto;

create type public.organization_role as enum ('owner', 'administrator', 'accountant', 'cashier', 'manager');

create table public.organizations (
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
  municipality text,
  phone text,
  email text,
  fiscalization_status text not null default 'not_configured'
    check (fiscalization_status in ('not_configured', 'pending', 'test', 'certified', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_users (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role public.organization_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  address text,
  municipality text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index organization_users_user_id_idx on public.organization_users(user_id);
create index branches_organization_id_idx on public.branches(organization_id);

alter table public.organizations enable row level security;
alter table public.organization_users enable row level security;
alter table public.branches enable row level security;

-- Membership visibility is self-only, avoiding recursive membership policies.
create policy "users read their own memberships"
on public.organization_users for select to authenticated
using (user_id = (select auth.uid()));

create policy "members read organizations"
on public.organizations for select to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1 from public.organization_users ou
    where ou.organization_id = id and ou.user_id = (select auth.uid())
  )
);

create policy "authenticated users create organizations"
on public.organizations for insert to authenticated
with check (created_by = (select auth.uid()));

create policy "creator updates organization"
on public.organizations for update to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));

create policy "creator adds own owner membership"
on public.organization_users for insert to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'owner'
  and exists (
    select 1 from public.organizations o
    where o.id = organization_id and o.created_by = (select auth.uid())
  )
);

create policy "members read branches"
on public.branches for select to authenticated
using (
  exists (
    select 1 from public.organization_users ou
    where ou.organization_id = branches.organization_id and ou.user_id = (select auth.uid())
  )
);

create policy "owners and admins create branches"
on public.branches for insert to authenticated
with check (
  exists (
    select 1 from public.organization_users ou
    where ou.organization_id = branches.organization_id
      and ou.user_id = (select auth.uid())
      and ou.role in ('owner', 'administrator')
  )
);

create policy "owners and admins update branches"
on public.branches for update to authenticated
using (
  exists (
    select 1 from public.organization_users ou
    where ou.organization_id = branches.organization_id
      and ou.user_id = (select auth.uid())
      and ou.role in ('owner', 'administrator')
  )
)
with check (
  exists (
    select 1 from public.organization_users ou
    where ou.organization_id = branches.organization_id
      and ou.user_id = (select auth.uid())
      and ou.role in ('owner', 'administrator')
  )
);

grant select, insert, update on public.organizations to authenticated;
grant select, insert on public.organization_users to authenticated;
grant select, insert, update on public.branches to authenticated;
