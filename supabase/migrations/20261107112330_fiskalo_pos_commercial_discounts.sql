-- Commercial discounts are applied at sale time and reduce the taxable base.
-- The original unit price is retained; discounted line values are calculated in PostgreSQL.
alter table public.fiskalo_invoices
  add column discount_total numeric(14,2) not null default 0 check (discount_total >= 0);

alter table public.fiskalo_invoice_items
  add column discount_percent numeric(5,2) not null default 0
    check (discount_percent >= 0 and discount_percent <= 99.99);

alter table public.fiskalo_invoice_items
  drop column line_subtotal,
  drop column line_vat;

alter table public.fiskalo_invoice_items
  add column line_subtotal numeric(14,2)
    generated always as (round(quantity * unit_price * (100 - discount_percent) / 100, 2)) stored,
  add column line_vat numeric(14,2)
    generated always as (round(quantity * unit_price * (100 - discount_percent) / 100 * vat_rate / 100, 2)) stored;

create or replace function public.fiskalo_initialize_invoice()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.status <> 'draft' then raise exception 'Invoices must be created as drafts'; end if;
  new.invoice_number := null;
  new.subtotal := 0;
  new.vat_total := 0;
  new.total := 0;
  new.discount_total := 0;
  new.fiscalization_status := 'not_fiscalized';
  new.issued_at := null;
  new.paid_at := null;
  return new;
end;
$$;

create or replace function public.fiskalo_refresh_invoice_totals()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
declare old_invoice_id uuid;
declare new_invoice_id uuid;
begin
  if tg_op <> 'INSERT' then old_invoice_id := old.invoice_id; end if;
  if tg_op <> 'DELETE' then new_invoice_id := new.invoice_id; end if;

  if old_invoice_id is not null and old_invoice_id is distinct from new_invoice_id then
    update public.fiskalo_invoices i
      set subtotal = coalesce((select sum(li.line_subtotal) from public.fiskalo_invoice_items li where li.invoice_id = old_invoice_id), 0),
          vat_total = coalesce((select sum(li.line_vat) from public.fiskalo_invoice_items li where li.invoice_id = old_invoice_id), 0),
          total = coalesce((select sum(li.line_subtotal + li.line_vat) from public.fiskalo_invoice_items li where li.invoice_id = old_invoice_id), 0),
          discount_total = coalesce((select sum(round(li.quantity * li.unit_price,2) + round(li.quantity * li.unit_price * li.vat_rate / 100,2) - li.line_subtotal - li.line_vat) from public.fiskalo_invoice_items li where li.invoice_id = old_invoice_id), 0)
    where i.id = old_invoice_id and i.status = 'draft';
  end if;

  if new_invoice_id is not null then
    update public.fiskalo_invoices i
      set subtotal = coalesce((select sum(li.line_subtotal) from public.fiskalo_invoice_items li where li.invoice_id = new_invoice_id), 0),
          vat_total = coalesce((select sum(li.line_vat) from public.fiskalo_invoice_items li where li.invoice_id = new_invoice_id), 0),
          total = coalesce((select sum(li.line_subtotal + li.line_vat) from public.fiskalo_invoice_items li where li.invoice_id = new_invoice_id), 0),
          discount_total = coalesce((select sum(round(li.quantity * li.unit_price,2) + round(li.quantity * li.unit_price * li.vat_rate / 100,2) - li.line_subtotal - li.line_vat) from public.fiskalo_invoice_items li where li.invoice_id = new_invoice_id), 0)
    where i.id = new_invoice_id and i.status = 'draft';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.fiskalo_guard_invoice()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
declare expected_subtotal numeric(14,2);
declare expected_vat numeric(14,2);
declare expected_total numeric(14,2);
declare expected_discount numeric(14,2);
begin
  if old.status in ('issued', 'cancelled') then
    raise exception 'Issued or cancelled invoices cannot be modified';
  end if;
  if new.organization_id is distinct from old.organization_id or new.created_by is distinct from old.created_by then
    raise exception 'Invoice ownership cannot be changed';
  end if;

  select
    coalesce(sum(li.line_subtotal), 0),
    coalesce(sum(li.line_vat), 0),
    coalesce(sum(li.line_subtotal + li.line_vat), 0),
    coalesce(sum(round(li.quantity * li.unit_price,2) + round(li.quantity * li.unit_price * li.vat_rate / 100,2) - li.line_subtotal - li.line_vat),0)
  into expected_subtotal, expected_vat, expected_total, expected_discount
  from public.fiskalo_invoice_items li where li.invoice_id = old.id;

  new.subtotal := expected_subtotal;
  new.vat_total := expected_vat;
  new.total := expected_total;
  new.discount_total := expected_discount;
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

drop function if exists public.fiskalo_create_pos_sale(uuid,uuid,uuid,text,jsonb);

