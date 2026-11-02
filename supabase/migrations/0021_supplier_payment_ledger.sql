alter table public.fiskalo_purchases
  add column payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid')),
  add column paid_total numeric(14,2) not null default 0 check (paid_total >= 0 and paid_total <= total);

create table public.fiskalo_purchase_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.fiskalo_purchases(id) on delete restrict,
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('cash','card','bank_transfer')),
  reference text,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index fiskalo_purchase_payments_purchase_idx on public.fiskalo_purchase_payments(purchase_id,paid_at desc);
alter table public.fiskalo_purchase_payments enable row level security;
create policy fiskalo_purchase_payments_select on public.fiskalo_purchase_payments for select to authenticated
using (public.fiskalo_is_member(organization_id));
grant select on public.fiskalo_purchase_payments to authenticated;

create or replace function public.fiskalo_record_purchase_payment(
  target_purchase uuid,
  payment_amount numeric,
  method text,
  payment_reference text default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  purchase_row public.fiskalo_purchases%rowtype;
  new_paid numeric(14,2);
  outstanding numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if payment_amount is null or payment_amount <= 0 or payment_amount <> round(payment_amount,2) then
    raise exception 'Payment must be greater than zero and use two decimal places';
  end if;
  if method not in ('cash','card','bank_transfer') then raise exception 'Unsupported payment method'; end if;

  select * into purchase_row from public.fiskalo_purchases where id=target_purchase for update;
  if not found then raise exception 'Purchase not found'; end if;
  if not public.fiskalo_has_role(purchase_row.organization_id,array['owner','administrator','accountant','manager']::public.fiskalo_organization_role[]) then
    raise exception 'You do not have permission to record supplier payments';
  end if;

  outstanding := purchase_row.total - purchase_row.paid_total;
  if payment_amount > outstanding then raise exception 'Payment exceeds the outstanding supplier balance'; end if;

  insert into public.fiskalo_purchase_payments(purchase_id,organization_id,created_by,amount,method,reference)
  values(target_purchase,purchase_row.organization_id,auth.uid(),payment_amount,method,nullif(trim(payment_reference),''));

  new_paid := purchase_row.paid_total + payment_amount;
  update public.fiskalo_purchases
  set paid_total=new_paid,
      payment_status=case when new_paid >= total then 'paid' else 'partial' end
  where id=target_purchase;

  insert into public.fiskalo_audit_logs(organization_id,actor_id,action,entity_type,entity_id,details)
  values(purchase_row.organization_id,auth.uid(),'purchase.payment_recorded','purchase',target_purchase,
    jsonb_build_object('amount',payment_amount,'paid_total',new_paid,'outstanding',purchase_row.total-new_paid,'method',method));

  return purchase_row.total-new_paid;
end;
$$;
revoke all on function public.fiskalo_record_purchase_payment(uuid,numeric,text,text) from public,anon;
grant execute on function public.fiskalo_record_purchase_payment(uuid,numeric,text,text) to authenticated;
