-- ATK TEST coupon submission ledger permissions.
-- All objects are Fiskalo-prefixed; production remains disabled.
create unique index if not exists fiskalo_atk_one_sale_per_invoice
  on public.fiskalo_atk_fiscal_documents(organization_id, source_invoice_id)
  where document_type = 'sale' and source_invoice_id is not null;

create policy fiskalo_atk_docs_insert_test on public.fiskalo_atk_fiscal_documents
  for insert to authenticated with check (
    public.fiskalo_has_role(organization_id, array['owner','administrator']::public.fiskalo_organization_role[])
    and exists (
      select 1 from public.fiskalo_atk_pos_installations p
      where p.id = pos_installation_id and p.organization_id = fiskalo_atk_fiscal_documents.organization_id
        and p.environment = 'test'
    )
  );

-- The API still performs owner/admin membership and POS-installation checks before writes.
-- Restrict direct client access to the new write operations; existing SELECT policy remains.
grant insert on public.fiskalo_atk_fiscal_documents to authenticated;

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
        and public.fiskalo_has_role(d.organization_id, array['owner','administrator']::public.fiskalo_organization_role[])
    )
  );
grant insert on public.fiskalo_atk_fiscal_events to authenticated;

-- Keep fiscal document state changes server-side through the authenticated API's
-- user-scoped client; only TEST documents can be updated by an owner/administrator.
create policy fiskalo_atk_docs_update_test on public.fiskalo_atk_fiscal_documents
  for update to authenticated
  using (
    public.fiskalo_has_role(organization_id, array['owner','administrator']::public.fiskalo_organization_role[])
    and exists (
      select 1 from public.fiskalo_atk_pos_installations p
      where p.id = pos_installation_id and p.organization_id = fiskalo_atk_fiscal_documents.organization_id
        and p.environment = 'test'
    )
  )
  with check (
    public.fiskalo_has_role(organization_id, array['owner','administrator']::public.fiskalo_organization_role[])
    and exists (
      select 1 from public.fiskalo_atk_pos_installations p
      where p.id = pos_installation_id and p.organization_id = fiskalo_atk_fiscal_documents.organization_id
        and p.environment = 'test'
    )
  );
grant update on public.fiskalo_atk_fiscal_documents to authenticated;

create sequence if not exists public.fiskalo_atk_coupon_id_seq;
revoke all on sequence public.fiskalo_atk_coupon_id_seq from public, anon;
grant usage, select on sequence public.fiskalo_atk_coupon_id_seq to authenticated;

create or replace function public.fiskalo_next_atk_coupon_id()
returns bigint language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.fiskalo_organization_users
    where user_id = auth.uid() and role in ('owner','administrator')
  ) then raise exception 'Owner or administrator access required'; end if;
  return nextval('public.fiskalo_atk_coupon_id_seq');
end;
$$;
revoke all on function public.fiskalo_next_atk_coupon_id() from public, anon;
grant execute on function public.fiskalo_next_atk_coupon_id() to authenticated;
