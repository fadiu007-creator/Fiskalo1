-- Cashier shift control and cash reconciliation. All objects remain Fiskalo-prefixed.
create table public.fiskalo_cashier_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  opened_by uuid not null references auth.users(id) on delete restrict,
  closed_by uuid references auth.users(id) on delete restrict,
  status text not null default 'open' check (status in ('open','closed')),
  opening_cash numeric(14,2) not null default 0 check (opening_cash >= 0),
  expected_cash numeric(14,2),
  counted_cash numeric(14,2),
  cash_difference numeric(14,2),
  note text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'open' and closed_at is null and closed_by is null and counted_cash is null)
    or
    (status = 'closed' and closed_at is not null and closed_by is not null and counted_cash is not null and expected_cash is not null and cash_difference is not null)
  )
);
create unique index fiskalo_one_open_shift_per_cashier
  on public.fiskalo_cashier_shifts(organization_id, opened_by) where status = 'open';
create index fiskalo_shifts_org_opened_idx on public.fiskalo_cashier_shifts(organization_id, opened_at desc);

alter table public.fiskalo_invoice_payments
  add column cashier_shift_id uuid references public.fiskalo_cashier_shifts(id) on delete restrict;
create index fiskalo_invoice_payments_shift_idx
  on public.fiskalo_invoice_payments(cashier_shift_id, created_at)
  where cashier_shift_id is not null;

create table public.fiskalo_cash_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  cashier_shift_id uuid not null references public.fiskalo_cashier_shifts(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  movement_type text not null check (movement_type in ('cash_in','cash_out')),
  amount numeric(14,2) not null check (amount > 0),
  note text not null,
  created_at timestamptz not null default now()
);
create index fiskalo_cash_movements_shift_idx on public.fiskalo_cash_movements(cashier_shift_id, created_at);

alter table public.fiskalo_cashier_shifts enable row level security;
alter table public.fiskalo_cash_movements enable row level security;
create policy fiskalo_shifts_select on public.fiskalo_cashier_shifts
  for select to authenticated using (public.fiskalo_is_member(organization_id));
create policy fiskalo_cash_movements_select on public.fiskalo_cash_movements
  for select to authenticated using (public.fiskalo_is_member(organization_id));
grant select on public.fiskalo_cashier_shifts, public.fiskalo_cash_movements to authenticated;

create or replace function public.fiskalo_open_cashier_shift(target_org uuid, opening_amount numeric default 0)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare new_shift uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if opening_amount is null or opening_amount < 0 then raise exception 'Opening cash cannot be negative'; end if;
  if not public.fiskalo_is_member(target_org) then raise exception 'Access denied'; end if;
  insert into public.fiskalo_cashier_shifts(organization_id, opened_by, opening_cash)
  values (target_org, auth.uid(), round(opening_amount,2))
  returning id into new_shift;
  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (target_org, auth.uid(), 'cashier_shift.opened', 'cashier_shift', new_shift,
    jsonb_build_object('opening_cash', round(opening_amount,2)));
  return new_shift;
end;
$$;
revoke all on function public.fiskalo_open_cashier_shift(uuid,numeric) from public, anon;
grant execute on function public.fiskalo_open_cashier_shift(uuid,numeric) to authenticated;

