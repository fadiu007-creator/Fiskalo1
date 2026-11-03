-- Controlled cancellation/return requests linked to an ATK-accepted original sale.
-- This records an auditable adjustment request only; it does not claim ATK submission.
create table if not exists public.fiskalo_invoice_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fiskalo_organizations(id) on delete restrict,
  original_invoice_id uuid not null,
  original_fiscal_document_id uuid not null,
  adjustment_type text not null check (adjustment_type in ('cancel','return')),
  amount numeric(14,2) not null check (amount > 0),
  reason text not null check (length(trim(reason)) between 3 and 500),
  status text not null default 'awaiting_atk'
    check (status in ('awaiting_atk','submitted','accepted','rejected','voided')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (original_invoice_id, organization_id)
    references public.fiskalo_invoices(id, organization_id) on delete restrict,
  foreign key (original_fiscal_document_id, organization_id)
    references public.fiskalo_atk_fiscal_documents(id, organization_id) on delete restrict
);
create index if not exists fiskalo_adjustments_org_date_idx
  on public.fiskalo_invoice_adjustments(organization_id, created_at desc);
create index if not exists fiskalo_adjustments_original_idx
  on public.fiskalo_invoice_adjustments(original_invoice_id, created_at);

alter table public.fiskalo_invoice_adjustments enable row level security;
revoke all on public.fiskalo_invoice_adjustments from public, anon, authenticated;
create policy fiskalo_invoice_adjustments_select on public.fiskalo_invoice_adjustments
  for select to authenticated using (public.fiskalo_is_member(organization_id));
grant select on public.fiskalo_invoice_adjustments to authenticated;

create or replace function public.fiskalo_create_invoice_adjustment(
  target_invoice uuid,
  adjustment_kind text,
  target_amount numeric,
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
  already_adjusted numeric(14,2);
  new_id uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if adjustment_kind not in ('cancel','return') then raise exception 'Unsupported adjustment type'; end if;
  if target_amount is null or target_amount <= 0 or target_amount <> round(target_amount, 2) then
    raise exception 'Adjustment amount must be positive and limited to cents';
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

  select coalesce(sum(amount),0) into already_adjusted
    from public.fiskalo_invoice_adjustments
    where original_invoice_id = invoice_row.id
      and status <> 'voided';

  if adjustment_kind = 'cancel' then
    if target_amount <> invoice_row.total then raise exception 'A cancellation must cover the full original invoice amount'; end if;
    if already_adjusted > 0 then raise exception 'This invoice already has a cancellation or return request'; end if;
  else
    if already_adjusted + target_amount > invoice_row.total then
      raise exception 'The cumulative return amount cannot exceed the original invoice total';
    end if;
    if exists (select 1 from public.fiskalo_invoice_adjustments
      where original_invoice_id = invoice_row.id and adjustment_type = 'cancel' and status <> 'voided') then
      raise exception 'A cancelled invoice cannot receive an additional return';
    end if;
  end if;

  insert into public.fiskalo_invoice_adjustments (
    organization_id, original_invoice_id, original_fiscal_document_id,
    adjustment_type, amount, reason, created_by
  ) values (
    invoice_row.organization_id, invoice_row.id, fiscal_row.id,
    adjustment_kind, target_amount, trim(adjustment_reason), actor
  ) returning id into new_id;

  insert into public.fiskalo_audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, details
  ) values (
    invoice_row.organization_id, actor, 'invoice_adjustment_requested',
    'invoice_adjustment', new_id,
    jsonb_build_object(
      'type', adjustment_kind,
      'amount', target_amount,
      'reason', trim(adjustment_reason),
      'original_invoice_id', invoice_row.id,
      'original_fiscal_document_id', fiscal_row.id,
      'original_coupon_id', fiscal_row.coupon_id,
      'original_atk_transaction_id', fiscal_row.atk_transaction_id
    )
  );
  return new_id;
end;
$$;

revoke all on function public.fiskalo_create_invoice_adjustment(uuid,text,numeric,text) from public, anon;
grant execute on function public.fiskalo_create_invoice_adjustment(uuid,text,numeric,text) to authenticated;
