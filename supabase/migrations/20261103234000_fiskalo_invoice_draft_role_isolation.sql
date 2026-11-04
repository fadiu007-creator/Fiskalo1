-- Restrict draft invoice editing to business managers/accountants or the cashier who created the draft.
-- Keep invoice issuance and draft edits consistent between RLS and SECURITY DEFINER RPCs.

drop policy if exists fiskalo_invoices_update_draft on public.fiskalo_invoices;
create policy fiskalo_invoices_update_draft
on public.fiskalo_invoices
for update to authenticated
using (
  status = 'draft'
  and (
    public.fiskalo_has_role(organization_id, array['owner','administrator','manager','accountant']::public.fiskalo_organization_role[])
    or (
      created_by = (select auth.uid())
      and public.fiskalo_has_role(organization_id, array['cashier']::public.fiskalo_organization_role[])
    )
  )
)
with check (
  status = 'draft'
  and (
    public.fiskalo_has_role(organization_id, array['owner','administrator','manager','accountant']::public.fiskalo_organization_role[])
    or (
      created_by = (select auth.uid())
      and public.fiskalo_has_role(organization_id, array['cashier']::public.fiskalo_organization_role[])
    )
  )
);

drop policy if exists fiskalo_invoice_items_insert on public.fiskalo_invoice_items;
create policy fiskalo_invoice_items_insert
on public.fiskalo_invoice_items
for insert to authenticated
with check (
  exists (
    select 1
    from public.fiskalo_invoices i
    where i.id = invoice_id
      and i.status = 'draft'
      and (
        public.fiskalo_has_role(i.organization_id, array['owner','administrator','manager','accountant']::public.fiskalo_organization_role[])
        or (
          i.created_by = (select auth.uid())
          and public.fiskalo_has_role(i.organization_id, array['cashier']::public.fiskalo_organization_role[])
        )
      )
  )
);

drop policy if exists fiskalo_invoice_items_update on public.fiskalo_invoice_items;
create policy fiskalo_invoice_items_update
on public.fiskalo_invoice_items
for update to authenticated
using (
  exists (
    select 1 from public.fiskalo_invoices i
    where i.id = invoice_id and i.status = 'draft'
      and (
        public.fiskalo_has_role(i.organization_id, array['owner','administrator','manager','accountant']::public.fiskalo_organization_role[])
        or (i.created_by = (select auth.uid())
          and public.fiskalo_has_role(i.organization_id, array['cashier']::public.fiskalo_organization_role[]))
      )
  )
)
with check (
  exists (
    select 1 from public.fiskalo_invoices i
    where i.id = invoice_id and i.status = 'draft'
      and (
        public.fiskalo_has_role(i.organization_id, array['owner','administrator','manager','accountant']::public.fiskalo_organization_role[])
        or (i.created_by = (select auth.uid())
          and public.fiskalo_has_role(i.organization_id, array['cashier']::public.fiskalo_organization_role[]))
      )
  )
);

drop policy if exists fiskalo_invoice_items_delete on public.fiskalo_invoice_items;
create policy fiskalo_invoice_items_delete
on public.fiskalo_invoice_items
for delete to authenticated
using (
  exists (
    select 1 from public.fiskalo_invoices i
    where i.id = invoice_id and i.status = 'draft'
      and (
        public.fiskalo_has_role(i.organization_id, array['owner','administrator','manager','accountant']::public.fiskalo_organization_role[])
        or (i.created_by = (select auth.uid())
          and public.fiskalo_has_role(i.organization_id, array['cashier']::public.fiskalo_organization_role[]))
      )
  )
);

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
  permitted boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into inv from public.fiskalo_invoices where id = target_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;

  permitted :=
    public.fiskalo_has_role(inv.organization_id, array['owner','administrator','manager','accountant']::public.fiskalo_organization_role[])
    or (
      inv.created_by = auth.uid()
      and public.fiskalo_has_role(inv.organization_id, array['cashier']::public.fiskalo_organization_role[])
    );
  if not permitted then raise exception 'You do not have permission to issue this invoice'; end if;

  if inv.status <> 'draft' then raise exception 'Only draft invoices can be issued'; end if;
  if inv.payment_status <> 'unpaid' then
    raise exception 'A draft invoice must be unpaid. Record payment separately after issuing it.';
  end if;
  if not exists (select 1 from public.fiskalo_invoice_items where invoice_id = target_invoice) then
    raise exception 'Add at least one invoice item before issuing'; end if;

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
as $function$
declare
  inv public.fiskalo_invoices%rowtype;
  item_count integer;
  valid_count integer;
  permitted boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into inv from public.fiskalo_invoices where id = target_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;

  permitted :=
    public.fiskalo_has_role(inv.organization_id, array['owner','administrator','manager','accountant']::public.fiskalo_organization_role[])
    or (
      inv.created_by = auth.uid()
      and public.fiskalo_has_role(inv.organization_id, array['cashier']::public.fiskalo_organization_role[])
    );
  if not permitted then raise exception 'You do not have permission to edit this invoice'; end if;
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
$function$;

create or replace function public.fiskalo_accept_pending_team_invitations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  accepted_count integer := 0;
  invitation record;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  select lower(email) into current_email from auth.users where id = current_user_id;
  if current_email is null then return 0; end if;

  for invitation in
    select * from public.fiskalo_team_invitations
    where lower(email) = current_email
    order by created_at
    for update
  loop
    if invitation.role not in ('administrator','manager','accountant','cashier') then
      delete from public.fiskalo_team_invitations where id = invitation.id;
      continue;
    end if;

    insert into public.fiskalo_organization_users(organization_id,user_id,role)
    values (invitation.organization_id,current_user_id,invitation.role)
    on conflict (organization_id,user_id) do nothing;

    insert into public.fiskalo_audit_logs(organization_id,actor_id,action,entity_type,entity_id,details)
    values (invitation.organization_id,current_user_id,'member.invitation_accepted','organization_user',current_user_id,
      jsonb_build_object('email',current_email,'role',invitation.role));
    delete from public.fiskalo_team_invitations where id = invitation.id;
    accepted_count := accepted_count + 1;
  end loop;
  return accepted_count;
end;
$function$;

revoke all on function public.fiskalo_issue_invoice(uuid) from public, anon;
grant execute on function public.fiskalo_issue_invoice(uuid) to authenticated;
revoke all on function public.fiskalo_update_draft_invoice(uuid,uuid,text,jsonb) from public, anon;
grant execute on function public.fiskalo_update_draft_invoice(uuid,uuid,text,jsonb) to authenticated;
revoke all on function public.fiskalo_accept_pending_team_invitations() from public, anon;
grant execute on function public.fiskalo_accept_pending_team_invitations() to authenticated;
