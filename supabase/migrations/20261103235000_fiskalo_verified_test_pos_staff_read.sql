-- Staff may read a verified TEST POS record only after they have the operational role
-- required by the certificate provisioning endpoint. Initial verification remains owner/admin-only.
drop policy if exists fiskalo_atk_pos_verifications_select on public.fiskalo_atk_pos_verifications;
create policy fiskalo_atk_pos_verifications_select
on public.fiskalo_atk_pos_verifications
for select to authenticated
using (
  public.fiskalo_has_role(
    organization_id,
    array['owner','administrator','manager','cashier']::public.fiskalo_organization_role[]
  )
  and exists (
    select 1
    from public.fiskalo_atk_pos_installations p
    where p.id = pos_installation_id
      and p.organization_id = fiskalo_atk_pos_verifications.organization_id
      and p.environment = 'test'
  )
);
