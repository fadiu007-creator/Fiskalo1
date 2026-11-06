drop policy if exists fiskalo_atk_docs_insert_test on public.fiskalo_atk_fiscal_documents;
create policy fiskalo_atk_docs_insert_test
on public.fiskalo_atk_fiscal_documents
for insert to authenticated
with check (
  public.fiskalo_has_role(
    organization_id,
    array['owner','administrator','manager','accountant','cashier']::public.fiskalo_organization_role[]
  )
  and exists (
    select 1 from public.fiskalo_atk_pos_installations p
    where p.id = pos_installation_id
      and p.organization_id = fiskalo_atk_fiscal_documents.organization_id
      and p.environment = 'test'
  )
);

drop policy if exists fiskalo_atk_docs_update_test on public.fiskalo_atk_fiscal_documents;
create policy fiskalo_atk_docs_update_test
on public.fiskalo_atk_fiscal_documents
for update to authenticated
using (
  public.fiskalo_has_role(
    organization_id,
    array['owner','administrator','manager','accountant','cashier']::public.fiskalo_organization_role[]
  )
  and exists (
    select 1 from public.fiskalo_atk_pos_installations p
    where p.id = pos_installation_id
      and p.organization_id = fiskalo_atk_fiscal_documents.organization_id
      and p.environment = 'test'
  )
)
with check (
  public.fiskalo_has_role(
    organization_id,
    array['owner','administrator','manager','accountant','cashier']::public.fiskalo_organization_role[]
  )
  and exists (
    select 1 from public.fiskalo_atk_pos_installations p
    where p.id = pos_installation_id
      and p.organization_id = fiskalo_atk_fiscal_documents.organization_id
      and p.environment = 'test'
  )
);

drop policy if exists fiskalo_atk_events_insert_test on public.fiskalo_atk_fiscal_events;
create policy fiskalo_atk_events_insert_test
on public.fiskalo_atk_fiscal_events
for insert to authenticated
with check (
  exists (
    select 1
    from public.fiskalo_atk_fiscal_documents d
    join public.fiskalo_atk_pos_installations p
      on p.id = d.pos_installation_id
     and p.organization_id = d.organization_id
    where d.id = fiscal_document_id
      and d.organization_id = fiskalo_atk_fiscal_events.organization_id
      and p.environment = 'test'
      and public.fiskalo_has_role(
        d.organization_id,
        array['owner','administrator','manager','accountant','cashier']::public.fiskalo_organization_role[]
      )
  )
);
