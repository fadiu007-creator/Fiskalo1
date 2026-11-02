-- Draft invoices remain unpaid until actual money is received and recorded.
create or replace function public.fiskalo_update_draft_invoice(
  target_invoice uuid,
  target_customer uuid,
  target_payment_method text,
  target_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv public.fiskalo_invoices%rowtype;
  item_count integer;
  valid_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into inv from public.fiskalo_invoices where id = target_invoice for update;
  if not found or not public.fiskalo_is_member(inv.organization_id) then
    raise exception 'Invoice not found or access denied';
  end if;
  if inv.status <> 'draft' then raise exception 'Only draft invoices can be edited'; end if;
  if target_payment_method not in ('cash', 'card', 'bank_transfer', 'credit') then
    raise exception 'Unsupported payment method';
  end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) = 0 then
    raise exception 'A draft must contain at least one item';
  end if;
  if target_customer is not null and not exists (
    select 1 from public.fiskalo_customers c
    where c.id = target_customer and c.organization_id = inv.organization_id
  ) then raise exception 'Customer must belong to the same business'; end if;
  select count(*) into item_count from jsonb_array_elements(target_items) as x(value);
  select count(*) into valid_count
  from jsonb_array_elements(target_items) as x(value)
  join public.fiskalo_products p on p.id = (x.value->>'product_id')::uuid
   and p.organization_id = inv.organization_id
  where (x.value->>'quantity')::numeric > 0;
  if valid_count <> item_count then
    raise exception 'One or more items are invalid or belong to another business';
  end if;
  delete from public.fiskalo_invoice_items where invoice_id = target_invoice;
  insert into public.fiskalo_invoice_items(invoice_id, product_id, description, quantity, unit_price, vat_rate)
  select target_invoice, p.id, p.name, (x.value->>'quantity')::numeric, p.unit_price, p.vat_rate
  from jsonb_array_elements(target_items) as x(value)
  join public.fiskalo_products p on p.id = (x.value->>'product_id')::uuid
   and p.organization_id = inv.organization_id;
  update public.fiskalo_invoices
  set customer_id = target_customer,
      payment_method = target_payment_method,
      payment_status = 'unpaid',
      paid_at = null
  where id = target_invoice;
  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (inv.organization_id, auth.uid(), 'invoice.draft_updated', 'invoice', target_invoice,
    jsonb_build_object('items', item_count, 'customer_id', target_customer, 'payment_method', target_payment_method));
end;
$$;