-- Add indexes for Fiskalo foreign keys to keep tenant joins, deletes and audit lookups efficient.
create index if not exists fiskalo_atk_docs_invoice_org_fk_idx on public.fiskalo_atk_fiscal_documents(source_invoice_id,organization_id);
create index if not exists fiskalo_atk_docs_created_by_fk_idx on public.fiskalo_atk_fiscal_documents(created_by);
create index if not exists fiskalo_atk_docs_pos_org_fk_idx on public.fiskalo_atk_fiscal_documents(pos_installation_id,organization_id);
create index if not exists fiskalo_atk_events_doc_org_fk_idx on public.fiskalo_atk_fiscal_events(fiscal_document_id,organization_id);
create index if not exists fiskalo_atk_events_org_fk_idx on public.fiskalo_atk_fiscal_events(organization_id);
create index if not exists fiskalo_atk_pos_branch_org_fk_idx on public.fiskalo_atk_pos_installations(branch_id,organization_id);
create index if not exists fiskalo_atk_pos_created_by_fk_idx on public.fiskalo_atk_pos_installations(created_by);
create index if not exists fiskalo_atk_verifications_created_by_fk_idx on public.fiskalo_atk_pos_verifications(created_by);
create index if not exists fiskalo_atk_verifications_org_fk_idx on public.fiskalo_atk_pos_verifications(organization_id);
create index if not exists fiskalo_atk_taxpayer_created_by_fk_idx on public.fiskalo_atk_taxpayer_profiles(created_by);
create index if not exists fiskalo_audit_actor_fk_idx on public.fiskalo_audit_logs(actor_id);
create index if not exists fiskalo_audit_org_fk_idx on public.fiskalo_audit_logs(organization_id);
create index if not exists fiskalo_branches_org_fk_idx on public.fiskalo_branches(organization_id);
create index if not exists fiskalo_cash_movements_created_by_fk_idx on public.fiskalo_cash_movements(created_by);
create index if not exists fiskalo_cash_movements_org_fk_idx on public.fiskalo_cash_movements(organization_id);
create index if not exists fiskalo_cashier_shifts_closed_by_fk_idx on public.fiskalo_cashier_shifts(closed_by);
create index if not exists fiskalo_cashier_shifts_opened_by_fk_idx on public.fiskalo_cashier_shifts(opened_by);
create index if not exists fiskalo_expenses_branch_fk_idx on public.fiskalo_expenses(branch_id);
create index if not exists fiskalo_expenses_created_by_fk_idx on public.fiskalo_expenses(created_by);
create index if not exists fiskalo_inventory_movements_created_by_fk_idx on public.fiskalo_inventory_movements(created_by);
create index if not exists fiskalo_inventory_movements_org_fk_idx on public.fiskalo_inventory_movements(organization_id);
create index if not exists fiskalo_invoice_items_invoice_fk_idx on public.fiskalo_invoice_items(invoice_id);
create index if not exists fiskalo_invoice_items_product_fk_idx on public.fiskalo_invoice_items(product_id);
create index if not exists fiskalo_invoice_payments_created_by_fk_idx on public.fiskalo_invoice_payments(created_by);
create index if not exists fiskalo_invoice_payments_org_fk_idx on public.fiskalo_invoice_payments(organization_id);
create index if not exists fiskalo_invoices_branch_fk_idx on public.fiskalo_invoices(branch_id);
create index if not exists fiskalo_invoices_created_by_fk_idx on public.fiskalo_invoices(created_by);
create index if not exists fiskalo_invoices_customer_fk_idx on public.fiskalo_invoices(customer_id);
create index if not exists fiskalo_organizations_created_by_fk_idx on public.fiskalo_organizations(created_by);
create index if not exists fiskalo_products_branch_fk_idx on public.fiskalo_products(branch_id);
create index if not exists fiskalo_purchase_items_product_fk_idx on public.fiskalo_purchase_items(product_id);
create index if not exists fiskalo_purchase_payments_created_by_fk_idx on public.fiskalo_purchase_payments(created_by);
create index if not exists fiskalo_purchase_payments_org_fk_idx on public.fiskalo_purchase_payments(organization_id);
create index if not exists fiskalo_purchases_created_by_fk_idx on public.fiskalo_purchases(created_by);
create index if not exists fiskalo_purchases_supplier_fk_idx on public.fiskalo_purchases(supplier_id);
create index if not exists fiskalo_team_invitations_invited_by_fk_idx on public.fiskalo_team_invitations(invited_by);

