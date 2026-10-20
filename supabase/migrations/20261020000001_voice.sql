-- Phase 3: voice on Billing, AI keys, master requests, customer review/merge.

create extension if not exists pg_trgm with schema extensions;

-- ── Fuzzy search: trigram similarity over English name, Tamil name, aliases, and a
--    Latin transliteration the app writes for Tamil names (so "kumar" finds "குமார்"). ──
alter table public.customers add column name_latin text;
alter table public.products  add column name_latin text;

create index customers_trgm_idx on public.customers using gin (lower(name) extensions.gin_trgm_ops);
create index products_trgm_idx  on public.products  using gin (lower(name) extensions.gin_trgm_ops);

drop function if exists public.search_customers(text, int);
create function public.search_customers(q text, lim int default 8)
returns table (id uuid, name text, name_ta text, phone text, gstin text, state_code text,
               address text, credit_limit numeric, balance numeric, score real)
language sql stable security invoker set search_path = public, extensions
as $$
  select c.id, c.name, c.name_ta, c.phone, c.gstin, c.state_code, c.address, c.credit_limit,
         coalesce(b.balance, 0),
         greatest(similarity(lower(c.name), lower(q)),
                  similarity(coalesce(c.name_ta, ''), q),
                  similarity(coalesce(c.name_latin, ''), lower(q)),
                  case when c.name ilike q || '%' or c.name_ta ilike q || '%' then 1 else 0 end)::real as score
  from customers c
  left join v_customer_balance b on b.customer_id = c.id
  where c.active
    and (q = '' or c.name ilike '%' || q || '%' or c.name_ta ilike '%' || q || '%' or c.phone ilike '%' || q || '%'
         or c.name_latin ilike '%' || q || '%'
         or similarity(lower(c.name), lower(q)) > 0.25 or similarity(coalesce(c.name_latin, ''), lower(q)) > 0.25)
  order by score desc, c.name
  limit lim
$$;
grant execute on function public.search_customers(text, int) to authenticated;

drop function if exists public.search_products(text, int);
create function public.search_products(q text, lim int default 8)
returns table (id uuid, name text, name_ta text, aliases text[], unit text, default_rate numeric,
               gst_rate numeric, hsn_code text, score real)
language sql stable security invoker set search_path = public, extensions
as $$
  select p.id, p.name, p.name_ta, p.aliases, p.unit, p.default_rate, p.gst_rate, p.hsn_code,
         greatest(similarity(lower(p.name), lower(q)),
                  similarity(coalesce(p.name_ta, ''), q),
                  similarity(coalesce(p.name_latin, ''), lower(q)),
                  coalesce((select max(similarity(lower(a), lower(q))) from unnest(p.aliases) a), 0),
                  case when p.name ilike q || '%' or p.name_ta ilike q || '%'
                         or exists (select 1 from unnest(p.aliases) a where lower(a) = lower(q)) then 1 else 0 end)::real as score
  from products p
  where p.active
    and (q = '' or p.name ilike '%' || q || '%' or p.name_ta ilike '%' || q || '%' or p.name_latin ilike '%' || q || '%'
         or exists (select 1 from unnest(p.aliases) a where a ilike '%' || q || '%' or similarity(lower(a), lower(q)) > 0.3)
         or similarity(lower(p.name), lower(q)) > 0.25)
  order by score desc, p.name
  limit lim
$$;
grant execute on function public.search_products(text, int) to authenticated;

-- ── AI keys: encrypted by the server (AES-256-GCM, master key in env). No policies:
--    only the service role reads or writes them. ──
create table public.ai_credentials (
  id             uuid primary key default gen_random_uuid(),
  scope          text not null check (scope in ('platform', 'business')),
  business_id    uuid references public.businesses(id) on delete cascade,
  provider       text not null default 'openai',
  key_encrypted  text not null,                     -- base64(iv | tag | ciphertext)
  key_last4      text not null,
  is_active      boolean not null default true,
  last_tested_at timestamptz,
  last_test_ok   boolean,
  set_by         uuid references public.users(id),
  created_at     timestamptz not null default now(),
  unique nulls not distinct (scope, business_id, provider)
);
alter table public.ai_credentials enable row level security;

create table public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  module_id     text not null,
  kind          text not null check (kind in ('agent_run', 'transcription', 'vision', 'key_test')),
  model         text,
  input_tokens  int,
  output_tokens int,
  audio_seconds numeric(8,2),
  key_scope     text not null,
  ok            boolean not null default true,
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now()
);
create index ai_usage_business_idx on public.ai_usage(business_id, created_at desc);
alter table public.ai_usage enable row level security;
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (business_id = public.current_business_id() and public.current_user_role() in ('owner', 'admin'));

-- ── Master requests: "Request admin to add" from a form. ──
create table public.master_requests (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  kind          text not null check (kind in ('product', 'vendor', 'category')),
  requested_name text not null,
  details       jsonb not null default '{}',
  draft_id      uuid references public.form_drafts(id) on delete set null,
  status        text not null default 'open' check (status in ('open', 'approved', 'merged', 'rejected')),
  resolved_id   uuid,
  resolved_by   uuid references public.users(id),
  resolved_at   timestamptz,
  note          text,
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now()
);
create index master_requests_open_idx on public.master_requests(business_id) where status = 'open';
alter table public.master_requests enable row level security;
create policy master_requests_select on public.master_requests for select to authenticated
  using (business_id = public.current_business_id());
create policy master_requests_insert on public.master_requests for insert to authenticated
  with check (business_id = public.current_business_id() and created_by = auth.uid() and status = 'open');
create policy master_requests_update on public.master_requests for update to authenticated
  using (business_id = public.current_business_id() and public.current_user_role() in ('owner', 'admin'))
  with check (business_id = public.current_business_id());

-- ── Merge a duplicate customer into another: bills move over, the duplicate is hidden. ──
create or replace function public.merge_customers(p_business uuid, p_user uuid, p_from uuid, p_into uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_moved int;
begin
  if p_from = p_into then raise exception 'same_customer'; end if;
  perform 1 from customers where id in (p_from, p_into) and business_id = p_business having count(*) = 2;
  if not found then raise exception 'customer_not_found'; end if;

  update invoices set customer_id = p_into where customer_id = p_from and business_id = p_business;
  get diagnostics v_moved = row_count;
  update customers set active = false, needs_review = false where id = p_from;
  update customers set needs_review = false where id = p_into;

  insert into audit_log (business_id, table_name, record_id, action, old_values, new_values, changed_by, via)
  values (p_business, 'customers', p_from, 'merge', jsonb_build_object('customer_id', p_from),
          jsonb_build_object('merged_into', p_into, 'invoices_moved', v_moved), p_user, 'tap');
end $$;
revoke all on function public.merge_customers(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_customers(uuid, uuid, uuid, uuid) to service_role;
