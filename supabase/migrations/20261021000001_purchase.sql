-- Phase: Purchase. Writes go through the service-role functions at the bottom; the
-- server action verifies the session and recomputes totals first.

-- ── Vendors: soft-hide, transliteration for voice search, fuzzy search ──────────
alter table public.vendors add column active boolean not null default true;
alter table public.vendors add column name_latin text;
alter table public.vendors add column needs_review boolean not null default false;
create index vendors_trgm_idx on public.vendors using gin (lower(name) extensions.gin_trgm_ops);
create unique index vendors_gstin_uidx on public.vendors (business_id, gstin) where gstin is not null and active;

-- ── Purchases ────────────────────────────────────────────────────────────────────
create table public.purchases (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses(id),
  vendor_id        uuid not null references public.vendors(id),
  vendor_gstin     text,
  bill_number      text,
  bill_date        date not null default current_date,
  items_mode       text not null default 'items' check (items_mode in ('items', 'total')),
  rates_include_gst boolean not null default false,
  subtotal         numeric(12,2) not null default 0,
  discount         numeric(12,2) not null default 0,
  cgst             numeric(12,2) not null default 0,
  sgst             numeric(12,2) not null default 0,
  igst             numeric(12,2) not null default 0,
  round_off        numeric(8,2)  not null default 0,
  total_amount     numeric(12,2) not null check (total_amount > 0),
  payment_status   text not null default 'credit' check (payment_status in ('paid', 'credit', 'partial')),
  amount_paid      numeric(12,2) not null default 0,
  payment_mode     text check (payment_mode in ('cash', 'upi', 'bank', 'cheque')),
  notes            text,
  status           text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  cancel_reason    text,
  revision         int not null default 0,
  source           text not null default 'text',          -- image | pdf | voice | text
  file_paths       text[] not null default '{}',          -- purchase-bills/<business_id>/…
  file_hashes      text[] not null default '{}',          -- sha256 per page, for duplicate checks
  extraction       jsonb,
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index purchases_business_date_idx on public.purchases(business_id, bill_date desc);
create index purchases_vendor_idx on public.purchases(vendor_id);
create index purchases_hashes_idx on public.purchases using gin (file_hashes);
-- Not unique: vendors restart numbering each year and the owner may override a duplicate warning.
create index purchases_bill_no_idx on public.purchases (business_id, vendor_id, lower(bill_number))
  where bill_number is not null and status <> 'cancelled';

create table public.purchase_items (
  id            uuid primary key default gen_random_uuid(),
  purchase_id   uuid not null references public.purchases(id) on delete cascade,
  line_no       int not null,
  product_id    uuid references public.products(id),  -- null when the printed item isn't in the item list
  item_name     text not null,
  hsn_code      text,
  quantity      numeric(12,3),
  unit          text,
  unit_price    numeric(12,2),
  gst_rate      numeric(5,2) not null default 0,
  taxable_value numeric(12,2) not null default 0,
  tax_amount    numeric(12,2) not null default 0,
  total_price   numeric(12,2) not null default 0
);
create index purchase_items_purchase_idx on public.purchase_items(purchase_id);
create index purchase_items_product_idx on public.purchase_items(product_id);

-- ── Vendor payments and how each is applied to bills ────────────────────────────
create table public.vendor_payments (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id),
  vendor_id     uuid not null references public.vendors(id),
  amount        numeric(12,2) not null check (amount > 0),
  mode          text not null default 'cash' check (mode in ('cash', 'upi', 'bank', 'cheque')),
  reference     text,
  payment_date  date not null default current_date,
  notes         text,
  status        text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now()
);
create index vendor_payments_vendor_idx on public.vendor_payments(vendor_id);

create table public.vendor_payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references public.vendor_payments(id) on delete cascade,
  purchase_id uuid references public.purchases(id),     -- null = advance to the vendor
  amount      numeric(12,2) not null check (amount > 0)
);
create index vpa_purchase_idx on public.vendor_payment_allocations(purchase_id);

