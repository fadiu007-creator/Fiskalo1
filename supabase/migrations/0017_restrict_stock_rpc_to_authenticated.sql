-- Keep stock-management RPCs callable only by signed-in business members.
revoke all on function public.fiskalo_set_stock(uuid, numeric, text) from anon;
revoke all on function public.fiskalo_adjust_stock(uuid, numeric, text) from anon;
grant execute on function public.fiskalo_set_stock(uuid, numeric, text) to authenticated;
grant execute on function public.fiskalo_adjust_stock(uuid, numeric, text) to authenticated;
