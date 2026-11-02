create or replace function public.fiskalo_list_members(target_org uuid)
returns table(member_user_id uuid, member_email text, member_role public.fiskalo_organization_role, joined_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.fiskalo_has_role(target_org, array['owner','administrator']::public.fiskalo_organization_role[]) then
    raise exception 'Only owners and administrators can view team members';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.created_at
    from public.fiskalo_organization_users m
    join auth.users u on u.id = m.user_id
    where m.organization_id = target_org
    order by case m.role when 'owner' then 1 when 'administrator' then 2 else 3 end, u.email;
end;
$$;
revoke all on function public.fiskalo_list_members(uuid) from public;
grant execute on function public.fiskalo_list_members(uuid) to authenticated;

create or replace function public.fiskalo_add_existing_member(target_org uuid, target_email text, target_role public.fiskalo_organization_role)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare target_user uuid;
begin
  if not public.fiskalo_has_role(target_org, array['owner','administrator']::public.fiskalo_organization_role[]) then
    raise exception 'Only owners and administrators can manage team members';
  end if;
  if target_role = 'owner' then raise exception 'Owner role cannot be assigned through invitations'; end if;
  select id into target_user from auth.users where lower(email) = lower(trim(target_email)) limit 1;
  if target_user is null then raise exception 'No account found for this email. Ask the person to register first.'; end if;
  insert into public.fiskalo_organization_users(organization_id, user_id, role)
  values (target_org, target_user, target_role)
  on conflict (organization_id, user_id) do update set role = excluded.role;
  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (target_org, auth.uid(), 'member.added_or_updated', 'organization_user', target_user, jsonb_build_object('email', lower(trim(target_email)), 'role', target_role));
  return target_user;
end;
$$;
revoke all on function public.fiskalo_add_existing_member(uuid, text, public.fiskalo_organization_role) from public;
grant execute on function public.fiskalo_add_existing_member(uuid, text, public.fiskalo_organization_role) to authenticated;

create or replace function public.fiskalo_remove_member(target_org uuid, target_user uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.fiskalo_has_role(target_org, array['owner','administrator']::public.fiskalo_organization_role[]) then
    raise exception 'Only owners and administrators can manage team members';
  end if;
  if target_user = auth.uid() then raise exception 'You cannot remove your own access'; end if;
  if exists (select 1 from public.fiskalo_organization_users where organization_id = target_org and user_id = target_user and role = 'owner') then
    raise exception 'The owner cannot be removed';
  end if;
  delete from public.fiskalo_organization_users where organization_id = target_org and user_id = target_user;
  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'member.removed', 'organization_user', target_user);
end;
$$;
revoke all on function public.fiskalo_remove_member(uuid, uuid) from public;
grant execute on function public.fiskalo_remove_member(uuid, uuid) to authenticated;
