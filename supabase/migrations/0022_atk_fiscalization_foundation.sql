-- ATK fiscalization foundation. All objects are Fiskalo-prefixed and isolated from other apps.
-- Private keys and short-lived ATK verification codes must remain on the local POS Agent.
create table public.fiskalo_atk_provider_settings (
  singleton boolean primary key default true check (singleton),
  provider_nui text,
  sef_code text,
  application_id bigint check (application_id is null or application_id > 0),
  solution_name text not null default 'Fiskalo',
  solution_version text not null default '0.1.0',
  certification_status text not null default 'not_applied'
    check (certification_status in ('not_applied','testing','submitted','certified','suspended')),
  production_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check (production_enabled = false or certification_status = 'certified')
);
alter table public.fiskalo_atk_provider_settings enable row level security;
revoke all on public.fiskalo_atk_provider_settings from anon, authenticated;

create table public.fiskalo_atk_taxpayer_profiles (
  organization_id uuid primary key references public.fiskalo_organizations(id) on delete restrict,
  fiscalization_number text not null check (length(trim(fiscalization_number)) between 1 and 100),
  business_name_from_atk text,
  last_verified_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.fiskalo_atk_taxpayer_profiles enable row level security;
create policy fiskalo_atk_taxpayer_select on public.fiskalo_atk_taxpayer_profiles
  for select to authenticated using (public.fiskalo_is_member(organization_id));
create policy fiskalo_atk_taxpayer_insert on public.fiskalo_atk_taxpayer_profiles
  for insert to authenticated with check (
    created_by = auth.uid() and public.fiskalo_has_role(organization_id,array['owner','administrator']::public.fiskalo_organization_role[])
  );
create policy fiskalo_atk_taxpayer_update on public.fiskalo_atk_taxpayer_profiles
  for update to authenticated using (
    public.fiskalo_has_role(organization_id,array['owner','administrator']::public.fiskalo_organization_role[])
  ) with check (
    public.fiskalo_has_role(organization_id,array['owner','administrator']::public.fiskalo_organization_role[])
  );
grant select,insert,update on public.fiskalo_atk_taxpayer_profiles to authenticated;
create trigger fiskalo_atk_taxpayer_touch before update on public.fiskalo_atk_taxpayer_profiles
  for each row execute function public.fiskalo_touch_updated_at();

create unique index if not exists fiskalo_branches_id_org_uq on public.fiskalo_branches(id, organization_id);
create unique index if not exists fiskalo_invoices_id_org_uq on public.fiskalo_invoices(id, organization_id);

create table public.fiskalo_atk_pos_installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  branch_id uuid,
  atk_branch_id bigint not null check (atk_branch_id > 0),
  pos_id bigint not null check (pos_id > 0),
  label text not null,
  location text,
  environment text not null default 'test' check (environment in ('test','production')),
  status text not null default 'unregistered'
    check (status in ('unregistered','verification_pending','certificate_pending','active','suspended','revoked')),
  certificate_serial text,
  certificate_expires_at timestamptz,
  agent_version text,
  last_seen_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, atk_branch_id, pos_id, environment),
  unique (id, organization_id),
  constraint fiskalo_atk_pos_branch_org_fk
    foreign key (branch_id, organization_id)
    references public.fiskalo_branches(id, organization_id) on delete restrict
);
create index fiskalo_atk_pos_org_idx on public.fiskalo_atk_pos_installations(organization_id, created_at desc);
alter table public.fiskalo_atk_pos_installations enable row level security;
create policy fiskalo_atk_pos_select on public.fiskalo_atk_pos_installations
  for select to authenticated using (public.fiskalo_is_member(organization_id));
create policy fiskalo_atk_pos_insert on public.fiskalo_atk_pos_installations
  for insert to authenticated with check (
    created_by = auth.uid()
    and environment = 'test'
    and status = 'unregistered'
    and public.fiskalo_has_role(organization_id,array['owner','administrator']::public.fiskalo_organization_role[])
  );
