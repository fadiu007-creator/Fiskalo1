-- Pending team invitations. Invitees are attached automatically after first login.
create table if not exists public.fiskalo_team_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete cascade,
  email text not null,
  role public.fiskalo_organization_role not null check (role <> 'owner'),
  invited_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);
create index if not exists fiskalo_team_invitations_email_idx on public.fiskalo_team_invitations(lower(email));
alter table public.fiskalo_team_invitations enable row level security;
revoke all on public.fiskalo_team_invitations from anon, authenticated;
drop function if exists public.fiskalo_add_existing_member(uuid,text,public.fiskalo_organization_role);

create function public.fiskalo_add_existing_member(target_org uuid, target_email text, target_role public.fiskalo_organization_role)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare target_user uuid;
declare normalized_email text := lower(trim(target_email));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fiskalo_has_role(target_org, array['owner','administrator']::public.fiskalo_organization_role[]) then
    raise exception 'Only owners and administrators can manage team members';
  end if;
  if target_role = 'owner' then raise exception 'Owner role cannot be assigned through invitations'; end if;
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address';
  end if;
  select id into target_user from auth.users where lower(email) = normalized_email limit 1;
  if target_user is not null then
    insert into public.fiskalo_organization_users(organization_id, user_id, role)
    values (target_org, target_user, target_role)
    on conflict (organization_id, user_id) do update set role = excluded.role;
    delete from public.fiskalo_team_invitations where organization_id = target_org and lower(email) = normalized_email;
    insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
    values (target_org, auth.uid(), 'member.added_or_updated', 'organization_user', target_user,
      jsonb_build_object('email', normalized_email, 'role', target_role));
    return jsonb_build_object('status','added','email',normalized_email);
  end if;
  insert into public.fiskalo_team_invitations(organization_id,email,role,invited_by)
  values (target_org,normalized_email,target_role,auth.uid())
  on conflict (organization_id,email) do update
    set role = excluded.role, invited_by = excluded.invited_by, created_at = now();
  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (target_org, auth.uid(), 'member.invited', 'team_invitation', null,
    jsonb_build_object('email', normalized_email, 'role', target_role));
  return jsonb_build_object('status','invited','email',normalized_email);
end;
$$;
revoke all on function public.fiskalo_add_existing_member(uuid,text,public.fiskalo_organization_role) from public;
grant execute on function public.fiskalo_add_existing_member(uuid,text,public.fiskalo_organization_role) to authenticated;

create or replace function public.fiskalo_list_pending_team_invitations(target_org uuid)
returns table(invitation_id uuid, invite_email text, invite_role public.fiskalo_organization_role, invited_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.fiskalo_has_role(target_org,array['owner','administrator']::public.fiskalo_organization_role[]) then
    raise exception 'Only owners and administrators can view invitations';
  end if;
  return query select i.id,i.email,i.role,i.created_at
  from public.fiskalo_team_invitations i where i.organization_id=target_org order by i.created_at desc;
end;
$$;
revoke all on function public.fiskalo_list_pending_team_invitations(uuid) from public;
grant execute on function public.fiskalo_list_pending_team_invitations(uuid) to authenticated;

create or replace function public.fiskalo_accept_pending_team_invitations()
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare current_user_id uuid := auth.uid();
declare current_email text;
declare accepted_count integer := 0;
declare invitation record;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  select lower(email) into current_email from auth.users where id=current_user_id;
  if current_email is null then return 0; end if;
  for invitation in
    select * from public.fiskalo_team_invitations where lower(email)=current_email
    order by created_at for update
  loop
    insert into public.fiskalo_organization_users(organization_id,user_id,role)
    values(invitation.organization_id,current_user_id,invitation.role)
    on conflict(organization_id,user_id) do update set role=excluded.role;
    insert into public.fiskalo_audit_logs(organization_id,actor_id,action,entity_type,entity_id,details)
    values(invitation.organization_id,current_user_id,'member.invitation_accepted','organization_user',current_user_id,
      jsonb_build_object('email',current_email,'role',invitation.role));
    delete from public.fiskalo_team_invitations where id=invitation.id;
    accepted_count := accepted_count + 1;
  end loop;
  return accepted_count;
end;
$$;
revoke all on function public.fiskalo_accept_pending_team_invitations() from public;
grant execute on function public.fiskalo_accept_pending_team_invitations() to authenticated;