-- Wrap auth.uid() in scalar subqueries so Postgres can evaluate it once per statement.
drop policy if exists fiskalo_org_insert on public.fiskalo_organizations;
create policy fiskalo_org_insert on public.fiskalo_organizations for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists fiskalo_org_select on public.fiskalo_organizations;
create policy fiskalo_org_select on public.fiskalo_organizations for select to authenticated
using ((created_by = (select auth.uid())) or public.fiskalo_is_member(id));

drop policy if exists fiskalo_members_select on public.fiskalo_organization_users;
create policy fiskalo_members_select on public.fiskalo_organization_users for select to authenticated
using ((user_id = (select auth.uid())) or public.fiskalo_has_role(organization_id,array['owner','administrator']::public.fiskalo_organization_role[]));

drop policy if exists fiskalo_members_insert_owner on public.fiskalo_organization_users;
create policy fiskalo_members_insert_owner on public.fiskalo_organization_users for insert to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'owner'
  and exists(select 1 from public.fiskalo_organizations o where o.id=organization_id and o.created_by=(select auth.uid()))
);

drop policy if exists fiskalo_atk_taxpayer_insert on public.fiskalo_atk_taxpayer_profiles;
create policy fiskalo_atk_taxpayer_insert on public.fiskalo_atk_taxpayer_profiles for insert to authenticated
with check (created_by=(select auth.uid()) and public.fiskalo_has_role(organization_id,array['owner','administrator']::public.fiskalo_organization_role[]));

drop policy if exists fiskalo_invoices_insert on public.fiskalo_invoices;
create policy fiskalo_invoices_insert on public.fiskalo_invoices for insert to authenticated
with check (created_by=(select auth.uid()) and public.fiskalo_is_member(organization_id));

drop policy if exists fiskalo_expenses_write on public.fiskalo_expenses;
create policy fiskalo_expenses_write on public.fiskalo_expenses for all to authenticated
using (public.fiskalo_has_role(organization_id,array['owner','administrator','accountant','manager']::public.fiskalo_organization_role[]))
with check (created_by=(select auth.uid()) and public.fiskalo_has_role(organization_id,array['owner','administrator','accountant','manager']::public.fiskalo_organization_role[]));

drop policy if exists fiskalo_movements_insert on public.fiskalo_inventory_movements;
create policy fiskalo_movements_insert on public.fiskalo_inventory_movements for insert to authenticated
with check (created_by=(select auth.uid()) and public.fiskalo_has_role(organization_id,array['owner','administrator','manager']::public.fiskalo_organization_role[]));

drop policy if exists fiskalo_purchases_insert on public.fiskalo_purchases;
create policy fiskalo_purchases_insert on public.fiskalo_purchases for insert to authenticated
with check (created_by=(select auth.uid()) and status='draft' and public.fiskalo_has_role(organization_id,array['owner','administrator','accountant','manager']::public.fiskalo_organization_role[]));

drop policy if exists fiskalo_atk_pos_insert on public.fiskalo_atk_pos_installations;
create policy fiskalo_atk_pos_insert on public.fiskalo_atk_pos_installations for insert to authenticated
with check (created_by=(select auth.uid()) and environment='test' and status='unregistered' and public.fiskalo_has_role(organization_id,array['owner','administrator']::public.fiskalo_organization_role[]));

drop policy if exists fiskalo_atk_pos_verifications_insert on public.fiskalo_atk_pos_verifications;
create policy fiskalo_atk_pos_verifications_insert on public.fiskalo_atk_pos_verifications for insert to authenticated
with check (created_by=(select auth.uid()) and public.fiskalo_has_role(organization_id,array['owner','administrator']::public.fiskalo_organization_role[]));

drop policy if exists fiskalo_atk_pos_verifications_update on public.fiskalo_atk_pos_verifications;
create policy fiskalo_atk_pos_verifications_update on public.fiskalo_atk_pos_verifications for update to authenticated
using (public.fiskalo_has_role(organization_id,array['owner','administrator']::public.fiskalo_organization_role[]))
with check (created_by=(select auth.uid()) and public.fiskalo_has_role(organization_id,array['owner','administrator']::public.fiskalo_organization_role[]));
