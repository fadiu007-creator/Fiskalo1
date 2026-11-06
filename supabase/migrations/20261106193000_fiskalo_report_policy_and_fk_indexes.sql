-- Optimize role-scoped Z report RLS and cover remaining Fiskalo FK lookups.
drop policy if exists fiskalo_cashier_shift_reports_select on public.fiskalo_cashier_shift_reports;
create policy fiskalo_cashier_shift_reports_select on public.fiskalo_cashier_shift_reports
  for select to authenticated
  using (
    public.fiskalo_has_role(
      organization_id,
      array['owner','administrator','manager','accountant']::public.fiskalo_organization_role[]
    )
    or exists (
      select 1
      from public.fiskalo_cashier_shifts s
      where s.id = cashier_shift_id
        and s.organization_id = fiskalo_cashier_shift_reports.organization_id
        and s.opened_by = (select auth.uid())
    )
  );

create index if not exists fiskalo_invoice_adjustments_fiscal_doc_org_idx
  on public.fiskalo_invoice_adjustments(original_fiscal_document_id, organization_id);
create index if not exists fiskalo_invoice_adjustments_invoice_org_idx
  on public.fiskalo_invoice_adjustments(original_invoice_id, organization_id);
create index if not exists fiskalo_provider_atk_lookups_checked_by_idx
  on public.fiskalo_provider_atk_lookups(checked_by);
