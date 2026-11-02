create table public.fiskalo_document_counters (
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  document_type text not null,
  document_year integer not null,
  next_value bigint not null default 1 check (next_value > 0),
  primary key (organization_id, document_type, document_year)
);
alter table public.fiskalo_document_counters enable row level security;
create policy fiskalo_counter_read on public.fiskalo_document_counters for select to authenticated
using (public.fiskalo_is_member(organization_id));
grant select on public.fiskalo_document_counters to authenticated;

create or replace function public.fiskalo_create_organization(payload jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare new_org_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(payload->>'legal_name'), '') is null
    or nullif(trim(payload->>'nui'), '') is null
    or nullif(trim(payload->>'municipality'), '') is null then
    raise exception 'Business name, NUI and municipality are required';
  end if;

  insert into public.fiskalo_organizations (
    created_by, legal_name, nui, municipality, address, phone, email, vat_registered,
    trade_name, fiscal_number, business_type, business_activity
  ) values (
    auth.uid(), trim(payload->>'legal_name'), trim(payload->>'nui'), trim(payload->>'municipality'),
    nullif(trim(payload->>'address'), ''), nullif(trim(payload->>'phone'), ''),
    nullif(trim(payload->>'email'), ''), coalesce((payload->>'vat_registered')::boolean, false),
    nullif(trim(payload->>'trade_name'), ''), nullif(trim(payload->>'fiscal_number'), ''),
    nullif(trim(payload->>'business_type'), ''), nullif(trim(payload->>'business_activity'), '')
  ) returning id into new_org_id;

  insert into public.fiskalo_organization_users(organization_id, user_id, role)
  values (new_org_id, auth.uid(), 'owner');

  insert into public.fiskalo_branches(organization_id, name, address, municipality, phone)
  values (new_org_id, 'Lokacioni kryesor', nullif(trim(payload->>'address'), ''), trim(payload->>'municipality'), nullif(trim(payload->>'phone'), ''));

  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id)
  values (new_org_id, auth.uid(), 'organization.created', 'organization', new_org_id);
  return new_org_id;
end;
$$;
revoke all on function public.fiskalo_create_organization(jsonb) from public;
grant execute on function public.fiskalo_create_organization(jsonb) to authenticated;

create or replace function public.fiskalo_issue_invoice(target_invoice uuid)
returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare inv public.fiskalo_invoices%rowtype;
declare seq_value bigint;
declare year_value integer := extract(year from current_date)::integer;
declare result_number text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into inv from public.fiskalo_invoices where id = target_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if not public.fiskalo_is_member(inv.organization_id) then raise exception 'Access denied'; end if;
  if inv.status <> 'draft' then raise exception 'Only draft invoices can be issued'; end if;
  if not exists (select 1 from public.fiskalo_invoice_items where invoice_id = target_invoice) then
    raise exception 'Add at least one invoice item before issuing';
  end if;

  insert into public.fiskalo_document_counters(organization_id, document_type, document_year, next_value)
  values (inv.organization_id, 'invoice', year_value, 2)
  on conflict (organization_id, document_type, document_year)
  do update set next_value = public.fiskalo_document_counters.next_value + 1
  returning next_value - 1 into seq_value;

  result_number := 'FIS-' || year_value::text || '-' || lpad(seq_value::text, 6, '0');
  update public.fiskalo_invoices
    set invoice_number = result_number, status = 'issued', issued_at = now()
    where id = target_invoice;

  insert into public.fiskalo_audit_logs(organization_id, actor_id, action, entity_type, entity_id, details)
  values (inv.organization_id, auth.uid(), 'invoice.issued', 'invoice', target_invoice, jsonb_build_object('invoice_number', result_number, 'total', inv.total));
  return result_number;
end;
$$;
revoke all on function public.fiskalo_issue_invoice(uuid) from public;
grant execute on function public.fiskalo_issue_invoice(uuid) to authenticated;
