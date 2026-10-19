-- Phase 2: billing by typing. Invoices are written only through the functions at the
-- bottom, which run as the table owner and are callable only by the service role:
-- the server action verifies the session, recomputes every total, then calls them.

alter table public.products  add column active boolean not null default true;
alter table public.customers add column active boolean not null default true;

-- Generic autosaved form drafts, shared by every form module.
create table public.form_drafts (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  module      text not null,                         -- billing | purchase | expense | collection
  title       text,
  amount      numeric(12,2),
  data        jsonb not null,
  status      text not null default 'open' check (status in ('open', 'saved', 'discarded')),
  record_id   uuid,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index form_drafts_open_idx on public.form_drafts(business_id, module) where status = 'open';

alter table public.form_drafts enable row level security;
create policy form_drafts_select on public.form_drafts for select to authenticated
  using (business_id = public.current_business_id());
create policy form_drafts_insert on public.form_drafts for insert to authenticated
  with check (business_id = public.current_business_id() and created_by = auth.uid());
create policy form_drafts_update on public.form_drafts for update to authenticated
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id),
  customer_id       uuid not null references public.customers(id),
  customer_gstin    text,
  place_of_supply   text,                            -- 2-digit state code
  invoice_no        text not null,
  financial_year    text not null,                   -- '26-27'
  invoice_date      date not null default current_date,
  rate_includes_gst boolean not null default false,
  taxable_value     numeric(12,2) not null,
  discount          numeric(12,2) not null default 0,
  cgst              numeric(12,2) not null default 0,
  sgst              numeric(12,2) not null default 0,
  igst              numeric(12,2) not null default 0,
  round_off         numeric(6,2)  not null default 0,
  total_amount      numeric(12,2) not null,
  payment_status    text not null default 'credit' check (payment_status in ('paid', 'credit', 'partial')),
  amount_received   numeric(12,2) not null default 0,
  notes             text,
  status            text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  cancel_reason     text,
  revision          int not null default 0,
  source            text not null default 'web',     -- app_type | app_voice | web
  entry_mode        text not null default 'type',    -- type | field_voice | free_voice | mixed
  extraction        jsonb,
  pdf_url           text,
  pdf_stale         boolean not null default false,
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id, financial_year, invoice_no)
);
create index invoices_business_date_idx on public.invoices(business_id, invoice_date desc);
create index invoices_customer_idx on public.invoices(customer_id);

create table public.invoice_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id) on delete cascade,
  line_no       int not null,
  product_id    uuid references public.products(id),
  item_name     text not null,
  item_name_ta  text,
  hsn_code      text,
  qty           numeric(12,3) not null check (qty > 0),
  unit          text,
  rate          numeric(12,2) not null check (rate >= 0),
  gst_rate      numeric(5,2) not null default 0,
  taxable_value numeric(12,2) not null,
  tax_amount    numeric(12,2) not null,
  amount        numeric(12,2) not null
);
create index invoice_items_invoice_idx on public.invoice_items(invoice_id);
create index invoice_items_product_idx on public.invoice_items(product_id);

create table public.invoice_counters (
  business_id    uuid not null references public.businesses(id),
  financial_year text not null,
  last_no        int not null,
  primary key (business_id, financial_year)
);

alter table public.invoices         enable row level security;
alter table public.invoice_items    enable row level security;
alter table public.invoice_counters enable row level security;

create policy invoices_select on public.invoices for select to authenticated
  using (business_id = public.current_business_id());
create policy invoice_items_select on public.invoice_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.business_id = public.current_business_id()));
-- invoice_counters: no policies; only the functions below touch it.

-- Outstanding per customer. Collections (Phase 4) will subtract their allocations here.
create view public.v_customer_balance with (security_invoker = true) as
  select business_id, customer_id, sum(total_amount - amount_received) as balance
  from public.invoices
  where status = 'confirmed'
  group by business_id, customer_id;

