-- Item-level invoice return/cancellation ledger.
-- This records exact quantities and tax amounts before ATK submission is enabled.
create unique index if not exists fiskalo_invoice_adjustments_id_org_uq
  on public.fiskalo_invoice_adjustments(id, organization_id);

create table if not exists public.fiskalo_invoice_adjustment_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  adjustment_id uuid not null,
  original_invoice_item_id uuid not null references public.fiskalo_invoice_items(id) on delete restrict,
  product_id uuid,
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,4) not null check (unit_price >= 0),
  net_amount numeric(14,2) not null check (net_amount >= 0),
  vat_amount numeric(14,2) not null check (vat_amount >= 0),
  total_amount numeric(14,2) not null check (total_amount > 0),
  created_at timestamptz not null default now(),
  foreign key (adjustment_id, organization_id)
    references public.fiskalo_invoice_adjustments(id, organization_id) on delete restrict,
  check (total_amount = net_amount + vat_amount)
);

create index if not exists fiskalo_adjustment_items_adjustment_idx
  on public.fiskalo_invoice_adjustment_items(adjustment_id);
create index if not exists fiskalo_adjustment_items_original_idx
  on public.fiskalo_invoice_adjustment_items(original_invoice_item_id);

alter table public.fiskalo_invoice_adjustment_items enable row level security;
revoke all on public.fiskalo_invoice_adjustment_items from public, anon, authenticated;
create policy fiskalo_adjustment_items_select on public.fiskalo_invoice_adjustment_items
  for select to authenticated using (public.fiskalo_is_member(organization_id));
grant select on public.fiskalo_invoice_adjustment_items to authenticated;

