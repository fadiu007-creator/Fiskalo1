-- Cashiers may read only their own immutable Z snapshots.
-- Managers, owners, administrators and accountants can read organization-wide reports.
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
        and s.opened_by = auth.uid()
    )
  );
