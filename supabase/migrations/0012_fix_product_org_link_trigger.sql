-- Fix product/expense trigger evaluation: invoice-only NEW.customer_id
-- must only be accessed when this trigger is running for fiskalo_invoices.
create or replace function public.fiskalo_validate_org_links()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  linked_org uuid;
begin
  if tg_table_name in ('fiskalo_products', 'fiskalo_expenses', 'fiskalo_invoices') then
    if new.branch_id is not null then
      select organization_id into linked_org
      from public.fiskalo_branches
      where id = new.branch_id;

      if linked_org is distinct from new.organization_id then
        raise exception 'Branch must belong to the same business';
      end if;
    end if;
  end if;

  if tg_table_name = 'fiskalo_invoices' then
    if new.customer_id is not null then
      select organization_id into linked_org
      from public.fiskalo_customers
      where id = new.customer_id;

      if linked_org is distinct from new.organization_id then
        raise exception 'Customer must belong to the same business';
      end if;
    end if;
  end if;

  if tg_table_name = 'fiskalo_inventory_movements' then
    select organization_id into linked_org
    from public.fiskalo_products
    where id = new.product_id;

    if linked_org is distinct from new.organization_id then
      raise exception 'Product must belong to the same business';
    end if;
  end if;

  return new;
end;
$$;