create or replace function public.fiskalo_create_invoice_adjustment_v2(
  target_invoice uuid,
  adjustment_kind text,
  target_items jsonb,
  adjustment_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  invoice_row public.fiskalo_invoices%rowtype;
  fiscal_row public.fiskalo_atk_fiscal_documents%rowtype;
  invoice_item record;
  requested_item jsonb;
  requested_quantity numeric(14,3);
  remaining_quantity numeric(14,3);
  net_value numeric(14,2);
  vat_value numeric(14,2);
  total_value numeric(14,2);
  calculated_total numeric(14,2) := 0;
  new_id uuid;
  seen_ids uuid[] := array[]::uuid[];
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if adjustment_kind not in ('cancel','return') then raise exception 'Unsupported adjustment type'; end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) = 0 then
    raise exception 'Select at least one invoice item';
  end if;
  if length(trim(coalesce(adjustment_reason,''))) < 3 or length(trim(adjustment_reason)) > 500 then
    raise exception 'A reason between 3 and 500 characters is required';
  end if;

  select * into invoice_row from public.fiskalo_invoices
    where id = target_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if not public.fiskalo_has_role(invoice_row.organization_id,
    array['owner','administrator','manager','accountant']::public.fiskalo_organization_role[]) then
    raise exception 'You do not have permission to request an invoice adjustment';
  end if;
  if invoice_row.status <> 'issued' or invoice_row.payment_status <> 'paid' then
    raise exception 'Only fully paid and issued invoices can be adjusted';
  end if;

  select * into fiscal_row from public.fiskalo_atk_fiscal_documents
    where organization_id = invoice_row.organization_id
      and source_invoice_id = invoice_row.id
      and document_type = 'sale'
    order by created_at desc limit 1;
  if not found or fiscal_row.status <> 'accepted' or fiscal_row.atk_transaction_id is null then
    raise exception 'An ATK-accepted original sale is required before creating a cancellation or return';
  end if;

  if exists (
    select 1 from public.fiskalo_invoice_adjustments a
    where a.original_invoice_id = invoice_row.id and a.status <> 'voided'
      and not exists (
        select 1 from public.fiskalo_invoice_adjustment_items ai
        where ai.adjustment_id = a.id
      )
  ) then
    raise exception 'An earlier amount-only adjustment request must be voided or reviewed before item-level adjustments can continue';
  end if;

  if adjustment_kind = 'cancel' and exists (
    select 1 from public.fiskalo_invoice_adjustments
    where original_invoice_id = invoice_row.id and status <> 'voided'
  ) then
    raise exception 'This invoice already has a cancellation or return request';
  end if;
  if adjustment_kind = 'return' and exists (
    select 1 from public.fiskalo_invoice_adjustments
    where original_invoice_id = invoice_row.id and adjustment_type = 'cancel' and status <> 'voided'
  ) then
    raise exception 'A cancelled invoice cannot receive an additional return';
  end if;

  for requested_item in select value from jsonb_array_elements(target_items)
  loop
    if (requested_item->>'invoice_item_id') is null
      or (requested_item->>'quantity') is null then
      raise exception 'Each returned item requires an invoice item ID and quantity';
    end if;
    if (requested_item->>'invoice_item_id')::uuid = any(seen_ids) then
      raise exception 'Duplicate invoice item in adjustment';
    end if;
    seen_ids := array_append(seen_ids, (requested_item->>'invoice_item_id')::uuid);
    requested_quantity := (requested_item->>'quantity')::numeric;
    if requested_quantity <= 0 or requested_quantity <> round(requested_quantity, 3) then
      raise exception 'Return quantity must be positive and limited to three decimals';
    end if;

    select ii.id, ii.product_id, ii.description, ii.quantity, ii.unit_price,
      ii.line_subtotal, ii.line_vat
      into invoice_item
      from public.fiskalo_invoice_items ii
      where ii.id = (requested_item->>'invoice_item_id')::uuid
        and ii.invoice_id = invoice_row.id;
    if not found then raise exception 'An adjustment item does not belong to the original invoice'; end if;

    select coalesce(sum(ai.quantity),0) into remaining_quantity
      from public.fiskalo_invoice_adjustment_items ai
      join public.fiskalo_invoice_adjustments a
        on a.id = ai.adjustment_id and a.organization_id = ai.organization_id
      where ai.original_invoice_item_id = invoice_item.id
        and a.status <> 'voided';
    remaining_quantity := invoice_item.quantity - remaining_quantity;
    if requested_quantity > remaining_quantity then
      raise exception 'Return quantity exceeds the remaining quantity for item: %', invoice_item.description;
    end if;
    if adjustment_kind = 'cancel' and requested_quantity <> invoice_item.quantity then
      raise exception 'A cancellation must include the full quantity of every original invoice item';
    end if;

    select
      invoice_item.line_subtotal - coalesce(sum(ai.net_amount),0),
      invoice_item.line_vat - coalesce(sum(ai.vat_amount),0)
      into net_value, vat_value
      from public.fiskalo_invoice_adjustment_items ai
      join public.fiskalo_invoice_adjustments a
        on a.id = ai.adjustment_id and a.organization_id = ai.organization_id
      where ai.original_invoice_item_id = invoice_item.id and a.status <> 'voided';
    if requested_quantity < remaining_quantity then
      net_value := round(net_value * requested_quantity / remaining_quantity, 2);
      vat_value := round(vat_value * requested_quantity / remaining_quantity, 2);
    end if;
    total_value := net_value + vat_value;
    if total_value <= 0 then raise exception 'Adjustment item total must be greater than zero'; end if;
    calculated_total := calculated_total + total_value;
  end loop;

  if adjustment_kind = 'cancel' and cardinality(seen_ids) <> (
    select count(*) from public.fiskalo_invoice_items where invoice_id = invoice_row.id
  ) then
    raise exception 'A cancellation must include every original invoice item';
  end if;
  if calculated_total <= 0 or calculated_total > invoice_row.total then
    raise exception 'Calculated adjustment total is outside the original invoice amount';
  end if;
  if adjustment_kind = 'cancel' and calculated_total <> invoice_row.total then
    raise exception 'A cancellation must reconcile to the full original invoice total';
  end if;

  insert into public.fiskalo_invoice_adjustments (
    organization_id, original_invoice_id, original_fiscal_document_id,
    adjustment_type, amount, reason, created_by
  ) values (
    invoice_row.organization_id, invoice_row.id, fiscal_row.id,
    adjustment_kind, calculated_total, trim(adjustment_reason), actor
  ) returning id into new_id;

  for requested_item in select value from jsonb_array_elements(target_items)
  loop
    select ii.id, ii.product_id, ii.description, ii.quantity, ii.unit_price,
      ii.line_subtotal, ii.line_vat
      into invoice_item
      from public.fiskalo_invoice_items ii
      where ii.id = (requested_item->>'invoice_item_id')::uuid
        and ii.invoice_id = invoice_row.id;
    requested_quantity := (requested_item->>'quantity')::numeric;
    select invoice_item.quantity - coalesce(sum(ai.quantity),0)
      into remaining_quantity
      from public.fiskalo_invoice_adjustment_items ai
      join public.fiskalo_invoice_adjustments a
        on a.id = ai.adjustment_id and a.organization_id = ai.organization_id
      where ai.original_invoice_item_id = invoice_item.id and a.status <> 'voided';
    select
      invoice_item.line_subtotal - coalesce(sum(ai.net_amount),0),
      invoice_item.line_vat - coalesce(sum(ai.vat_amount),0)
      into net_value, vat_value
      from public.fiskalo_invoice_adjustment_items ai
      join public.fiskalo_invoice_adjustments a
        on a.id = ai.adjustment_id and a.organization_id = ai.organization_id
      where ai.original_invoice_item_id = invoice_item.id and a.status <> 'voided';
    if requested_quantity < remaining_quantity then
      net_value := round(net_value * requested_quantity / remaining_quantity, 2);
      vat_value := round(vat_value * requested_quantity / remaining_quantity, 2);
    end if;
    total_value := net_value + vat_value;
    insert into public.fiskalo_invoice_adjustment_items (
      organization_id, adjustment_id, original_invoice_item_id, product_id,
      description, quantity, unit_price, net_amount, vat_amount, total_amount
    ) values (
      invoice_row.organization_id, new_id, invoice_item.id, invoice_item.product_id,
      invoice_item.description, requested_quantity, invoice_item.unit_price,
      net_value, vat_value, total_value
    );
  end loop;

  insert into public.fiskalo_audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, details
  ) values (
    invoice_row.organization_id, actor, 'invoice_adjustment_requested',
    'invoice_adjustment', new_id,
    jsonb_build_object(
      'type', adjustment_kind,
      'amount', calculated_total,
      'reason', trim(adjustment_reason),
      'original_invoice_id', invoice_row.id,
      'original_fiscal_document_id', fiscal_row.id,
      'original_coupon_id', fiscal_row.coupon_id,
      'original_atk_transaction_id', fiscal_row.atk_transaction_id,
      'item_count', cardinality(seen_ids)
    )
  );
  return new_id;
end;
$$;

revoke all on function public.fiskalo_create_invoice_adjustment_v2(uuid,text,jsonb,text) from public, anon;
grant execute on function public.fiskalo_create_invoice_adjustment_v2(uuid,text,jsonb,text) to authenticated;