alter table public.purchases                 enable row level security;
alter table public.purchase_items            enable row level security;
alter table public.vendor_payments           enable row level security;
alter table public.vendor_payment_allocations enable row level security;

create policy purchases_select on public.purchases for select to authenticated
  using (business_id = public.current_business_id());
create policy purchase_items_select on public.purchase_items for select to authenticated
  using (exists (select 1 from public.purchases p where p.id = purchase_id and p.business_id = public.current_business_id()));
create policy vendor_payments_select on public.vendor_payments for select to authenticated
  using (business_id = public.current_business_id());
create policy vpa_select on public.vendor_payment_allocations for select to authenticated
  using (exists (select 1 from public.vendor_payments v where v.id = payment_id and v.business_id = public.current_business_id()));

-- What's still owed on each purchase, and per vendor.
create view public.v_purchase_balance with (security_invoker = true) as
  select p.id as purchase_id, p.business_id, p.vendor_id, p.bill_date, p.bill_number, p.total_amount,
         p.total_amount - p.amount_paid - coalesce(a.paid, 0) as balance
  from public.purchases p
  left join (
    select va.purchase_id, sum(va.amount) as paid
    from public.vendor_payment_allocations va
    join public.vendor_payments vp on vp.id = va.payment_id and vp.status = 'confirmed'
    where va.purchase_id is not null
    group by va.purchase_id
  ) a on a.purchase_id = p.id
  where p.status = 'confirmed';

create view public.v_vendor_balance with (security_invoker = true) as
  select v.business_id, v.id as vendor_id,
         coalesce((select sum(balance) from public.v_purchase_balance b where b.vendor_id = v.id), 0)
         - coalesce((select sum(va.amount) from public.vendor_payment_allocations va
                     join public.vendor_payments vp on vp.id = va.payment_id and vp.status = 'confirmed'
                     where vp.vendor_id = v.id and va.purchase_id is null), 0) as balance
  from public.vendors v;

create or replace function public.search_vendors(q text, lim int default 8)
returns table (id uuid, name text, name_ta text, gstin text, state_code text, phone text, balance numeric, score real)
language sql stable security invoker set search_path = public, extensions
as $$
  select v.id, v.name, v.name_ta, v.gstin, v.state_code, v.phone, coalesce(b.balance, 0),
         greatest(similarity(lower(v.name), lower(q)),
                  similarity(coalesce(v.name_ta, ''), q),
                  similarity(coalesce(v.name_latin, ''), lower(q)),
                  case when v.name ilike q || '%' or v.name_ta ilike q || '%' or v.gstin = upper(q) then 1 else 0 end)::real as score
  from vendors v
  left join v_vendor_balance b on b.vendor_id = v.id
  where v.active
    and (q = '' or v.name ilike '%' || q || '%' or v.name_ta ilike '%' || q || '%' or v.name_latin ilike '%' || q || '%'
         or v.gstin ilike '%' || q || '%' or v.phone ilike '%' || q || '%'
         or similarity(lower(v.name), lower(q)) > 0.25 or similarity(coalesce(v.name_latin, ''), lower(q)) > 0.25)
  order by score desc, v.name
  limit lim
$$;
grant execute on function public.search_vendors(text, int) to authenticated;

-- ── Write functions (service role only) ─────────────────────────────────────────

create or replace function public._insert_purchase_lines(p_purchase uuid, p_lines jsonb)
returns void language sql security definer set search_path = public as $$
  insert into purchase_items (purchase_id, line_no, product_id, item_name, hsn_code, quantity, unit, unit_price,
                              gst_rate, taxable_value, tax_amount, total_price)
  select p_purchase, l.ord::int, nullif(l.v->>'product_id', '')::uuid, l.v->>'item_name', nullif(l.v->>'hsn_code', ''),
         nullif(l.v->>'quantity', '')::numeric, nullif(l.v->>'unit', ''), nullif(l.v->>'unit_price', '')::numeric,
         coalesce((l.v->>'gst_rate')::numeric, 0), coalesce((l.v->>'taxable_value')::numeric, 0),
         coalesce((l.v->>'tax_amount')::numeric, 0), coalesce((l.v->>'total_price')::numeric, 0)
  from jsonb_array_elements(coalesce(p_lines, '[]')) with ordinality as l(v, ord)
