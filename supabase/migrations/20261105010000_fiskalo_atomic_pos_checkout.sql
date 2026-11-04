-- Idempotent atomic POS checkout for web and Android clients.
-- A request key is generated before the client submits a sale and is reused on retries.
alter table public.fiskalo_invoices
  add column pos_request_id uuid,
  add column pos_request_fingerprint text;

alter table public.fiskalo_invoices
  add constraint fiskalo_invoices_pos_request_unique
  unique (organization_id, created_by, pos_request_id);

create or replace function public.fiskalo_create_pos_sale(
  target_org uuid,
  request_id uuid,
  target_customer uuid,
  target_payment_method text,
  sale_items jsonb
)
returns table(invoice_id uuid, invoice_number text, invoice_total numeric, replayed boolean)
language plpgsql
security definer
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
  if actor_id is null then
    raise exception 'Authentication required';
  end if;
  if request_id is null then
    raise exception 'A stable request ID is required';
  end if;
  if target_payment_method not in ('cash','card','bank_transfer','credit') then
    raise exception 'Unsupported payment method';
  end if;
  if jsonb_typeof(sale_items) <> 'array' or jsonb_array_length(sale_items) < 1 or jsonb_array_length(sale_items) > 100 then
    raise exception 'A sale must contain between 1 and 100 item rows';
  end if;
  if not public.fiskalo_is_member(target_org)
     or not public.fiskalo_has_role(target_org, array['owner','administrator','manager','cashier']::public.fiskalo_organization_role[]) then
    raise exception 'Access denied';
  end if;

  select count(*) into input_count
  from jsonb_to_recordset(sale_items) as x(product_id uuid, quantity numeric);
  if input_count < 1 then
    raise exception 'Sale items are required';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(sale_items) as x(product_id uuid, quantity numeric)
    where x.product_id is null or x.quantity is null or x.quantity <= 0 or x.quantity > 100000
  ) then
    raise exception 'Each sale item needs a product and a positive quantity';
  end if;

  select jsonb_agg(jsonb_build_object('product_id', grouped.product_id, 'quantity', grouped.quantity) order by grouped.product_id)
  into normalized_items
  from (
    select x.product_id, sum(x.quantity) as quantity
    from jsonb_to_recordset(sale_items) as x(product_id uuid, quantity numeric)
    group by x.product_id
  ) grouped;

  select count(*) into valid_count
  from jsonb_to_recordset(normalized_items) as x(product_id uuid, quantity numeric)
  join public.fiskalo_products p
    on p.id = x.product_id
   and p.organization_id = target_org
   and p.is_active = true;
  if valid_count <> jsonb_array_length(normalized_items) then
    raise exception 'One or more products are unavailable or belong to another business';
  end if;

  if target_customer is not null and not exists (
    select 1 from public.fiskalo_customers c
    where c.id = target_customer and c.organization_id = target_org
  ) then
    raise exception 'Customer does not belong to this business';
  end if;

  if target_payment_method = 'cash' and not exists (
    select 1 from public.fiskalo_cashier_shifts s
    where s.organization_id = target_org and s.opened_by = actor_id and s.status = 'open'
  ) then
    raise exception 'Open a cashier shift before accepting cash';
  end if;

  request_fingerprint := md5(jsonb_build_object(
    'customer_id', target_customer,
    'payment_method', target_payment_method,
    'items', normalized_items
  )::text);

  select * into existing
  from public.fiskalo_invoices i
  where i.organization_id = target_org
    and i.created_by = actor_id
    and i.pos_request_id = request_id
  for update;

  if found then
    if existing.pos_request_fingerprint is distinct from request_fingerprint then
      raise exception 'Request ID was already used for a different sale';
    end if;
    if existing.status <> 'issued' then
      raise exception 'A previous sale request is incomplete; review its draft before retrying';
    end if;
    return query select existing.id, existing.invoice_number, existing.total, true;
    return;
  end if;

  insert into public.fiskalo_invoices(
    organization_id, created_by, customer_id, payment_method, payment_status,
    issue_date, pos_request_id, pos_request_fingerprint
  )
  values (
    target_org, actor_id, target_customer, target_payment_method, 'unpaid',
    current_date, request_id, request_fingerprint
  )
  returning id into created_invoice;

  insert into public.fiskalo_invoice_items(
    invoice_id, product_id, description, quantity, unit_price, vat_rate
  )
  select
    created_invoice, p.id, p.name, x.quantity, p.unit_price, p.vat_rate
  from jsonb_to_recordset(normalized_items) as x(product_id uuid, quantity numeric)
  join public.fiskalo_products p
    on p.id = x.product_id
   and p.organization_id = target_org
   and p.is_active = true
  order by p.id;

  created_number := public.fiskalo_issue_invoice(created_invoice);

  select i.total into created_total
  from public.fiskalo_invoices i
  where i.id = created_invoice and i.organization_id = target_org;

  if target_payment_method <> 'credit' then
    perform public.fiskalo_record_payment(
      created_invoice, created_total, target_payment_method, null
    );
  end if;

  return query select created_invoice, created_number, created_total, false;
end;
$$;

revoke all on function public.fiskalo_create_pos_sale(uuid,uuid,uuid,text,jsonb) from public, anon;
grant execute on function public.fiskalo_create_pos_sale(uuid,uuid,uuid,text,jsonb) to authenticated;
