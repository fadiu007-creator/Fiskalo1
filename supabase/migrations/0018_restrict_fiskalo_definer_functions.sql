-- Prevent anonymous API calls to Fiskalo SECURITY DEFINER functions.
-- Trigger-only functions are not intended to be called directly through the Data API.
do $$
declare
  fn record;
begin
  for fn in
    select distinct
      p.oid::regprocedure as signature,
      exists (
        select 1 from pg_trigger t
        where t.tgfoid = p.oid and not t.tgisinternal
      ) as is_trigger_function
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'fiskalo_%'
      and p.prosecdef
  loop
    if fn.is_trigger_function then
      execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
    else
      execute format('revoke all on function %s from public, anon', fn.signature);
    end if;
  end loop;
end;
$$;
