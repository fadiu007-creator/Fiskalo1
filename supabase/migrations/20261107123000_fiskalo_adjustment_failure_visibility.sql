alter table public.fiskalo_invoice_adjustments
  add column if not exists failure_reason text;

drop function if exists public.fiskalo_reject_invoice_adjustment_preflight(uuid);
create or replace function public.fiskalo_reject_invoice_adjustment_preflight(
  target_adjustment uuid,
  target_detail text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_current_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select organization_id, status into v_organization_id, v_current_status
  from public.fiskalo_invoice_adjustments where id = target_adjustment for update;
  if not found then raise exception 'Adjustment not found'; end if;
  if not public.fiskalo_has_role(v_organization_id,
    array['owner','administrator','manager','accountant']::public.fiskalo_organization_role[]) then
    raise exception 'Insufficient permission to close adjustment';
  end if;
  if v_current_status = 'rejected' then
    update public.fiskalo_invoice_adjustments
    set failure_reason = coalesce(nullif(left(trim(target_detail),1200),''),failure_reason),
        updated_at = now()
    where id = target_adjustment and organization_id = v_organization_id;
    return true;
  end if;
  if v_current_status <> 'awaiting_atk' then return false; end if;
  if exists (select 1 from public.fiskalo_atk_fiscal_documents
    where source_adjustment_id = target_adjustment and organization_id = v_organization_id) then return false; end if;
  update public.fiskalo_invoice_adjustments
  set status = 'rejected',
      failure_reason = nullif(left(trim(coalesce(target_detail,'')),1200),''),
      updated_at = now()
  where id = target_adjustment and organization_id = v_organization_id and status = 'awaiting_atk';
  return found;
end;
$$;
revoke all on function public.fiskalo_reject_invoice_adjustment_preflight(uuid,text) from public, anon;
grant execute on function public.fiskalo_reject_invoice_adjustment_preflight(uuid,text) to authenticated;
