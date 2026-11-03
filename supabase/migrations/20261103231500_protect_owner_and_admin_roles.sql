create or replace function public.fiskalo_add_existing_member(
  target_org uuid,
  target_email text,
  target_role public.fiskalo_organization_role
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  target_user uuid;
  existing_role public.fiskalo_organization_role;
  normalized_email text := lower(trim(target_email));
  is_owner boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fiskalo_has_role(target_org, array['owner','administrator']::public.fiskalo_organization_role[]) then
    raise exception 'Only owners and administrators can manage team members';
  end if;
  is_owner := public.fiskalo_has_role(target_org, array['owner']::public.fiskalo_organization_role[]);
  if target_role is null or target_role not in ('administrator','manager','accountant','cashier') then
    raise exception 'Choose a valid business role';
  end if;
  if target_role = 'administrator' and not is_owner then
    raise exception 'Only the business owner can assign the administrator role';
  end if;
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Enter a valid email address';
  end if;

  select id into target_user from auth.users where lower(email) = normalized_email limit 1;
  if target_user is not null then
    select role into existing_role from public.fiskalo_organization_users
    where organization_id = target_org and user_id = target_user;
    if existing_role = 'owner' then
      raise exception 'The business owner role cannot be changed here';
    end if;
    if existing_role = 'administrator' and not is_owner and target_role <> 'administrator' then
      raise exception 'Only the business owner can change an administrator role';
    end if;

    insert into public.fiskalo_organization_users(organization_id,user_id,role)
    values (target_org,target_user,target_role)
    on conflict (organization_id,user_id) do update set role = excluded.role;
    delete from public.fiskalo_team_invitations where organization_id = target_org and lower(email) = normalized_email;
    insert into public.fiskalo_audit_logs(organization_id,actor_id,action,entity_type,entity_id,details)
    values (target_org,auth.uid(),'member.added_or_updated','organization_user',target_user,
      jsonb_build_object('email',normalized_email,'role',target_role));
    return jsonb_build_object('status','added','email',normalized_email,'role',target_role);
  end if;

  insert into public.fiskalo_team_invitations(organization_id,email,role,invited_by)
  values (target_org,normalized_email,target_role,auth.uid())
  on conflict (organization_id,email) do update
    set role = excluded.role, invited_by = excluded.invited_by, created_at = now();
  insert into public.fiskalo_audit_logs(organization_id,actor_id,action,entity_type,entity_id,details)
  values (target_org,auth.uid(),'member.invited','team_invitation',null,
    jsonb_build_object('email',normalized_email,'role',target_role));
  return jsonb_build_object('status','invited','email',normalized_email,'role',target_role);
end;
$function$;
revoke all on function public.fiskalo_add_existing_member(uuid,text,public.fiskalo_organization_role) from public, anon;
grant execute on function public.fiskalo_add_existing_member(uuid,text,public.fiskalo_organization_role) to authenticated;