$$;

create or replace function public._purchase_snapshot(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) || jsonb_build_object('lines',
    (select coalesce(jsonb_agg(to_jsonb(pi) order by pi.line_no), '[]') from purchase_items pi where pi.purchase_id = p.id))
  from purchases p where p.id = p_id
$$;

create or replace function public._purchase_values(p jsonb)
returns table (vendor_id uuid, vendor_gstin text, bill_number text, bill_date date, items_mode text, rates_include_gst boolean, subtotal numeric,
               discount numeric, cgst numeric, sgst numeric, igst numeric, round_off numeric, total_amount numeric,
               payment_status text, amount_paid numeric, payment_mode text, notes text, source text,
               file_paths text[], file_hashes text[], extraction jsonb)
language sql immutable as $$
  select (p->>'vendor_id')::uuid, nullif(p->>'vendor_gstin', ''), nullif(btrim(p->>'bill_number'), ''),
         (p->>'bill_date')::date, p->>'items_mode', coalesce((p->>'rates_include_gst')::boolean, false),
         (p->>'subtotal')::numeric, (p->>'discount')::numeric,
         (p->>'cgst')::numeric, (p->>'sgst')::numeric, (p->>'igst')::numeric, (p->>'round_off')::numeric,
         (p->>'total_amount')::numeric, p->>'payment_status', (p->>'amount_paid')::numeric, nullif(p->>'payment_mode', ''),
         nullif(p->>'notes', ''), coalesce(p->>'source', 'text'),
         coalesce(array(select jsonb_array_elements_text(p->'file_paths')), '{}'),
         coalesce(array(select jsonb_array_elements_text(p->'file_hashes')), '{}'),
         p->'extraction'
$$;