grant select,insert on public.fiskalo_atk_pos_installations to authenticated;

create table public.fiskalo_atk_fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  pos_installation_id uuid not null,
  source_invoice_id uuid,
  coupon_id bigint not null check (coupon_id > 0),
  reference_coupon_id bigint check (reference_coupon_id is null or reference_coupon_id > 0),
  document_type text not null check (document_type in ('sale','cancel','return')),
  status text not null default 'draft'
    check (status in ('draft','queued','offline_pending','submitted','accepted','rejected')),
  occurred_at timestamptz not null,
  total numeric(14,2) not null check (total >= 0),
  currency char(3) not null default 'EUR' check (currency = 'EUR'),
  citizen_coupon_base64 text,
  pos_coupon_base64 text,
  signature_base64 text,
  qr_payload text,
  payload_sha256 text check (payload_sha256 is null or payload_sha256 ~ '^[a-f0-9]{64}$'),
  idempotency_key uuid not null default gen_random_uuid(),
  atk_transaction_id bigint,
  atk_response jsonb,
  last_error text,
  submission_attempts integer not null default 0 check (submission_attempts >= 0),
  last_submitted_at timestamptz,
  accepted_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, coupon_id),
  unique (idempotency_key),
  foreign key (pos_installation_id, organization_id)
    references public.fiskalo_atk_pos_installations(id, organization_id) on delete restrict,
  constraint fiskalo_atk_docs_invoice_org_fk
    foreign key (source_invoice_id, organization_id)
    references public.fiskalo_invoices(id, organization_id) on delete restrict,
  check (
    (document_type = 'sale' and reference_coupon_id is null)
    or (document_type in ('cancel','return') and reference_coupon_id is not null)
  ),
  check (status <> 'accepted' or atk_transaction_id is not null),
  check (atk_transaction_id is null or atk_transaction_id > 0)
);
create index fiskalo_atk_docs_org_date_idx on public.fiskalo_atk_fiscal_documents(organization_id, occurred_at desc);
create index fiskalo_atk_docs_status_idx on public.fiskalo_atk_fiscal_documents(status, created_at);
alter table public.fiskalo_atk_fiscal_documents enable row level security;
create policy fiskalo_atk_docs_select on public.fiskalo_atk_fiscal_documents
  for select to authenticated using (public.fiskalo_is_member(organization_id));
grant select on public.fiskalo_atk_fiscal_documents to authenticated;
create trigger fiskalo_atk_docs_touch before update on public.fiskalo_atk_fiscal_documents
  for each row execute function public.fiskalo_touch_updated_at();

create table public.fiskalo_atk_fiscal_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  fiscal_document_id uuid not null references public.fiskalo_atk_fiscal_documents(id) on delete restrict,
  event_type text not null check (event_type in ('created','queued','offline_saved','submission_started','accepted','rejected','retry_scheduled','cancelled')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index fiskalo_atk_events_doc_idx on public.fiskalo_atk_fiscal_events(fiscal_document_id, created_at);
alter table public.fiskalo_atk_fiscal_events enable row level security;
create policy fiskalo_atk_events_select on public.fiskalo_atk_fiscal_events
  for select to authenticated using (public.fiskalo_is_member(organization_id));
grant select on public.fiskalo_atk_fiscal_events to authenticated;

create or replace function public.fiskalo_prevent_atk_event_mutation()
returns trigger language plpgsql set search_path = public, pg_temp
as $$ begin raise exception 'ATK fiscalization events are immutable'; end; $$;
create trigger fiskalo_atk_events_immutable before update or delete on public.fiskalo_atk_fiscal_events
  for each row execute function public.fiskalo_prevent_atk_event_mutation();
revoke all on function public.fiskalo_prevent_atk_event_mutation() from public, anon, authenticated;
