-- Immutable internal X/Z-style cash reporting snapshots.
-- These are management records, not ATK tax reports and are never submitted to ATK.
create table if not exists public.fiskalo_cashier_shift_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  cashier_shift_id uuid not null references public.fiskalo_cashier_shifts(id) on delete restrict,
  report_type text not null default 'Z' check (report_type = 'Z'),
  report_number text not null unique,
  snapshot jsonb not null,
  generated_by uuid not null references auth.users(id) on delete restrict,
  generated_at timestamptz not null default now(),
  unique (cashier_shift_id)
);

create index if not exists fiskalo_cashier_shift_reports_org_generated_idx
  on public.fiskalo_cashier_shift_reports(organization_id, generated_at desc);

alter table public.fiskalo_cashier_shift_reports enable row level security;
revoke all on public.fiskalo_cashier_shift_reports from public, anon, authenticated;
create policy fiskalo_cashier_shift_reports_select on public.fiskalo_cashier_shift_reports
  for select to authenticated using (public.fiskalo_is_member(organization_id));
grant select on public.fiskalo_cashier_shift_reports to authenticated;

create or replace function public.fiskalo_close_cashier_shift(
  target_shift uuid,
  counted_amount numeric,
  closing_note text default null
)
returns table(expected numeric, counted numeric, difference numeric, report_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  shift_row public.fiskalo_cashier_shifts%rowtype;
  cash_sales numeric(14,2);
  cash_in numeric(14,2);
  cash_out numeric(14,2);
  expected_amount numeric(14,2);
  difference_amount numeric(14,2);
  payment_totals jsonb;
  movement_rows jsonb;
  invoice_rows jsonb;
  new_report_id uuid;
  report_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if counted_amount is null or counted_amount < 0 then raise exception 'Counted cash cannot be negative'; end if;

  select * into shift_row
  from public.fiskalo_cashier_shifts
  where id = target_shift
  for update;

  if not found or not public.fiskalo_is_member(shift_row.organization_id) then
    raise exception 'Shift not found or access denied';
  end if;
  if shift_row.status <> 'open' then raise exception 'Shift is already closed'; end if;
  if shift_row.opened_by <> auth.uid() and not public.fiskalo_has_role(
    shift_row.organization_id,
    array['owner','administrator','manager']::public.fiskalo_organization_role[]
  ) then
    raise exception 'Only the cashier or a manager can close this shift';
  end if;

  select coalesce(sum(p.amount),0)
  into cash_sales
  from public.fiskalo_invoice_payments p
  where p.cashier_shift_id = target_shift and p.payment_method = 'cash';

  select
    coalesce(sum(case when movement_type = 'cash_in' then amount else 0 end),0),
    coalesce(sum(case when movement_type = 'cash_out' then amount else 0 end),0)
  into cash_in, cash_out
  from public.fiskalo_cash_movements
  where cashier_shift_id = target_shift;

  expected_amount := round(shift_row.opening_cash + cash_sales + cash_in - cash_out,2);
  difference_amount := round(counted_amount - expected_amount,2);

  select coalesce(jsonb_object_agg(payment_method, amount), '{}'::jsonb)
  into payment_totals
  from (
    select p.payment_method, round(sum(p.amount),2) as amount
    from public.fiskalo_invoice_payments p
    where p.cashier_shift_id = target_shift
    group by p.payment_method
  ) totals;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'type', m.movement_type,
    'amount', m.amount,
    'note', m.note,
    'created_at', m.created_at
  ) order by m.created_at, m.id), '[]'::jsonb)
  into movement_rows
  from public.fiskalo_cash_movements m
  where m.cashier_shift_id = target_shift;

  select coalesce(jsonb_agg(jsonb_build_object(
    'invoice_id', i.id,
    'invoice_number', i.invoice_number,
    'issue_date', i.issue_date,
    'total', i.total,
    'payment_status', i.payment_status
  ) order by i.issue_date, i.id), '[]'::jsonb)
  into invoice_rows
  from (
    select distinct inv.id, inv.invoice_number, inv.issue_date, inv.total, inv.payment_status
    from public.fiskalo_invoice_payments p
    join public.fiskalo_invoices inv on inv.id = p.invoice_id
    where p.cashier_shift_id = target_shift
  ) i;

  update public.fiskalo_cashier_shifts
  set status = 'closed',
      closed_by = auth.uid(),
      closed_at = now(),
      expected_cash = expected_amount,
      counted_cash = round(counted_amount,2),
      cash_difference = difference_amount,
      note = nullif(trim(closing_note),'')
  where id = target_shift
  returning * into shift_row;

  report_code := 'Z-' || to_char(shift_row.closed_at at time zone 'Europe/Belgrade', 'YYYYMMDD') || '-' ||
    upper(substr(replace(target_shift::text, '-', ''), 1, 8));

  insert into public.fiskalo_cashier_shift_reports (
    organization_id, cashier_shift_id, report_type, report_number, snapshot, generated_by, generated_at
  ) values (
    shift_row.organization_id,
    target_shift,
    'Z',
    report_code,
    jsonb_build_object(
      'report_type', 'INTERNAL_Z',
      'report_number', report_code,
      'organization_id', shift_row.organization_id,
      'cashier_shift_id', target_shift,
      'cashier_user_id', shift_row.opened_by,
      'closed_by', auth.uid(),
      'opened_at', shift_row.opened_at,
      'closed_at', shift_row.closed_at,
      'opening_cash', shift_row.opening_cash,
      'cash_sales', cash_sales,
      'cash_in', cash_in,
      'cash_out', cash_out,
      'expected_cash', expected_amount,
      'counted_cash', round(counted_amount,2),
      'cash_difference', difference_amount,
      'payments_by_method', payment_totals,
      'cash_movements', movement_rows,
      'paid_invoices', invoice_rows,
      'closing_note', nullif(trim(closing_note),''),
      'timezone', 'Europe/Belgrade',
      'is_atk_report', false
    ),
    auth.uid(),
    shift_row.closed_at
  )
  returning id into new_report_id;

  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (
    shift_row.organization_id,
    auth.uid(),
    'cashier_shift.closed',
    'cashier_shift',
    target_shift,
    jsonb_build_object(
      'expected_cash', expected_amount,
      'counted_cash', round(counted_amount,2),
      'difference', difference_amount,
      'z_report_id', new_report_id,
      'z_report_number', report_code
    )
  );

  return query select expected_amount, round(counted_amount,2), difference_amount, new_report_id;
end;
$$;

revoke all on function public.fiskalo_close_cashier_shift(uuid,numeric,text) from public, anon;
grant execute on function public.fiskalo_close_cashier_shift(uuid,numeric,text) to authenticated;
