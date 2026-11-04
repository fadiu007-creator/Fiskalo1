-- Cash payments must be assigned to the cashier's active shift.
-- This keeps cash reconciliation complete and prevents untracked cash sales.
create or replace function public.fiskalo_record_payment(target_invoice uuid, payment_amount numeric, method text, payment_reference text default null)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv public.fiskalo_invoices%rowtype;
  already_paid numeric(14,2);
  new_paid numeric(14,2);
  active_shift uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if payment_amount is null or payment_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if method not in ('cash','card','bank_transfer') then raise exception 'Unsupported payment method'; end if;

  select * into inv from public.fiskalo_invoices where id = target_invoice for update;
  if not found or not public.fiskalo_is_member(inv.organization_id) then raise exception 'Invoice not found or access denied'; end if;
  if inv.status <> 'issued' then raise exception 'Only issued invoices can receive payments'; end if;

  select coalesce(sum(p.amount),0) into already_paid
  from public.fiskalo_invoice_payments p where p.invoice_id = target_invoice;
  new_paid := already_paid + payment_amount;
  if new_paid > inv.total then raise exception 'Payment exceeds the outstanding invoice balance'; end if;

  if method = 'cash' then
    select id into active_shift
    from public.fiskalo_cashier_shifts
    where organization_id = inv.organization_id
      and opened_by = auth.uid()
      and status = 'open'
    for update;
    if active_shift is null then
      raise exception 'Open a cashier shift before recording a cash payment';
    end if;
  end if;

  insert into public.fiskalo_invoice_payments(organization_id, invoice_id, created_by, amount, payment_method, reference, cashier_shift_id)
  values (inv.organization_id, target_invoice, auth.uid(), payment_amount, method,
    nullif(trim(payment_reference), ''), active_shift);

  update public.fiskalo_invoices
    set payment_status = case when new_paid >= inv.total then 'paid' else 'partial' end,
        payment_method = method,
        paid_at = case when new_paid >= inv.total then now() else null end
    where id = target_invoice;

  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (inv.organization_id, auth.uid(), 'invoice.payment_recorded', 'invoice', target_invoice,
    jsonb_build_object('amount', payment_amount, 'total_paid', new_paid, 'method', method, 'cashier_shift_id',active_shift));
  return new_paid;
end;
$$;

revoke all on function public.fiskalo_record_payment(uuid,numeric,text,text) from public, anon;
grant execute on function public.fiskalo_record_payment(uuid,numeric,text,text) to authenticated;
