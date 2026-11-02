drop policy if exists fiskalo_invoices_update_draft on public.fiskalo_invoices;
create policy fiskalo_invoices_update_draft on public.fiskalo_invoices for update to authenticated
using (status = 'draft' and public.fiskalo_is_member(organization_id))
with check (status = 'draft' and public.fiskalo_is_member(organization_id));

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
  values (inv.organization_id, auth.uid(), 'invoice.issued', 'invoice', target_invoice, jsonb_build_object('invoice_number', result_number, 'total', inv.total));
  return result_number;
end;
$$;
revoke all on function public.fiskalo_issue_invoice(uuid) from public;
grant execute on function public.fiskalo_issue_invoice(uuid) to authenticated;
