alter table public.fiskalo_atk_fiscal_documents
  add column if not exists source_adjustment_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fiskalo_atk_docs_source_adjustment_fk'
      and conrelid = 'public.fiskalo_atk_fiscal_documents'::regclass
  ) then
    alter table public.fiskalo_atk_fiscal_documents
      add constraint fiskalo_atk_docs_source_adjustment_fk
      foreign key (source_adjustment_id)
      references public.fiskalo_invoice_adjustments(id)
      on delete restrict;
  end if;
end;
$$;

create unique index if not exists fiskalo_atk_docs_source_adjustment_unique
  on public.fiskalo_atk_fiscal_documents(source_adjustment_id)
  where source_adjustment_id is not null;

create index if not exists fiskalo_atk_docs_reference_coupon_idx
  on public.fiskalo_atk_fiscal_documents(organization_id, reference_coupon_id)
  where reference_coupon_id is not null;
