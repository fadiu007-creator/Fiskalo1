alter table public.fiskalo_organizations
  add column if not exists arbk_source text,
  add column if not exists arbk_retrieved_at timestamptz,
  add column if not exists arbk_business_status text,
  add column if not exists arbk_registration_date date;

comment on column public.fiskalo_organizations.arbk_source is
  'Registry data provider/source label. This is not a government-issued verification status.';
comment on column public.fiskalo_organizations.arbk_retrieved_at is
  'Timestamp when registry data was retrieved during onboarding.';
comment on column public.fiskalo_organizations.arbk_business_status is
  'Business status as reported by the registry data provider.';
comment on column public.fiskalo_organizations.arbk_registration_date is
  'Business registration date as reported by the registry data provider.';

create or replace function public.fiskalo_create_organization(payload jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare new_org_id uuid;
declare registry_nui text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(payload->>'legal_name'), '') is null
    or nullif(trim(payload->>'nui'), '') is null
    or nullif(trim(payload->>'municipality'), '') is null then
    raise exception 'Business name, NUI and municipality are required';
  end if;

  registry_nui := nullif(trim(payload->>'arbk_verified_nui'), '');
  if registry_nui is not null and registry_nui <> trim(payload->>'nui') then
    raise exception 'Registry NUI does not match business NUI';
  end if;

  insert into public.fiskalo_organizations (
    created_by, legal_name, nui, municipality, address, phone, email, vat_registered,
    trade_name, fiscal_number, business_type, business_activity,
    arbk_source, arbk_retrieved_at, arbk_business_status, arbk_registration_date
  ) values (
    auth.uid(), trim(payload->>'legal_name'), trim(payload->>'nui'), trim(payload->>'municipality'),
    nullif(trim(payload->>'address'), ''), nullif(trim(payload->>'phone'), ''),
    nullif(trim(payload->>'email'), ''), coalesce((payload->>'vat_registered')::boolean, false),
    nullif(trim(payload->>'trade_name'), ''), nullif(trim(payload->>'fiscal_number'), ''),
    nullif(trim(payload->>'business_type'), ''), nullif(trim(payload->>'business_activity'), ''),
    case when registry_nui is not null then 'ARBK Atlas registry dataset' else null end,
    case when registry_nui is not null then nullif(payload->>'arbk_retrieved_at', '')::timestamptz else null end,
    case when registry_nui is not null then nullif(trim(payload->>'arbk_business_status'), '') else null end,
    case when registry_nui is not null then nullif(payload->>'arbk_registration_date', '')::date else null end
  ) returning id into new_org_id;

  insert into public.fiskalo_organization_users(organization_id, user_id, role)
  values (new_org_id, auth.uid(), 'owner');

  insert into public.fiskalo_branches(organization_id, name, address, municipality, phone)
  values (new_org_id, 'Lokacioni kryesor', nullif(trim(payload->>'address'), ''), trim(payload->>'municipality'), nullif(trim(payload->>'phone'), ''));

  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (
    new_org_id, auth.uid(), 'organization.created', 'organization', new_org_id,
    jsonb_build_object('registry_source', case when registry_nui is not null then 'ARBK Atlas registry dataset' else null end,
      'registry_retrieved_at', nullif(payload->>'arbk_retrieved_at', ''))
  );
  return new_org_id;
end;
$$;
revoke all on function public.fiskalo_create_organization(jsonb) from public;
grant execute on function public.fiskalo_create_organization(jsonb) to authenticated;
