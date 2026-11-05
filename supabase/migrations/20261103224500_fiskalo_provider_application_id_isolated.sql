drop policy if exists fiskalo_provider_settings_read on public.fiskalo_atk_provider_settings;
create policy fiskalo_provider_settings_read on public.fiskalo_atk_provider_settings
for select to authenticated
using ((select private.fiskalo_is_provider_user(array['provider_admin','provider_compliance']::text[])));

create or replace function public.fiskalo_get_business_application_id(target_org uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare result_id bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fiskalo_has_role(target_org, array['owner','administrator']::public.fiskalo_organization_role[]) then
    raise exception 'Only the business owner or administrator can read the provider Application ID';
  end if;
  select application_id into result_id
  from public.fiskalo_atk_provider_settings
  where singleton = true;
  return result_id;
end;
$function$;

revoke all on function public.fiskalo_get_business_application_id(uuid) from public;
grant execute on function public.fiskalo_get_business_application_id(uuid) to authenticated;