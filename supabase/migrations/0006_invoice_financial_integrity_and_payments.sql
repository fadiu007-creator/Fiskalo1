alter table public.fiskalo_invoices
  add column payment_method text not null default 'credit'
    check (payment_method in ('cash', 'card', 'bank_transfer', 'credit')),
  add column payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'partial')),
  add column paid_at timestamptz;

create or replace function public.fiskalo_guard_invoice()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
declare expected_subtotal numeric(14,2);
declare expected_vat numeric(14,2);
declare expected_total numeric(14,2);
begin
  if old.status in ('issued', 'cancelled') then
    raise exception 'Issued or cancelled invoices cannot be modified';
  end if;
  if new.organization_id is distinct from old.organization_id or new.created_by is distinct from old.created_by then
    raise exception 'Invoice ownership cannot be changed';
  end if;

  select
    coalesce(sum(li.line_subtotal), 0),
    coalesce(sum(li.line_vat), 0),
    coalesce(sum(li.line_subtotal + li.line_vat), 0)
  into expected_subtotal, expected_vat, expected_total
  from public.fiskalo_invoice_items li where li.invoice_id = old.id;

  new.subtotal := expected_subtotal;
  new.vat_total := expected_vat;
  new.total := expected_total;
  new.fiscalization_status := old.fiscalization_status;

  if new.status = 'draft' then
    if new.invoice_number is distinct from old.invoice_number then
      raise exception 'Invoice numbers are assigned only by the issue workflow';
    end if;
    new.issued_at := null;
  elsif new.status = 'issued' then
    if new.invoice_number is null or new.invoice_number !~ '^FIS-[0-9]{4}-[0-9]{6}$' then
      raise exception 'A valid system invoice number is required';
    end if;
    new.issued_at := now();
    if new.payment_status = 'paid' then
      new.paid_at := coalesce(new.paid_at, now());
    else
      new.paid_at := null;
    end if;
  else
    raise exception 'Invalid invoice status transition';
  end if;
  return new;
end;
$$;

-- Stock is changed only by the transactional invoice workflow in this MVP.
revoke update on public.fiskalo_products from authenticated;
