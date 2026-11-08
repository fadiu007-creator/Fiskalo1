-- Cover Fiskalo foreign-key lookups for immutable reports and adjustment line ledger.
create index if not exists fiskalo_cashier_shift_reports_generated_by_idx
  on public.fiskalo_cashier_shift_reports(generated_by);
create index if not exists fiskalo_adjustment_items_adjustment_org_idx
  on public.fiskalo_invoice_adjustment_items(adjustment_id, organization_id);
create index if not exists fiskalo_adjustment_items_org_idx
  on public.fiskalo_invoice_adjustment_items(organization_id);
create index if not exists fiskalo_invoice_adjustments_created_by_idx
  on public.fiskalo_invoice_adjustments(created_by);
