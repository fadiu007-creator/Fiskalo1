-- Product catalogue limits are enforced in the database, not only in the browser.
-- Provider administrators assign packages; business users cannot upgrade themselves.
alter table public.fiskalo_organizations
  add column if not exists plan_package text not null default 'starter'
    check (plan_package in ('starter', 'standard', 'pro'));

alter table public.fiskalo_organizations
  add column if not exists product_limit integer
    generated always as (
      case plan_package
        when 'starter' then 10
        when 'standard' then 50
        when 'pro' then 100
        else 10
      end
    ) stored;

comment on column public.fiskalo_organizations.plan_package is
  'Fiskalo product package: starter=10, standard=50, pro=100. Assigned by Fiskalo provider administrators.';
comment on column public.fiskalo_organizations.product_limit is
  'Generated maximum number of product catalogue rows for the assigned package.';

create or replace function public.fiskalo_protect_plan_package()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.plan_package is distinct from old.plan_package
     and not private.fiskalo_is_provider_user(array['provider_admin']::text[]) then
    raise exception 'Only a Fiskalo provider administrator can change the subscription package';
  end if;
  return new;
end;
$$;

revoke all on function public.fiskalo_protect_plan_package() from public, anon, authenticated;

drop trigger if exists fiskalo_organizations_protect_plan on public.fiskalo_organizations;
create trigger fiskalo_organizations_protect_plan
before update of plan_package on public.fiskalo_organizations
for each row execute function public.fiskalo_protect_plan_package();

create or replace function public.fiskalo_enforce_product_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allowed_count integer;
  current_count integer;
  package_name text;
begin
  if tg_op = 'UPDATE' and new.organization_id = old.organization_id then
    return new;
  end if;

  -- Serialize concurrent product inserts for the same business to prevent limit races.
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 0));

  select o.product_limit, o.plan_package
    into allowed_count, package_name
  from public.fiskalo_organizations o
  where o.id = new.organization_id;

  if not found then
    raise exception 'Business not found';
  end if;

  select count(*)::integer into current_count
  from public.fiskalo_products p
  where p.organization_id = new.organization_id;

  if current_count >= allowed_count then
    raise exception 'PRODUCT_LIMIT_REACHED: Paketa % lejon maksimum % produkte. Përmirëso paketën për të vazhduar.',
      package_name, allowed_count
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.fiskalo_enforce_product_plan_limit() from public, anon, authenticated;

drop trigger if exists fiskalo_products_enforce_plan_limit on public.fiskalo_products;
create trigger fiskalo_products_enforce_plan_limit
before insert or update of organization_id on public.fiskalo_products
for each row execute function public.fiskalo_enforce_product_plan_limit();
