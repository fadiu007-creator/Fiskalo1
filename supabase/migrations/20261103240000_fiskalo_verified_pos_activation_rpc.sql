-- Allow verified staff to mark a TEST POS active without granting broad UPDATE access.
create or replace function public.fiskalo_activate_verified_test_pos(target_pos uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  pos_row public.fiskalo_atk_pos_installations%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into pos_row
  from public.fiskalo_atk_pos_installations
  where id = target_pos
  for update;
  if not found then raise exception 'POS installation not found'; end if;
  if pos_row.environment <> 'test' then raise exception 'Only a TEST POS can be activated through this workflow'; end if;
  if not public.fiskalo_has_role(pos_row.organization_id, array['owner','administrator','manager','cashier']::public.fiskalo_organization_role[]) then
    raise exception 'This account cannot activate the TEST POS';
  end if;
  if not exists (
    select 1 from public.fiskalo_atk_pos_verifications v
    where v.organization_id = pos_row.organization_id
      and v.pos_installation_id = pos_row.id
      and v.nui = (select o.nui from public.fiskalo_organizations o where o.id = pos_row.organization_id)
      and v.atk_branch_id = pos_row.atk_branch_id
      and v.pos_id = pos_row.pos_id
      and v.application_id > 0
      and nullif(v.verification_code,'') is not null
  ) then
    raise exception 'A matching saved ATK TEST verification is required before activation';
  end if;
  update public.fiskalo_atk_pos_installations
  set status = 'active'
  where id = pos_row.id;
  insert into public.fiskalo_audit_logs(organization_id,actor_id,action,entity_type,entity_id,details)
  values(pos_row.organization_id,auth.uid(),'atk_test_pos.activated','atk_pos_installation',pos_row.id,
    jsonb_build_object('environment','test','branch_id',pos_row.atk_branch_id,'pos_id',pos_row.pos_id));
end;
$function$;
revoke all on function public.fiskalo_activate_verified_test_pos(uuid) from public, anon;
grant execute on function public.fiskalo_activate_verified_test_pos(uuid) to authenticated;
