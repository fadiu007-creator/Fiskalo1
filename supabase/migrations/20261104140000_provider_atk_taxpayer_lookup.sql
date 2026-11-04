-- Provider-only manual capture of results from ATK's public taxpayer search.
-- ATK currently documents a public web form, not a supported third-party lookup API.
create table if not exists public.fiskalo_provider_atk_lookups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.fiskalo_organizations(id) on delete set null,
  lookup_type text not null check (lookup_type in ('fiscal_number','nrb','vat_number')),
  lookup_value text not null,
  fiscal_number text,
  nrb text,
  taxpayer_name text,
  registration_status text,
  address text,
  city text,
  municipality text,
  tax_center text,
  vat_number text,
  vat_status text,
  notes text,
  source_url text not null default 'https://apps.atk-ks.org/BizPasiveApp/VatRegist/Index',
  checked_at timestamptz not null default now(),
  checked_by uuid not null references auth.users(id)
);

create index if not exists fiskalo_provider_atk_lookups_checked_at_idx
  on public.fiskalo_provider_atk_lookups (checked_at desc);
create index if not exists fiskalo_provider_atk_lookups_org_idx
  on public.fiskalo_provider_atk_lookups (organization_id);

alter table public.fiskalo_provider_atk_lookups enable row level security;
revoke all on public.fiskalo_provider_atk_lookups from public, anon, authenticated;
grant select, insert, update, delete on public.fiskalo_provider_atk_lookups to authenticated;

drop policy if exists fiskalo_provider_atk_lookup_read on public.fiskalo_provider_atk_lookups;
create policy fiskalo_provider_atk_lookup_read on public.fiskalo_provider_atk_lookups
  for select to authenticated
  using ((select private.fiskalo_is_provider_user(array['provider_admin','provider_support','provider_compliance']::text[])));

drop policy if exists fiskalo_provider_atk_lookup_insert on public.fiskalo_provider_atk_lookups;
create policy fiskalo_provider_atk_lookup_insert on public.fiskalo_provider_atk_lookups
  for insert to authenticated
  with check (
    checked_by = (select auth.uid())
    and (select private.fiskalo_is_provider_user(array['provider_admin','provider_support','provider_compliance']::text[]))
  );

drop policy if exists fiskalo_provider_atk_lookup_update on public.fiskalo_provider_atk_lookups;
create policy fiskalo_provider_atk_lookup_update on public.fiskalo_provider_atk_lookups
  for update to authenticated
  using ((select private.fiskalo_is_provider_user(array['provider_admin']::text[])))
  with check ((select private.fiskalo_is_provider_user(array['provider_admin']::text[])));

drop policy if exists fiskalo_provider_atk_lookup_delete on public.fiskalo_provider_atk_lookups;
create policy fiskalo_provider_atk_lookup_delete on public.fiskalo_provider_atk_lookups
  for delete to authenticated
  using ((select private.fiskalo_is_provider_user(array['provider_admin']::text[])));

-- Remove the obsolete Atlas-specific organization metadata and ensure onboarding
-- no longer accepts or records third-party registry assertions.
alter table public.fiskalo_organizations
  drop column if exists arbk_source,
  drop column if exists arbk_retrieved_at,
  drop column if exists arbk_business_status,
  drop column if exists arbk_registration_date;

create or replace function public.fiskalo_create_organization(payload jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare new_org_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(payload->>'legal_name'), '') is null
    or nullif(trim(payload->>'nui'), '') is null
    or nullif(trim(payload->>'municipality'), '') is null then
    raise exception 'Business name, NUI and municipality are required';
  end if;

  insert into public.fiskalo_organizations (
    created_by, legal_name, nui, municipality, address, phone, email, vat_registered,
    trade_name, fiscal_number, business_type, business_activity
  ) values (
    auth.uid(), trim(payload->>'legal_name'), trim(payload->>'nui'), trim(payload->>'municipality'),
    nullif(trim(payload->>'address'), ''), nullif(trim(payload->>'phone'), ''),
    nullif(trim(payload->>'email'), ''), coalesce((payload->>'vat_registered')::boolean, false),
    nullif(trim(payload->>'trade_name'), ''), nullif(trim(payload->>'fiscal_number'), ''),
    nullif(trim(payload->>'business_type'), ''), nullif(trim(payload->>'business_activity'), '')
  ) returning id into new_org_id;

  insert into public.fiskalo_organization_users(organization_id, user_id, role)
  values (new_org_id, auth.uid(), 'owner');

  insert into public.fiskalo_branches(organization_id, name, address, municipality, phone)
  values (new_org_id, 'Lokacioni kryesor', nullif(trim(payload->>'address'), ''), trim(payload->>'municipality'), nullif(trim(payload->>'phone'), ''));

  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id)
  values (new_org_id, auth.uid(), 'organization.created', 'organization', new_org_id);
  return new_org_id;
end;
$$;
revoke all on function public.fiskalo_create_organization(jsonb) from public;
grant execute on function public.fiskalo_create_organization(jsonb) to authenticated;
