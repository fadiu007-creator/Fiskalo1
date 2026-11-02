alter table public.fiskalo_products
  add constraint fiskalo_products_stock_nonnegative check (stock_quantity >= 0);

create or replace function public.fiskalo_validate_org_links()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare linked_org uuid;
begin
  if tg_table_name = 'fiskalo_products' or tg_table_name = 'fiskalo_expenses' or tg_table_name = 'fiskalo_invoices' then
    if new.branch_id is not null then
      select organization_id into linked_org from public.fiskalo_branches where id = new.branch_id;
      if linked_org is distinct from new.organization_id then raise exception 'Branch must belong to the same business'; end if;
    end if;
  end if;
  if tg_table_name = 'fiskalo_invoices' and new.customer_id is not null then
    select organization_id into linked_org from public.fiskalo_customers where id = new.customer_id;
    if linked_org is distinct from new.organization_id then raise exception 'Customer must belong to the same business'; end if;
  end if;
  if tg_table_name = 'fiskalo_inventory_movements' then
    select organization_id into linked_org from public.fiskalo_products where id = new.product_id;
    if linked_org is distinct from new.organization_id then raise exception 'Product must belong to the same business'; end if;
  end if;
  return new;
end;
$$;

create trigger fiskalo_products_org_link before insert or update on public.fiskalo_products
for each row execute function public.fiskalo_validate_org_links();
create trigger fiskalo_expenses_org_link before insert or update on public.fiskalo_expenses
for each row execute function public.fiskalo_validate_org_links();
create trigger fiskalo_invoices_org_link before insert or update on public.fiskalo_invoices
for each row execute function public.fiskalo_validate_org_links();
create trigger fiskalo_movements_org_link before insert or update on public.fiskalo_inventory_movements
for each row execute function public.fiskalo_validate_org_links();

create or replace function public.fiskalo_validate_invoice_item_product()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare invoice_org uuid;
declare product_org uuid;
begin
  if new.product_id is null then return new; end if;
  select organization_id into invoice_org from public.fiskalo_invoices where id = new.invoice_id;
  select organization_id into product_org from public.fiskalo_products where id = new.product_id;
  if invoice_org is null or product_org is distinct from invoice_org then
    raise exception 'Invoice item product must belong to the same business as the invoice';
  end if;
  return new;
end;
$$;
create trigger fiskalo_invoice_item_product_org before insert or update on public.fiskalo_invoice_items
for each row execute function public.fiskalo_validate_invoice_item_product();

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

  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (inv.organization_id, auth.uid(), 'invoice.issued', 'invoice', target_invoice, jsonb_build_object('invoice_number', result_number, 'total', inv.total));
  return result_number;
end;
$$;
revoke all on function public.fiskalo_issue_invoice(uuid) from public;
grant execute on function public.fiskalo_issue_invoice(uuid) to authenticated;

create or replace function public.fiskalo_add_existing_member(target_org uuid, target_email text, target_role public.fiskalo_organization_role)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare target_user uuid;
declare existing_role public.fiskalo_organization_role;
begin
  if not public.fiskalo_has_role(target_org, array['owner','administrator']::public.fiskalo_organization_role[]) then
    raise exception 'Only owners and administrators can manage team members';
  end if;
  if target_role = 'owner' then raise exception 'Owner role cannot be assigned through invitations'; end if;
  if target_role = 'administrator' and not public.fiskalo_has_role(target_org, array['owner']::public.fiskalo_organization_role[]) then
    raise exception 'Only the owner can assign administrator access';
  end if;
  select id into target_user from auth.users where lower(email) = lower(trim(target_email)) limit 1;
  if target_user is null then raise exception 'No account found for this email. Ask the person to register first.'; end if;
  select role into existing_role from public.fiskalo_organization_users where organization_id = target_org and user_id = target_user;
  if existing_role = 'owner' then raise exception 'The owner role cannot be changed'; end if;
  if existing_role = 'administrator' and not public.fiskalo_has_role(target_org, array['owner']::public.fiskalo_organization_role[]) then
    raise exception 'Only the owner can change administrator access';
  end if;
  insert into public.fiskalo_organization_users(organization_id, user_id, role)
  values (target_org, target_user, target_role)
  on conflict (organization_id, user_id) do update set role = excluded.role;
  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (target_org, auth.uid(), 'member.added_or_updated', 'organization_user', target_user, jsonb_build_object('email', lower(trim(target_email)), 'role', target_role));
  return target_user;
end;
$$;
revoke all on function public.fiskalo_add_existing_member(uuid, text, public.fiskalo_organization_role) from public;
grant execute on function public.fiskalo_add_existing_member(uuid, text, public.fiskalo_organization_role) to authenticated;

create or replace function public.fiskalo_remove_member(target_org uuid, target_user uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare target_role public.fiskalo_organization_role;
begin
  if not public.fiskalo_has_role(target_org, array['owner','administrator']::public.fiskalo_organization_role[]) then
    raise exception 'Only owners and administrators can manage team members';
  end if;
  if target_user = auth.uid() then raise exception 'You cannot remove your own access'; end if;
  select role into target_role from public.fiskalo_organization_users where organization_id = target_org and user_id = target_user;
  if target_role = 'owner' then raise exception 'The owner cannot be removed'; end if;
  if target_role = 'administrator' and not public.fiskalo_has_role(target_org, array['owner']::public.fiskalo_organization_role[]) then
    raise exception 'Only the owner can remove an administrator';
  end if;
  delete from public.fiskalo_organization_users where organization_id = target_org and user_id = target_user;
  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'member.removed', 'organization_user', target_user);
end;
$$;
revoke all on function public.fiskalo_remove_member(uuid, uuid) from public;
grant execute on function public.fiskalo_remove_member(uuid, uuid) to authenticated;
