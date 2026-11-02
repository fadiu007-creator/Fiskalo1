create table public.fiskalo_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  invoice_id uuid not null references public.fiskalo_invoices(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'card', 'bank_transfer')),
  reference text,
  created_at timestamptz not null default now()
);
create index fiskalo_invoice_payments_invoice_idx on public.fiskalo_invoice_payments(invoice_id, created_at);
alter table public.fiskalo_invoice_payments enable row level security;
create policy fiskalo_payments_select on public.fiskalo_invoice_payments for select to authenticated
using (public.fiskalo_is_member(organization_id));
grant select on public.fiskalo_invoice_payments to authenticated;

create or replace function public.fiskalo_validate_payment_link()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare invoice_org uuid;
declare invoice_state public.fiskalo_invoice_status;
begin
  select organization_id, status into invoice_org, invoice_state
  from public.fiskalo_invoices where id = new.invoice_id;
  if invoice_org is null or invoice_org is distinct from new.organization_id then
    raise exception 'Payment must belong to the same business as its invoice';
  end if;
  if invoice_state <> 'issued' then raise exception 'Payments can only be recorded for issued invoices'; end if;
  return new;
end;
$$;
create trigger fiskalo_payment_org_link before insert on public.fiskalo_invoice_payments
for each row execute function public.fiskalo_validate_payment_link();

create or replace function public.fiskalo_guard_invoice()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
declare expected_subtotal numeric(14,2);
declare expected_vat numeric(14,2);
declare expected_total numeric(14,2);
begin
  if old.status = 'cancelled' then
    raise exception 'Cancelled invoices cannot be modified';
  end if;

  if old.status = 'issued' then
    if (to_jsonb(new) - array['payment_status','payment_method','paid_at'])
       is distinct from
       (to_jsonb(old) - array['payment_status','payment_method','paid_at']) then
      raise exception 'Issued invoice details are immutable; only payment records may change';
    end if;
    if new.payment_status = 'paid' then
      new.paid_at := coalesce(new.paid_at, now());
    else
      new.paid_at := null;
    end if;
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id or new.created_by is distinct from old.created_by then
    raise exception 'Invoice ownership cannot be changed';
  end if;

  select
    coalesce(sum(li.line_subtotal), 0),
    coalesce(sum(li.line_vat), 0),
    coalesce(sum(li.line_subtotal + li.line_vat), 0)
  into expected_subtotal, expected_vat, expected_total
  from public.fiskalo_invoice_items li where li.invoice_id = old.id;

  new.subtotal := expected_subtotal;
  new.vat_total := expected_vat;
  new.total := expected_total;
  new.fiscalization_status := old.fiscalization_status;

  if new.status = 'draft' then
    if new.invoice_number is distinct from old.invoice_number then
      raise exception 'Invoice numbers are assigned only by the issue workflow';
    end if;
    new.issued_at := null;
  elsif new.status = 'issued' then
    if new.invoice_number is null or new.invoice_number !~ '^FIS-[0-9]{4}-[0-9]{6}$' then
      raise exception 'A valid system invoice number is required';
    end if;
    new.issued_at := now();
    if new.payment_status = 'paid' then
      new.paid_at := coalesce(new.paid_at, now());
    else
      new.paid_at := null;
    end if;
  else
    raise exception 'Invalid invoice status transition';
  end if;
  return new;
end;
$$;

create or replace function public.fiskalo_issue_invoice(target_invoice uuid)
returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare inv public.fiskalo_invoices%rowtype;
declare seq_value bigint;
declare year_value integer := extract(year from current_date)::integer;
declare result_number text;
declare insufficient boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into inv from public.fiskalo_invoices where id = target_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if not public.fiskalo_is_member(inv.organization_id) then raise exception 'Access denied'; end if;
  if inv.status <> 'draft' then raise exception 'Only draft invoices can be issued'; end if;
  if not exists (select 1 from public.fiskalo_invoice_items where invoice_id = target_invoice) then
    raise exception 'Add at least one invoice item before issuing';
  end if;

  perform p.id
  from public.fiskalo_products p
  join (
    select product_id
    from public.fiskalo_invoice_items
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

  if inv.payment_status = 'paid' and inv.total > 0 then
    insert into public.fiskalo_invoice_payments(organization_id, invoice_id, created_by, amount, payment_method)
    values (inv.organization_id, target_invoice, auth.uid(), inv.total, inv.payment_method);
  end if;

  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (inv.organization_id, auth.uid(), 'invoice.issued', 'invoice', target_invoice, jsonb_build_object('invoice_number', result_number, 'total', inv.total));
  return result_number;
end;
$$;
revoke all on function public.fiskalo_issue_invoice(uuid) from public;
grant execute on function public.fiskalo_issue_invoice(uuid) to authenticated;

create or replace function public.fiskalo_record_payment(target_invoice uuid, payment_amount numeric, method text, payment_reference text default null)
returns numeric language plpgsql security definer set search_path = public, pg_temp
as $$
declare inv public.fiskalo_invoices%rowtype;
declare already_paid numeric(14,2);
declare new_paid numeric(14,2);
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

  insert into public.fiskalo_invoice_payments(organization_id, invoice_id, created_by, amount, payment_method, reference)
  values (inv.organization_id, target_invoice, auth.uid(), payment_amount, method, nullif(trim(payment_reference), ''));

  update public.fiskalo_invoices
    set payment_status = case when new_paid >= inv.total then 'paid' else 'partial' end,
        payment_method = method,
        paid_at = case when new_paid >= inv.total then now() else null end
    where id = target_invoice;

  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (inv.organization_id, auth.uid(), 'invoice.payment_recorded', 'invoice', target_invoice, jsonb_build_object('amount', payment_amount, 'total_paid', new_paid, 'method', method));
  return new_paid;
end;
$$;
revoke all on function public.fiskalo_record_payment(uuid, numeric, text, text) from public;
grant execute on function public.fiskalo_record_payment(uuid, numeric, text, text) to authenticated;
