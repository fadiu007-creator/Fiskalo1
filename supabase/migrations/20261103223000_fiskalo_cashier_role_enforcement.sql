create or replace function public.fiskalo_open_cashier_shift(target_org uuid, opening_amount numeric default 0)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare new_shift uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if opening_amount is null or opening_amount < 0 then raise exception 'Opening cash cannot be negative'; end if;
  if not public.fiskalo_has_role(target_org, array['owner','administrator','manager','cashier']::public.fiskalo_organization_role[]) then
    raise exception 'Only owners, administrators, managers and cashiers can open a cashier shift';
  end if;
  insert into public.fiskalo_cashier_shifts(organization_id, opened_by, opening_cash)
  values (target_org, auth.uid(), round(opening_amount,2))
  returning id into new_shift;
  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (target_org, auth.uid(), 'cashier_shift.opened', 'cashier_shift', new_shift,
    jsonb_build_object('opening_cash', round(opening_amount,2)));
  return new_shift;
end;
$function$;

create or replace function public.fiskalo_record_payment(
  target_invoice uuid,
  payment_amount numeric,
  method text,
  payment_reference text default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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
  if not public.fiskalo_has_role(inv.organization_id, array['owner','administrator','manager','cashier']::public.fiskalo_organization_role[]) then
    raise exception 'Accountants cannot record customer payments';
  end if;
  if inv.status <> 'issued' then raise exception 'Only issued invoices can receive payments'; end if;
  select coalesce(sum(p.amount),0) into already_paid from public.fiskalo_invoice_payments p where p.invoice_id = target_invoice;
  new_paid := already_paid + payment_amount;
  if new_paid > inv.total then raise exception 'Payment exceeds the outstanding invoice balance'; end if;
  if method = 'cash' then
    select id into active_shift from public.fiskalo_cashier_shifts
    where organization_id = inv.organization_id and opened_by = auth.uid() and status = 'open'
    for update;
    if active_shift is null then raise exception 'Open a cashier shift before recording a cash payment'; end if;
  end if;
  insert into public.fiskalo_invoice_payments(organization_id, invoice_id, created_by, amount, payment_method, reference, cashier_shift_id)
  values (inv.organization_id, target_invoice, auth.uid(), payment_amount, method, nullif(trim(payment_reference), ''), active_shift);
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
$function$;

create or replace function public.fiskalo_record_cash_movement(
  target_shift uuid,
  movement text,
  movement_amount numeric,
  movement_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  shift_row public.fiskalo_cashier_shifts%rowtype;
  movement_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if movement not in ('cash_in','cash_out') or movement_amount is null or movement_amount <= 0 or nullif(trim(movement_note),'') is null then
    raise exception 'Valid movement type, positive amount and note are required';
  end if;
  select * into shift_row from public.fiskalo_cashier_shifts where id = target_shift for update;
  if not found or shift_row.status <> 'open' or shift_row.opened_by <> auth.uid() then raise exception 'Open cashier shift not found'; end if;
  if not public.fiskalo_has_role(shift_row.organization_id, array['owner','administrator','manager','cashier']::public.fiskalo_organization_role[]) then
    raise exception 'This role cannot record cash movements';
  end if;
  insert into public.fiskalo_cash_movements(organization_id,cashier_shift_id,created_by,movement_type,amount,note)
  values (shift_row.organization_id,target_shift,auth.uid(),movement,round(movement_amount,2),trim(movement_note))
  returning id into movement_id;
  return movement_id;
end;
$function$;

create or replace function public.fiskalo_issue_invoice(target_invoice uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  inv public.fiskalo_invoices%rowtype;
  seq_value bigint;
  year_value integer := extract(year from current_date)::integer;
  result_number text;
  insufficient boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into inv from public.fiskalo_invoices where id = target_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if not public.fiskalo_is_member(inv.organization_id) then raise exception 'Access denied'; end if;
  if inv.status <> 'draft' then raise exception 'Only draft invoices can be issued'; end if;
  if inv.payment_status <> 'unpaid' then
    raise exception 'A draft invoice must be unpaid. Record payment separately after issuing it.';
  end if;
  if not exists (select 1 from public.fiskalo_invoice_items where invoice_id = target_invoice) then
    raise exception 'Add at least one invoice item before issuing';
  end if;

  perform p.id
  from public.fiskalo_products p
  join (
    select product_id from public.fiskalo_invoice_items
    where invoice_id = target_invoice and product_id is not null
    group by product_id
  ) linked on linked.product_id = p.id
  order by p.id
  for update of p;

  select exists (
    select 1
    from public.fiskalo_invoice_items li
    join public.fiskalo_products p on p.id = li.product_id
    where li.invoice_id = target_invoice and p.track_stock
    group by p.id, p.stock_quantity
    having p.stock_quantity < sum(li.quantity)
  ) into insufficient;
  if insufficient then raise exception 'Not enough stock for one or more invoice items'; end if;

  insert into public.fiskalo_document_counters(organization_id, document_type, document_year, next_value)
  values (inv.organization_id, 'invoice', year_value, 2)
  on conflict (organization_id, document_type, document_year)
  do update set next_value = public.fiskalo_document_counters.next_value + 1
  returning next_value - 1 into seq_value;

  result_number := 'FIS-' || year_value::text || '-' || lpad(seq_value::text, 6, '0');
  update public.fiskalo_invoices
    set invoice_number = result_number, status = 'issued', issued_at = now()
    where id = target_invoice;

  with sold as (
    select p.id as product_id, sum(li.quantity) as quantity
    from public.fiskalo_invoice_items li
    join public.fiskalo_products p on p.id = li.product_id
    where li.invoice_id = target_invoice and p.track_stock
    group by p.id
  )
  update public.fiskalo_products p
    set stock_quantity = p.stock_quantity - sold.quantity
    from sold where p.id = sold.product_id;

  insert into public.fiskalo_inventory_movements(organization_id, product_id, created_by, movement_type, quantity, note)
  select inv.organization_id, p.id, auth.uid(), 'out', -sum(li.quantity), 'Shitje përmes faturës ' || result_number
  from public.fiskalo_invoice_items li
  join public.fiskalo_products p on p.id = li.product_id
  where li.invoice_id = target_invoice and p.track_stock
  group by p.id;

  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (inv.organization_id, auth.uid(), 'invoice.issued', 'invoice', target_invoice,
    jsonb_build_object('invoice_number', result_number, 'total', inv.total));
  return result_number;
end;
$function$;
