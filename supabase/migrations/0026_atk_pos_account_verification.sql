-- Persist ATK TEST verification per POS installation, not in browser storage.
create table if not exists public.fiskalo_atk_pos_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete cascade,
  pos_installation_id uuid not null references public.fiskalo_atk_pos_installations(id) on delete cascade,
  business_name text not null default '',
  nui text not null check (nui ~ '^[0-9]{9}$'),
  atk_branch_id bigint not null check (atk_branch_id > 0),
  pos_id bigint not null check (pos_id > 0),
  application_id bigint not null check (application_id > 0),
  verification_code text not null,
  verified_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  unique (pos_installation_id)
);
alter table public.fiskalo_atk_pos_verifications
  add column if not exists business_name text not null default '';
alter table public.fiskalo_atk_pos_verifications enable row level security;
grant select, insert, update, delete on public.fiskalo_atk_pos_verifications to authenticated;
drop policy if exists fiskalo_atk_pos_verifications_select on public.fiskalo_atk_pos_verifications;
create policy fiskalo_atk_pos_verifications_select on public.fiskalo_atk_pos_verifications
  for select to authenticated using (fiskalo_has_role(organization_id, array['owner'::fiskalo_organization_role, 'administrator'::fiskalo_organization_role]));
drop policy if exists fiskalo_atk_pos_verifications_insert on public.fiskalo_atk_pos_verifications;
create policy fiskalo_atk_pos_verifications_insert on public.fiskalo_atk_pos_verifications
  for insert to authenticated with check (created_by = auth.uid() and fiskalo_has_role(organization_id, array['owner'::fiskalo_organization_role, 'administrator'::fiskalo_organization_role]));
drop policy if exists fiskalo_atk_pos_verifications_update on public.fiskalo_atk_pos_verifications;
create policy fiskalo_atk_pos_verifications_update on public.fiskalo_atk_pos_verifications
  for update to authenticated using (fiskalo_has_role(organization_id, array['owner'::fiskalo_organization_role, 'administrator'::fiskalo_organization_role]))
  with check (created_by = auth.uid() and fiskalo_has_role(organization_id, array['owner'::fiskalo_organization_role, 'administrator'::fiskalo_organization_role]));
drop policy if exists fiskalo_atk_pos_verifications_delete on public.fiskalo_atk_pos_verifications;
create policy fiskalo_atk_pos_verifications_delete on public.fiskalo_atk_pos_verifications
  for delete to authenticated using (fiskalo_has_role(organization_id, array['owner'::fiskalo_organization_role, 'administrator'::fiskalo_organization_role]));