create or replace function public.create_purchase(p_business uuid, p_user uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_id uuid;
begin
  select * into v from public._purchase_values(p);
  perform 1 from vendors where id = v.vendor_id and business_id = p_business;
  if not found then raise exception 'vendor_not_found'; end if;

  insert into purchases (business_id, vendor_id, vendor_gstin, bill_number, bill_date, items_mode, rates_include_gst, subtotal, discount,
                         cgst, sgst, igst, round_off, total_amount, payment_status, amount_paid, payment_mode, notes,
                         source, file_paths, file_hashes, extraction, created_by)
  values (p_business, v.vendor_id, v.vendor_gstin, v.bill_number, v.bill_date, v.items_mode, v.rates_include_gst, v.subtotal, v.discount,
          v.cgst, v.sgst, v.igst, v.round_off, v.total_amount, v.payment_status, v.amount_paid, v.payment_mode, v.notes,
          v.source, v.file_paths, v.file_hashes, v.extraction, p_user)
  returning id into v_id;

  perform public._insert_purchase_lines(v_id, p->'lines');
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.update_purchase(p_business uuid, p_user uuid, p_id uuid, p_expected timestamptz, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_row purchases%rowtype;
  v_old jsonb;
begin
  select * into v_row from purchases where id = p_id and business_id = p_business for update;
  if not found then raise exception 'purchase_not_found'; end if;
  if v_row.status <> 'confirmed' then raise exception 'purchase_cancelled'; end if;
  if v_row.updated_at <> p_expected then raise exception 'stale'; end if;

  select * into v from public._purchase_values(p);
  perform 1 from vendors where id = v.vendor_id and business_id = p_business;
  if not found then raise exception 'vendor_not_found'; end if;
  v_old := public._purchase_snapshot(p_id);

  update purchases set vendor_id = v.vendor_id, vendor_gstin = v.vendor_gstin, bill_number = v.bill_number,
    bill_date = v.bill_date, items_mode = v.items_mode, rates_include_gst = v.rates_include_gst, subtotal = v.subtotal, discount = v.discount, cgst = v.cgst,
    sgst = v.sgst, igst = v.igst, round_off = v.round_off, total_amount = v.total_amount,
    payment_status = v.payment_status, amount_paid = v.amount_paid, payment_mode = v.payment_mode, notes = v.notes,
    file_paths = v.file_paths, file_hashes = v.file_hashes, revision = revision + 1, updated_at = now()
  where id = p_id;

  delete from purchase_items where purchase_id = p_id;
  perform public._insert_purchase_lines(p_id, p->'lines');

  insert into audit_log (business_id, table_name, record_id, action, old_values, new_values, changed_by, via)
  values (p_business, 'purchases', p_id, 'update', v_old, public._purchase_snapshot(p_id), p_user, 'tap');
  return jsonb_build_object('id', p_id);
end $$;

create or replace function public.cancel_purchase(p_business uuid, p_user uuid, p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  select status into v_status from purchases where id = p_id and business_id = p_business for update;
  if not found then raise exception 'purchase_not_found'; end if;
  if v_status = 'cancelled' then return; end if;
  update purchases set status = 'cancelled', cancel_reason = nullif(btrim(p_reason), ''), updated_at = now() where id = p_id;
  insert into audit_log (business_id, table_name, record_id, action, old_values, new_values, changed_by, via)
  values (p_business, 'purchases', p_id, 'cancel', jsonb_build_object('status', v_status),
          jsonb_build_object('status', 'cancelled', 'reason', p_reason), p_user, 'tap');
end $$;

-- p: { vendor_id, amount, mode, reference, payment_date, notes, allocations: [{purchase_id|null, amount}] }
create or replace function public.create_vendor_payment(p_business uuid, p_user uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_vendor uuid := (p->>'vendor_id')::uuid;
  v_amount numeric := (p->>'amount')::numeric;
  v_id uuid;
  a record;
  v_allocated numeric := 0;
begin
  perform 1 from vendors where id = v_vendor and business_id = p_business;
  if not found then raise exception 'vendor_not_found'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'amount_required'; end if;

  insert into vendor_payments (business_id, vendor_id, amount, mode, reference, payment_date, notes, created_by)
  values (p_business, v_vendor, v_amount, coalesce(nullif(p->>'mode', ''), 'cash'), nullif(btrim(p->>'reference'), ''),
          coalesce((p->>'payment_date')::date, current_date), nullif(p->>'notes', ''), p_user)
  returning id into v_id;

  for a in select nullif(x->>'purchase_id', '')::uuid as purchase_id, (x->>'amount')::numeric as amount
           from jsonb_array_elements(coalesce(p->'allocations', '[]')) x loop
    if a.amount is null or a.amount <= 0 then continue; end if;
    if a.purchase_id is not null then
      perform 1 from v_purchase_balance b
       where b.purchase_id = a.purchase_id and b.vendor_id = v_vendor and b.business_id = p_business and b.balance >= a.amount - 0.005;
      if not found then raise exception 'allocation_exceeds_balance'; end if;
    end if;
    insert into vendor_payment_allocations (payment_id, purchase_id, amount) values (v_id, a.purchase_id, a.amount);
    v_allocated := v_allocated + a.amount;
  end loop;
  if abs(v_allocated - v_amount) > 0.005 then raise exception 'allocation_mismatch'; end if;

  return jsonb_build_object('id', v_id);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public._insert_purchase_lines(uuid, jsonb)',
    'public._purchase_snapshot(uuid)',
    'public._purchase_values(jsonb)',
    'public.create_purchase(uuid, uuid, jsonb)',
    'public.update_purchase(uuid, uuid, uuid, timestamptz, jsonb)',
    'public.cancel_purchase(uuid, uuid, uuid, text)',
    'public.create_vendor_payment(uuid, uuid, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
