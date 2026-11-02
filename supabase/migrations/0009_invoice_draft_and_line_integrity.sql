create or replace function public.fiskalo_initialize_invoice()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.status <> 'draft' then raise exception 'Invoices must be created as drafts'; end if;
  new.invoice_number := null;
  new.subtotal := 0;
  new.vat_total := 0;
  new.total := 0;
  new.fiscalization_status := 'not_fiscalized';
  new.issued_at := null;
  new.paid_at := null;
  return new;
end;
$$;
create trigger fiskalo_invoice_initialize before insert on public.fiskalo_invoices
for each row execute function public.fiskalo_initialize_invoice();

create or replace function public.fiskalo_refresh_invoice_totals()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
declare old_invoice_id uuid;
declare new_invoice_id uuid;
begin
  if tg_op <> 'INSERT' then old_invoice_id := old.invoice_id; end if;
  if tg_op <> 'DELETE' then new_invoice_id := new.invoice_id; end if;

  if old_invoice_id is not null and old_invoice_id is distinct from new_invoice_id then
    update public.fiskalo_invoices i
      set subtotal = coalesce((select sum(li.line_subtotal) from public.fiskalo_invoice_items li where li.invoice_id = old_invoice_id), 0),
          vat_total = coalesce((select sum(li.line_vat) from public.fiskalo_invoice_items li where li.invoice_id = old_invoice_id), 0),
          total = coalesce((select sum(li.line_subtotal + li.line_vat) from public.fiskalo_invoice_items li where li.invoice_id = old_invoice_id), 0)
    where i.id = old_invoice_id and i.status = 'draft';
  end if;

  if new_invoice_id is not null then
    update public.fiskalo_invoices i
      set subtotal = coalesce((select sum(li.line_subtotal) from public.fiskalo_invoice_items li where li.invoice_id = new_invoice_id), 0),
          vat_total = coalesce((select sum(li.line_vat) from public.fiskalo_invoice_items li where li.invoice_id = new_invoice_id), 0),
          total = coalesce((select sum(li.line_subtotal + li.line_vat) from public.fiskalo_invoice_items li where li.invoice_id = new_invoice_id), 0)
    where i.id = new_invoice_id and i.status = 'draft';
  end if;
  return coalesce(new, old);
end;
$$;
