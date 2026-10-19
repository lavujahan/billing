-- Private buckets; every object path starts with '<business_id>/'.

insert into storage.buckets (id, name, public) values
  ('purchase-bills', 'purchase-bills', false),
  ('invoice-pdfs',   'invoice-pdfs',   false),
  ('voice-notes',    'voice-notes',    false),
  ('documents',      'documents',      false),
  ('profile-images', 'profile-images', false)
on conflict (id) do nothing;

create policy business_files_select on storage.objects for select to authenticated
  using (
    bucket_id in ('purchase-bills', 'invoice-pdfs', 'voice-notes', 'documents', 'profile-images')
    and (storage.foldername(name))[1] = public.current_business_id()::text
  );

create policy business_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('purchase-bills', 'invoice-pdfs', 'voice-notes', 'documents', 'profile-images')
    and (storage.foldername(name))[1] = public.current_business_id()::text
  );

create policy business_files_update on storage.objects for update to authenticated
  using (
    bucket_id in ('purchase-bills', 'invoice-pdfs', 'voice-notes', 'documents', 'profile-images')
    and (storage.foldername(name))[1] = public.current_business_id()::text
  );
