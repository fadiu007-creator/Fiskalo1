create or replace function public.fiskalo_set_invoice_adjustment_atk_status(
  target_adjustment uuid,
  target_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_current_status text;
  v_document_status text;
  v_transaction_id numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if target_status not in ('submitted', 'accepted', 'rejected') then
    raise exception 'Unsupported ATK adjustment status';
  end if;

  select organization_id, status
    into v_organization_id, v_current_status
  from public.fiskalo_invoice_adjustments
  where id = target_adjustment
  for update;

  if not found then
    raise exception 'Adjustment not found';
  end if;

  if not public.fiskalo_has_role(
    v_organization_id,
    array['owner','administrator','manager','accountant']::public.fiskalo_organization_role[]
  ) then
    raise exception 'Insufficient permission to update ATK adjustment status';
  end if;

  select status, atk_transaction_id
    into v_document_status, v_transaction_id
  from public.fiskalo_atk_fiscal_documents
  where source_adjustment_id = target_adjustment
    and organization_id = v_organization_id;

  if not found then
    raise exception 'Linked ATK fiscal document not found';
  end if;

  if target_status = 'submitted' then
    if v_current_status <> 'awaiting_atk' or v_document_status not in ('queued','submitted','offline_pending') then
      raise exception 'Invalid transition to submitted';
    end if;
  elsif target_status = 'accepted' then
    if v_current_status not in ('awaiting_atk','submitted')
       or v_document_status <> 'accepted'
       or v_transaction_id is null
       or v_transaction_id <= 0 then
      raise exception 'ATK acceptance is not confirmed';
    end if;
  elsif target_status = 'rejected' then
    if v_current_status not in ('awaiting_atk','submitted') or v_document_status <> 'rejected' then
      raise exception 'ATK rejection is not confirmed';
    end if;
  end if;

  update public.fiskalo_invoice_adjustments
  set status = target_status, updated_at = now()
  where id = target_adjustment
    and organization_id = v_organization_id;

  return true;
end;
$$;

revoke all on function public.fiskalo_set_invoice_adjustment_atk_status(uuid, text) from public, anon;
grant execute on function public.fiskalo_set_invoice_adjustment_atk_status(uuid, text) to authenticated;
