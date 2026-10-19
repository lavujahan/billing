-- Foundation: shared tables.
-- Convention for every later business table (invoices, purchases, expenses, collections …):
--   id uuid pk default gen_random_uuid(), business_id uuid not null references businesses,
--   status text ('draft' | 'confirmed' | 'cancelled'), created_by uuid references users,
--   created_at timestamptz default now(). Never hard-delete; edits/cancels go to audit_log.

create extension if not exists pgcrypto;

create type public.user_role as enum ('owner', 'admin', 'staff');

create table public.businesses (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  gstin           text,
  state_code      text,
  address         text,
  phone           text,
  invoice_prefix  text not null default 'INV',
  fy_start_month  smallint not null default 4 check (fy_start_month between 1 and 12),
  gst_slabs       numeric(5,2)[] not null default '{0,5,12,18,28}',
  logo_url        text,
  created_at      timestamptz not null default now()
);

create table public.users (
  id               uuid primary key references auth.users(id) on delete cascade,
  business_id      uuid not null references public.businesses(id) on delete restrict,
  mobile           text not null unique,
  full_name        text not null,
  role             public.user_role not null default 'staff',
  language         text not null default 'ta' check (language in ('ta', 'en')),
  code_hash        text not null,
  active           boolean not null default true,
  failed_attempts  int not null default 0,
  locked_until     timestamptz,
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now()
);
create index users_business_id_idx on public.users(business_id);

create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  name          text not null,
  name_ta       text,
  phone         text,
  gstin         text,
  state_code    text,
  address       text,
  credit_limit  numeric(12,2),
  needs_review  boolean not null default false,
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now()
);
create index customers_business_id_idx on public.customers(business_id);

create table public.vendors (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null,
  name_ta      text,
  gstin        text,
  state_code   text,
  phone        text,
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now()
);
create index vendors_business_id_idx on public.vendors(business_id);

create table public.products (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  name          text not null,
  name_ta       text,
  aliases       text[] not null default '{}',
  unit          text,
  default_rate  numeric(12,2),
  gst_rate      numeric(5,2),
  hsn_code      text,
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now()
);
create index products_business_id_idx on public.products(business_id);

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  table_name  text not null,
  record_id   uuid not null,
  action      text not null,          -- create | update | cancel
  old_values  jsonb,
  new_values  jsonb,
  changed_by  uuid references public.users(id),
  via         text,                   -- voice | text | tap
  created_at  timestamptz not null default now()
);
create index audit_log_business_record_idx on public.audit_log(business_id, table_name, record_id);
