-- The atomic POS endpoint uses caller privileges and the existing tenant RLS policies.
alter function public.fiskalo_create_pos_sale(uuid, uuid, uuid, text, jsonb) security invoker;
alter function public.fiskalo_create_pos_sale(uuid, uuid, uuid, text, jsonb) set search_path = '';