-- Search helpers (run as the caller, so RLS scopes them to the caller's business).
create or replace function public.search_customers(q text, lim int default 8)
returns table (id uuid, name text, name_ta text, phone text, gstin text, state_code text,
               address text, credit_limit numeric, balance numeric)
language sql stable security invoker set search_path = public
as $$
  select c.id, c.name, c.name_ta, c.phone, c.gstin, c.state_code, c.address, c.credit_limit,
         coalesce(b.balance, 0)
  from customers c
  left join v_customer_balance b on b.customer_id = c.id
  where c.active
    and (q = '' or c.name ilike '%' || q || '%' or c.name_ta ilike '%' || q || '%' or c.phone ilike '%' || q || '%')
  order by (c.name ilike q || '%') desc, c.name
  limit lim
$$;

create or replace function public.search_products(q text, lim int default 8)
returns setof public.products
language sql stable security invoker set search_path = public
as $$
  select p.* from products p
  where p.active
    and (q = '' or p.name ilike '%' || q || '%' or p.name_ta ilike '%' || q || '%'
         or exists (select 1 from unnest(p.aliases) a where a ilike '%' || q || '%'))
  order by (p.name ilike q || '%') desc, p.name
  limit lim
$$;

create or replace function public.customer_last_rate(p_customer uuid, p_product uuid)
returns numeric
language sql stable security invoker set search_path = public
as $$
  select ii.rate from invoice_items ii
  join invoices i on i.id = ii.invoice_id
  where i.customer_id = p_customer and ii.product_id = p_product and i.status = 'confirmed'
  order by i.invoice_date desc, i.created_at desc
  limit 1
$$;

grant execute on function public.search_customers(text, int) to authenticated;
grant execute on function public.search_products(text, int) to authenticated;
grant execute on function public.customer_last_rate(uuid, uuid) to authenticated;

-- ── Write functions (service role only) ───────────────────────────────────────────

create or replace function public._financial_year(p_date date, p_start_month int)
returns text language sql immutable as $$
  select case when extract(month from p_date) >= p_start_month
    then to_char(p_date, 'YY') || '-' || to_char(p_date + interval '1 year', 'YY')
    else to_char(p_date - interval '1 year', 'YY') || '-' || to_char(p_date, 'YY')
  end
$$;

create or replace function public._resolve_customer(p_business uuid, p_user uuid, c jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_name text := btrim(c->>'name');
begin
  if nullif(c->>'id', '') is not null then
    select id into v_id from customers where id = (c->>'id')::uuid and business_id = p_business;
    if v_id is null then raise exception 'customer_not_found'; end if;
    return v_id;
  end if;
  if v_name is null or v_name = '' then raise exception 'customer_required'; end if;

  select id into v_id from customers
   where business_id = p_business and active and lower(name) = lower(v_name)
   order by created_at limit 1;
  if v_id is not null then return v_id; end if;

  insert into customers (business_id, name, gstin, state_code, needs_review, created_by)
  values (p_business, v_name, nullif(c->>'gstin', ''), nullif(c->>'state_code', ''),
          lower(v_name) <> 'cash', p_user)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public._insert_invoice_lines(p_invoice uuid, p_lines jsonb)
returns void language sql security definer set search_path = public as $$
  insert into invoice_items (invoice_id, line_no, product_id, item_name, item_name_ta, hsn_code,
                             qty, unit, rate, gst_rate, taxable_value, tax_amount, amount)
  select p_invoice, l.ord::int, nullif(l.v->>'product_id', '')::uuid, l.v->>'item_name', l.v->>'item_name_ta',
         l.v->>'hsn_code', (l.v->>'qty')::numeric, l.v->>'unit', (l.v->>'rate')::numeric,
         (l.v->>'gst_rate')::numeric, (l.v->>'taxable_value')::numeric, (l.v->>'tax_amount')::numeric,
         (l.v->>'amount')::numeric
  from jsonb_array_elements(p_lines) with ordinality as l(v, ord)
$$;

create or replace function public.create_invoice(p_business uuid, p_user uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid;
  v_date date := (p->>'invoice_date')::date;
  v_fy text;
  v_prefix text;
  v_no int;
  v_invoice_no text;
  v_id uuid;
begin
  if jsonb_array_length(coalesce(p->'lines', '[]')) = 0 then raise exception 'lines_required'; end if;
  select invoice_prefix, public._financial_year(v_date, fy_start_month)
    into v_prefix, v_fy from businesses where id = p_business;
  if v_prefix is null then raise exception 'business_not_found'; end if;

  v_customer := public._resolve_customer(p_business, p_user, p->'customer');

  insert into invoice_counters (business_id, financial_year, last_no) values (p_business, v_fy, 1)
  on conflict (business_id, financial_year) do update set last_no = invoice_counters.last_no + 1
  returning last_no into v_no;
  v_invoice_no := v_prefix || '/' || v_fy || '/' || lpad(v_no::text, 4, '0');

  insert into invoices (business_id, customer_id, customer_gstin, place_of_supply, invoice_no, financial_year,
                        invoice_date, rate_includes_gst, taxable_value, discount, cgst, sgst, igst, round_off,
                        total_amount, payment_status, amount_received, notes, source, entry_mode, created_by)
  values (p_business, v_customer, nullif(p->>'customer_gstin', ''), nullif(p->>'place_of_supply', ''),
          v_invoice_no, v_fy, v_date, (p->>'rate_includes_gst')::boolean,
          (p->>'taxable_value')::numeric, (p->>'discount')::numeric, (p->>'cgst')::numeric,
          (p->>'sgst')::numeric, (p->>'igst')::numeric, (p->>'round_off')::numeric,
          (p->>'total_amount')::numeric, p->>'payment_status', (p->>'amount_received')::numeric,
          nullif(p->>'notes', ''), coalesce(p->>'source', 'web'), coalesce(p->>'entry_mode', 'type'), p_user)
  returning id into v_id;

  perform public._insert_invoice_lines(v_id, p->'lines');
  return jsonb_build_object('id', v_id, 'invoice_no', v_invoice_no, 'customer_id', v_customer);
end $$;

create or replace function public._invoice_snapshot(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(i) || jsonb_build_object('lines',
    (select coalesce(jsonb_agg(to_jsonb(ii) order by ii.line_no), '[]') from invoice_items ii where ii.invoice_id = i.id))
  from invoices i where i.id = p_id
$$;

create or replace function public.update_invoice(p_business uuid, p_user uuid, p_id uuid,
                                                 p_expected timestamptz, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row invoices%rowtype;
  v_old jsonb;
  v_customer uuid;
begin
  select * into v_row from invoices where id = p_id and business_id = p_business for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_row.status <> 'confirmed' then raise exception 'invoice_cancelled'; end if;
  if v_row.updated_at <> p_expected then raise exception 'stale'; end if;
  if jsonb_array_length(coalesce(p->'lines', '[]')) = 0 then raise exception 'lines_required'; end if;
  if public._financial_year((p->>'invoice_date')::date, (select fy_start_month from businesses where id = p_business))
     <> v_row.financial_year then raise exception 'financial_year_change'; end if;

  v_old := public._invoice_snapshot(p_id);
  v_customer := public._resolve_customer(p_business, p_user, p->'customer');

  update invoices set
    customer_id = v_customer,
    customer_gstin = nullif(p->>'customer_gstin', ''),
    place_of_supply = nullif(p->>'place_of_supply', ''),
    invoice_date = (p->>'invoice_date')::date,
    rate_includes_gst = (p->>'rate_includes_gst')::boolean,
    taxable_value = (p->>'taxable_value')::numeric,
    discount = (p->>'discount')::numeric,
    cgst = (p->>'cgst')::numeric, sgst = (p->>'sgst')::numeric, igst = (p->>'igst')::numeric,
    round_off = (p->>'round_off')::numeric,
    total_amount = (p->>'total_amount')::numeric,
    payment_status = p->>'payment_status',
    amount_received = (p->>'amount_received')::numeric,
    notes = nullif(p->>'notes', ''),
    entry_mode = coalesce(p->>'entry_mode', entry_mode),
    revision = revision + 1,
    pdf_stale = true,
    updated_at = now()
  where id = p_id;

  delete from invoice_items where invoice_id = p_id;
  perform public._insert_invoice_lines(p_id, p->'lines');

  insert into audit_log (business_id, table_name, record_id, action, old_values, new_values, changed_by, via)
  values (p_business, 'invoices', p_id, 'update', v_old, public._invoice_snapshot(p_id), p_user, 'tap');

  return jsonb_build_object('id', p_id, 'invoice_no', v_row.invoice_no, 'customer_id', v_customer);
end $$;

create or replace function public.cancel_invoice(p_business uuid, p_user uuid, p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  select status into v_status from invoices where id = p_id and business_id = p_business for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_status = 'cancelled' then return; end if;

  update invoices set status = 'cancelled', cancel_reason = nullif(btrim(p_reason), ''), updated_at = now()
  where id = p_id;

  insert into audit_log (business_id, table_name, record_id, action, old_values, new_values, changed_by, via)
  values (p_business, 'invoices', p_id, 'cancel', jsonb_build_object('status', v_status),
          jsonb_build_object('status', 'cancelled', 'reason', p_reason), p_user, 'tap');
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public._financial_year(date, int)',
    'public._resolve_customer(uuid, uuid, jsonb)',
    'public._insert_invoice_lines(uuid, jsonb)',
    'public._invoice_snapshot(uuid)',
    'public.create_invoice(uuid, uuid, jsonb)',
    'public.update_invoice(uuid, uuid, uuid, timestamptz, jsonb)',
    'public.cancel_invoice(uuid, uuid, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
