-- Separate Fiskalo software-provider access from customer business memberships.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.fiskalo_provider_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('provider_admin','provider_support','provider_compliance')),
  created_at timestamptz not null default now()
);
alter table public.fiskalo_provider_users enable row level security;
revoke all on public.fiskalo_provider_users from public, anon, authenticated;
grant select on public.fiskalo_provider_users to authenticated;
drop policy if exists fiskalo_provider_users_self_read on public.fiskalo_provider_users;
create policy fiskalo_provider_users_self_read on public.fiskalo_provider_users
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function private.fiskalo_is_provider_user(allowed_roles text[] default array['provider_admin','provider_support','provider_compliance']::text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.fiskalo_provider_users p
      where p.user_id = (select auth.uid())
        and p.role = any(allowed_roles)
    );
$$;
revoke all on function private.fiskalo_is_provider_user(text[]) from public, anon;
grant execute on function private.fiskalo_is_provider_user(text[]) to authenticated;

drop policy if exists fiskalo_org_provider_read on public.fiskalo_organizations;
create policy fiskalo_org_provider_read on public.fiskalo_organizations
  for select to authenticated
  using ((select private.fiskalo_is_provider_user(array['provider_admin','provider_support','provider_compliance']::text[])));

drop policy if exists fiskalo_atk_pos_provider_read on public.fiskalo_atk_pos_installations;
create policy fiskalo_atk_pos_provider_read on public.fiskalo_atk_pos_installations
  for select to authenticated
  using ((select private.fiskalo_is_provider_user(array['provider_admin','provider_support','provider_compliance']::text[])));

grant select, update on public.fiskalo_atk_provider_settings to authenticated;
drop policy if exists fiskalo_provider_settings_read on public.fiskalo_atk_provider_settings;
create policy fiskalo_provider_settings_read on public.fiskalo_atk_provider_settings
  for select to authenticated
  using ((select private.fiskalo_is_provider_user(array['provider_admin','provider_compliance']::text[])));
drop policy if exists fiskalo_provider_settings_update on public.fiskalo_atk_provider_settings;
create policy fiskalo_provider_settings_update on public.fiskalo_atk_provider_settings
  for update to authenticated
  using ((select private.fiskalo_is_provider_user(array['provider_admin']::text[])))
  with check ((select private.fiskalo_is_provider_user(array['provider_admin']::text[])));

insert into public.fiskalo_atk_provider_settings (singleton)
values (true)
on conflict (singleton) do nothing;

insert into public.fiskalo_provider_users (user_id, role)
select id, 'provider_admin'
from auth.users
where lower(email) = lower('fatmirsejdiu007@gmail.com')
on conflict (user_id) do update set role = excluded.role;