create or replace function public.fiskalo_close_cashier_shift(target_shift uuid, counted_amount numeric, closing_note text default null)
returns table(expected numeric, counted numeric, difference numeric)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare shift_row public.fiskalo_cashier_shifts%rowtype;
declare cash_sales numeric(14,2);
declare cash_in numeric(14,2);
declare cash_out numeric(14,2);
declare expected_amount numeric(14,2);
declare difference_amount numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if counted_amount is null or counted_amount < 0 then raise exception 'Counted cash cannot be negative'; end if;
  select * into shift_row from public.fiskalo_cashier_shifts where id = target_shift for update;
  if not found or not public.fiskalo_is_member(shift_row.organization_id) then raise exception 'Shift not found or access denied'; end if;
  if shift_row.status <> 'open' then raise exception 'Shift is already closed'; end if;
  if shift_row.opened_by <> auth.uid() and not public.fiskalo_has_role(shift_row.organization_id,array['owner','administrator','manager']::public.fiskalo_organization_role[]) then
    raise exception 'Only the cashier or a manager can close this shift';
  end if;

  select coalesce(sum(p.amount),0) into cash_sales
  from public.fiskalo_invoice_payments p
  where p.cashier_shift_id = target_shift and p.payment_method = 'cash';
  select coalesce(sum(case when movement_type = 'cash_in' then amount else 0 end),0),
         coalesce(sum(case when movement_type = 'cash_out' then amount else 0 end),0)
  into cash_in, cash_out
  from public.fiskalo_cash_movements where cashier_shift_id = target_shift;
  expected_amount := round(shift_row.opening_cash + cash_sales + cash_in - cash_out,2);
  difference_amount := round(counted_amount - expected_amount,2);

  update public.fiskalo_cashier_shifts
  set status = 'closed', closed_by = auth.uid(), closed_at = now(),
      expected_cash = expected_amount, counted_cash = round(counted_amount,2),
      cash_difference = difference_amount, note = nullif(trim(closing_note),'')
  where id = target_shift;

  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (shift_row.organization_id, auth.uid(), 'cashier_shift.closed', 'cashier_shift', target_shift,
    jsonb_build_object('expected_cash',expected_amount,'counted_cash',round(counted_amount,2),'difference',difference_amount));
  return query select expected_amount, round(counted_amount,2), difference_amount;
end;
$$;
revoke all on function public.fiskalo_close_cashier_shift(uuid,numeric,text) from public, anon;
grant execute on function public.fiskalo_close_cashier_shift(uuid,numeric,text) to authenticated;

create or replace function public.fiskalo_record_cash_movement(target_shift uuid, movement text, movement_amount numeric, movement_note text)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare shift_row public.fiskalo_cashier_shifts%rowtype;
declare movement_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if movement not in ('cash_in','cash_out') or movement_amount is null or movement_amount <= 0 or nullif(trim(movement_note),'') is null then
    raise exception 'Valid movement type, positive amount and note are required';
  end if;
  select * into shift_row from public.fiskalo_cashier_shifts where id = target_shift for update;
  if not found or shift_row.status <> 'open' or shift_row.opened_by <> auth.uid() then raise exception 'Open cashier shift not found'; end if;
  insert into public.fiskalo_cash_movements(organization_id,cashier_shift_id,created_by,movement_type,amount,note)
  values (shift_row.organization_id,target_shift,auth.uid(),movement,round(movement_amount,2),trim(movement_note))
  returning id into movement_id;
  return movement_id;
end;
$$;
revoke all on function public.fiskalo_record_cash_movement(uuid,text,numeric,text) from public, anon;
grant execute on function public.fiskalo_record_cash_movement(uuid,text,numeric,text) to authenticated;

-- Attach cash payments to the currently open shift for this cashier. Non-cash payments remain unassigned.
create or replace function public.fiskalo_record_payment(target_invoice uuid, payment_amount numeric, method text, payment_reference text default null)
returns numeric language plpgsql security definer set search_path = public, pg_temp
as $$
declare inv public.fiskalo_invoices%rowtype;
declare already_paid numeric(14,2);
declare new_paid numeric(14,2);
declare active_shift uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if payment_amount is null or payment_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if method not in ('cash','card','bank_transfer') then raise exception 'Unsupported payment method'; end if;
  select * into inv from public.fiskalo_invoices where id = target_invoice for update;
  if not found or not public.fiskalo_is_member(inv.organization_id) then raise exception 'Invoice not found or access denied'; end if;
  if inv.status <> 'issued' then raise exception 'Only issued invoices can receive payments'; end if;
  select coalesce(sum(p.amount),0) into already_paid from public.fiskalo_invoice_payments p where p.invoice_id = target_invoice;
  new_paid := already_paid + payment_amount;
  if new_paid > inv.total then raise exception 'Payment exceeds the outstanding invoice balance'; end if;
  if method = 'cash' then
    select id into active_shift from public.fiskalo_cashier_shifts
    where organization_id = inv.organization_id and opened_by = auth.uid() and status = 'open'
    for update;
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