create function public.fiskalo_create_pos_sale(
  target_org uuid,
  request_id uuid,
  target_customer uuid,
  target_payment_method text,
  sale_items jsonb,
  target_discount_percent numeric
)
returns table(invoice_id uuid, invoice_number text, invoice_total numeric, replayed boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_items jsonb;
  request_fingerprint text;
  existing public.fiskalo_invoices%rowtype;
  created_invoice uuid;
  created_number text;
  created_total numeric(14,2);
  input_count integer;
  valid_count integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if request_id is null then raise exception 'A stable request ID is required'; end if;
  if target_payment_method not in ('cash','card','bank_transfer','credit') then raise exception 'Unsupported payment method'; end if;
  if target_discount_percent is null or target_discount_percent < 0 or target_discount_percent > 99.99 then
    raise exception 'Discount percentage must be between 0 and 99.99';
  end if;
  if jsonb_typeof(sale_items) <> 'array' or jsonb_array_length(sale_items) < 1 or jsonb_array_length(sale_items) > 100 then
    raise exception 'A sale must contain between 1 and 100 item rows';
  end if;
  if not public.fiskalo_is_member(target_org)
     or not public.fiskalo_has_role(target_org, array['owner','administrator','manager','cashier']::public.fiskalo_organization_role[]) then
    raise exception 'Access denied';
  end if;

  select count(*) into input_count from jsonb_to_recordset(sale_items) as x(product_id uuid, quantity numeric);
  if input_count < 1 then raise exception 'Sale items are required'; end if;
  if exists (
    select 1 from jsonb_to_recordset(sale_items) as x(product_id uuid, quantity numeric)
    where x.product_id is null or x.quantity is null or x.quantity <= 0 or x.quantity > 100000
  ) then raise exception 'Each sale item needs a product and a positive quantity'; end if;

  select jsonb_agg(jsonb_build_object('product_id', grouped.product_id, 'quantity', grouped.quantity) order by grouped.product_id)
  into normalized_items
  from (
    select x.product_id, sum(x.quantity) as quantity
    from jsonb_to_recordset(sale_items) as x(product_id uuid, quantity numeric)
    group by x.product_id
  ) grouped;

  select count(*) into valid_count
  from jsonb_to_recordset(normalized_items) as x(product_id uuid, quantity numeric)
  join public.fiskalo_products p on p.id = x.product_id and p.organization_id = target_org and p.is_active = true;
  if valid_count <> jsonb_array_length(normalized_items) then
    raise exception 'One or more products are unavailable or belong to another business';
  end if;

  if target_customer is not null and not exists (
    select 1 from public.fiskalo_customers c where c.id = target_customer and c.organization_id = target_org
  ) then raise exception 'Customer does not belong to this business'; end if;

  if target_payment_method = 'cash' and not exists (
    select 1 from public.fiskalo_cashier_shifts s
    where s.organization_id = target_org and s.opened_by = actor_id and s.status = 'open'
  ) then raise exception 'Open a cashier shift before accepting cash'; end if;

  request_fingerprint := md5(jsonb_build_object(
    'customer_id', target_customer,
    'payment_method', target_payment_method,
    'discount_percent', target_discount_percent,
    'items', normalized_items
  )::text);

  select * into existing from public.fiskalo_invoices i
  where i.organization_id = target_org and i.created_by = actor_id and i.pos_request_id = request_id
  for update;
  if found then
    if existing.pos_request_fingerprint is distinct from request_fingerprint then raise exception 'Request ID was already used for a different sale'; end if;
    if existing.status <> 'issued' then raise exception 'A previous sale request is incomplete; review its draft before retrying'; end if;
    return query select existing.id, existing.invoice_number, existing.total, true;
    return;
  end if;

  insert into public.fiskalo_invoices(
    organization_id, created_by, customer_id, payment_method, payment_status,
    issue_date, pos_request_id, pos_request_fingerprint
  ) values (
    target_org, actor_id, target_customer, target_payment_method, 'unpaid',
    current_date, request_id, request_fingerprint
  )
  on conflict (organization_id, created_by, pos_request_id) do nothing
  returning id into created_invoice;

  if created_invoice is null then
    select * into existing from public.fiskalo_invoices i
    where i.organization_id = target_org and i.created_by = actor_id and i.pos_request_id = request_id
    for update;
    if not found or existing.pos_request_fingerprint is distinct from request_fingerprint then raise exception 'Request ID was already used for a different sale'; end if;
    if existing.status <> 'issued' then raise exception 'A previous sale request is incomplete; review its draft before retrying'; end if;
    return query select existing.id, existing.invoice_number, existing.total, true;
    return;
  end if;

  insert into public.fiskalo_invoice_items(
    invoice_id, product_id, description, quantity, unit_price, vat_rate, discount_percent
  )
  select created_invoice, p.id, p.name, x.quantity, p.unit_price, p.vat_rate, target_discount_percent
  from jsonb_to_recordset(normalized_items) as x(product_id uuid, quantity numeric)
  join public.fiskalo_products p on p.id = x.product_id and p.organization_id = target_org and p.is_active = true
  order by p.id;

  created_number := public.fiskalo_issue_invoice(created_invoice);
  select i.total into created_total from public.fiskalo_invoices i
  where i.id = created_invoice and i.organization_id = target_org;

  if target_payment_method <> 'credit' then
    perform public.fiskalo_record_payment(created_invoice, created_total, target_payment_method, null);
  end if;

  return query select created_invoice, created_number, created_total, false;
end;
$$;

revoke all on function public.fiskalo_create_pos_sale(uuid,uuid,uuid,text,jsonb,numeric) from public, anon;
grant execute on function public.fiskalo_create_pos_sale(uuid,uuid,uuid,text,jsonb,numeric) to authenticated;

-- Keep compatibility for existing Android clients that do not send a discount argument.
create function public.fiskalo_create_pos_sale(
  target_org uuid,
  request_id uuid,
  target_customer uuid,
  target_payment_method text,
  sale_items jsonb
)
returns table(invoice_id uuid, invoice_number text, invoice_total numeric, replayed boolean)
language sql
security invoker
set search_path = ''
as $wrapper$
  select * from public.fiskalo_create_pos_sale(
    target_org, request_id, target_customer, target_payment_method, sale_items, 0::numeric
  );
$wrapper$;
revoke all on function public.fiskalo_create_pos_sale(uuid,uuid,uuid,text,jsonb) from public, anon;
grant execute on function public.fiskalo_create_pos_sale(uuid,uuid,uuid,text,jsonb) to authenticated;
