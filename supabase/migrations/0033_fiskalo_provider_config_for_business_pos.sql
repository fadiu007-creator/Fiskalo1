-- Expose non-secret provider registration metadata to business owners for automatic POS setup.
drop policy if exists fiskalo_provider_settings_read on public.fiskalo_atk_provider_settings;
create policy fiskalo_provider_settings_read on public.fiskalo_atk_provider_settings
  for select to authenticated
  using (
    (select private.fiskalo_is_provider_user(array['provider_admin','provider_compliance']::text[]))
    or exists (
      select 1 from public.fiskalo_organization_users m
      where m.user_id = (select auth.uid())
        and m.role in ('owner','administrator')
    )
  );
update public.fiskalo_atk_provider_settings
set application_id = coalesce(application_id, 457818860373),
    solution_name = coalesce(nullif(solution_name,''), 'Fiskalo'),
    solution_version = coalesce(nullif(solution_version,''), '0.1.0'),
    updated_at = now()
where singleton = true;
