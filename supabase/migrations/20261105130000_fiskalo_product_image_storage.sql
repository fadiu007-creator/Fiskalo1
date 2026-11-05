insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fiskalo-product-images', 'fiskalo-product-images', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy "Fiskalo product images public read" on storage.objects for select using (bucket_id = 'fiskalo-product-images');

create policy "Fiskalo members upload product images" on storage.objects for insert to authenticated with check (
 bucket_id = 'fiskalo-product-images' and exists (select 1 from public.fiskalo_organization_users u where u.organization_id::text = (storage.foldername(name))[1] and u.user_id = (select auth.uid()))
);

create policy "Fiskalo members update product images" on storage.objects for update to authenticated using (
 bucket_id = 'fiskalo-product-images' and exists (select 1 from public.fiskalo_organization_users u where u.organization_id::text = (storage.foldername(name))[1] and u.user_id = (select auth.uid()))
) with check (
 bucket_id = 'fiskalo-product-images' and exists (select 1 from public.fiskalo_organization_users u where u.organization_id::text = (storage.foldername(name))[1] and u.user_id = (select auth.uid()))
);

create policy "Fiskalo members delete product images" on storage.objects for delete to authenticated using (
 bucket_id = 'fiskalo-product-images' and exists (select 1 from public.fiskalo_organization_users u where u.organization_id::text = (storage.foldername(name))[1] and u.user_id = (select auth.uid()))
);