create or replace function public.fiskalo_sync_adjustment_fiscal_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.source_adjustment_id is null then
    return new;
  end if;

  update public.fiskalo_invoice_adjustments
  set status = case
    when new.status = 'accepted' then 'accepted'
    when new.status = 'rejected' then 'rejected'
    when new.status in ('submitted','offline_pending') then 'submitted'
    else status
  end,
  updated_at = now()
  where id = new.source_adjustment_id
    and organization_id = new.organization_id
    and status <> 'voided';

  return new;
end;
$$;

revoke all on function public.fiskalo_sync_adjustment_fiscal_status() from public, anon, authenticated;

drop trigger if exists fiskalo_sync_adjustment_fiscal_status
  on public.fiskalo_atk_fiscal_documents;

create trigger fiskalo_sync_adjustment_fiscal_status
after insert or update of status
on public.fiskalo_atk_fiscal_documents
for each row
execute function public.fiskalo_sync_adjustment_fiscal_status();
