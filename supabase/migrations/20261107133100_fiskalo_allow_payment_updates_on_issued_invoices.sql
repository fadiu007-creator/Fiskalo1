create or replace function public.fiskalo_guard_invoice()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  expected_subtotal numeric(14,2);
  expected_vat numeric(14,2);
  expected_total numeric(14,2);
  expected_discount numeric(14,2);
begin
  if old.status = 'cancelled' then
    raise exception 'Cancelled invoices cannot be modified';
  end if;

  -- Issued invoice content remains immutable, but payment ledger updates must
  -- be allowed to change only the payment fields.
  if old.status = 'issued' then
    if (to_jsonb(new) - array['payment_status','payment_method','paid_at'])
       is distinct from
       (to_jsonb(old) - array['payment_status','payment_method','paid_at']) then
      raise exception 'Issued invoice details are immutable; only payment records may change';
    end if;

    if new.payment_status = 'paid' then
      new.paid_at := coalesce(new.paid_at, now());
    else
      new.paid_at := null;
    end if;
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.created_by is distinct from old.created_by then
    raise exception 'Invoice ownership cannot be changed';
  end if;

  select
    coalesce(sum(li.line_subtotal), 0),
    coalesce(sum(li.line_vat), 0),
    coalesce(sum(li.line_subtotal + li.line_vat), 0),
    coalesce(sum(
      round(li.quantity * li.unit_price, 2)
      + round(li.quantity * li.unit_price * li.vat_rate / 100, 2)
      - li.line_subtotal - li.line_vat
    ), 0)
  into expected_subtotal, expected_vat, expected_total, expected_discount
  from public.fiskalo_invoice_items li
  where li.invoice_id = old.id;

  new.subtotal := expected_subtotal;
  new.vat_total := expected_vat;
  new.total := expected_total;
  new.discount_total := expected_discount;
  new.fiscalization_status := old.fiscalization_status;

  if new.status = 'draft' then
    if new.invoice_number is distinct from old.invoice_number then
      raise exception 'Invoice numbers are assigned only by the issue workflow';
    end if;
    new.issued_at := null;
  elsif new.status = 'issued' then
    if new.invoice_number is null
       or new.invoice_number !~ '^FIS-[0-9]{4}-[0-9]{6}$' then
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