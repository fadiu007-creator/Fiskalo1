-- Allow normal POS operators to submit a paid sale from an already verified TEST POS.
-- Onboarding and certificate administration remain owner/administrator-only.
drop policy if exists fiskalo_atk_docs_insert_test on public.fiskalo_atk_fiscal_documents;
create policy fiskalo_atk_docs_insert_test on public.fiskalo_atk_fiscal_documents
  for insert to authenticated with check (
    public.fiskalo_has_role(organization_id, array['owner','administrator','manager','cashier']::public.fiskalo_organization_role[])
    and exists (
      select 1 from public.fiskalo_atk_pos_installations p
      where p.id = pos_installation_id and p.organization_id = fiskalo_atk_fiscal_documents.organization_id
        and p.environment = 'test'
    )
  );

drop policy if exists fiskalo_atk_docs_update_test on public.fiskalo_atk_fiscal_documents;
create policy fiskalo_atk_docs_update_test on public.fiskalo_atk_fiscal_documents
  for update to authenticated
  using (
    public.fiskalo_has_role(organization_id, array['owner','administrator','manager','cashier']::public.fiskalo_organization_role[])
    and exists (
      select 1 from public.fiskalo_atk_pos_installations p
      where p.id = pos_installation_id and p.organization_id = fiskalo_atk_fiscal_documents.organization_id
        and p.environment = 'test'
    )
  )
  with check (
    public.fiskalo_has_role(organization_id, array['owner','administrator','manager','cashier']::public.fiskalo_organization_role[])
    and exists (
      select 1 from public.fiskalo_atk_pos_installations p
      where p.id = pos_installation_id and p.organization_id = fiskalo_atk_fiscal_documents.organization_id
        and p.environment = 'test'
    )
  );

drop policy if exists fiskalo_atk_events_insert_test on public.fiskalo_atk_fiscal_events;
create policy fiskalo_atk_events_insert_test on public.fiskalo_atk_fiscal_events
  for insert to authenticated with check (
    exists (
      select 1 from public.fiskalo_atk_fiscal_documents d
      where d.id = fiscal_document_id
        and d.organization_id = fiskalo_atk_fiscal_events.organization_id
        and exists (
          select 1 from public.fiskalo_atk_pos_installations p
          where p.id = d.pos_installation_id and p.organization_id = d.organization_id and p.environment = 'test'
        )
        and public.fiskalo_has_role(d.organization_id, array['owner','administrator','manager','cashier']::public.fiskalo_organization_role[])
    )
  );

create or replace function public.fiskalo_next_atk_coupon_id()
returns bigint language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.fiskalo_organization_users
    where user_id = auth.uid() and role in ('owner','administrator','manager','cashier')
  ) then raise exception 'POS operator access required'; end if;
  return nextval('public.fiskalo_atk_coupon_id_seq');
end;
$$;
revoke all on function public.fiskalo_next_atk_coupon_id() from public, anon;
grant execute on function public.fiskalo_next_atk_coupon_id() to authenticated;
