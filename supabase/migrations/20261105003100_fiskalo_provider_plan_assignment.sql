-- Allow provider administrators to assign product packages through a narrowly scoped RPC.
-- Business users cannot call this successfully and cannot self-upgrade.
create or replace function public.fiskalo_provider_set_plan(target_organization uuid, target_package text)
returns table(plan_package text, product_limit integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.fiskalo_is_provider_user(array['provider_admin']::text[]) then
    raise exception 'Only a Fiskalo provider administrator can assign packages'
      using errcode = '42501';
  end if;

  if target_package not in ('starter', 'standard', 'pro') then
    raise exception 'Unsupported package';
  end if;

  return query
    update public.fiskalo_organizations o
       set plan_package = target_package
     where o.id = target_organization
     returning o.plan_package, o.product_limit;

  if not found then
    raise exception 'Business not found';
  end if;
end;
$$;

revoke all on function public.fiskalo_provider_set_plan(uuid, text) from public, anon;
grant execute on function public.fiskalo_provider_set_plan(uuid, text) to authenticated;
