-- Row Level Security. Helpers are SECURITY DEFINER so policies on public.users
-- can read the caller's own row without recursing into those same policies.

create or replace function public.current_business_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select business_id from public.users where id = auth.uid() and active
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select role from public.users where id = auth.uid() and active
$$;

revoke all on function public.current_business_id() from public;
revoke all on function public.current_user_role() from public;
grant execute on function public.current_business_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;

alter table public.businesses enable row level security;
alter table public.users      enable row level security;
alter table public.customers  enable row level security;
alter table public.vendors    enable row level security;
alter table public.products   enable row level security;
alter table public.audit_log  enable row level security;

-- businesses: everyone in the business reads it; owner/admin edit it.
create policy businesses_select on public.businesses for select to authenticated
  using (id = public.current_business_id());
create policy businesses_update on public.businesses for update to authenticated
  using (id = public.current_business_id() and public.current_user_role() in ('owner', 'admin'))
  with check (id = public.current_business_id());

-- users: readable within the business. Writes go through server actions using the
-- service role (they also touch auth.users), so no insert/update policy for app users.
create policy users_select on public.users for select to authenticated
  using (business_id = public.current_business_id());

-- code_hash and lockout state must never reach a browser.
revoke select on public.users from anon, authenticated;
grant select (id, business_id, mobile, full_name, role, language, active, created_by, created_at)
  on public.users to authenticated;

-- masters: any active user of the business reads and writes (customers are created
-- from forms). Admin-only master management is enforced in server actions.
create policy customers_select on public.customers for select to authenticated
  using (business_id = public.current_business_id());
create policy customers_insert on public.customers for insert to authenticated
  with check (business_id = public.current_business_id());
create policy customers_update on public.customers for update to authenticated
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy vendors_select on public.vendors for select to authenticated
  using (business_id = public.current_business_id());
create policy vendors_write on public.vendors for insert to authenticated
  with check (business_id = public.current_business_id() and public.current_user_role() in ('owner', 'admin'));
create policy vendors_update on public.vendors for update to authenticated
  using (business_id = public.current_business_id() and public.current_user_role() in ('owner', 'admin'))
  with check (business_id = public.current_business_id());

create policy products_select on public.products for select to authenticated
  using (business_id = public.current_business_id());
create policy products_write on public.products for insert to authenticated
  with check (business_id = public.current_business_id() and public.current_user_role() in ('owner', 'admin'));
create policy products_update on public.products for update to authenticated
  using (business_id = public.current_business_id() and public.current_user_role() in ('owner', 'admin'))
  with check (business_id = public.current_business_id());

-- audit_log: append-only; only the owner reads it.
create policy audit_log_select on public.audit_log for select to authenticated
  using (business_id = public.current_business_id() and public.current_user_role() = 'owner');
create policy audit_log_insert on public.audit_log for insert to authenticated
  with check (business_id = public.current_business_id() and changed_by = auth.uid());

-- No delete policies anywhere: records are cancelled, never deleted.
