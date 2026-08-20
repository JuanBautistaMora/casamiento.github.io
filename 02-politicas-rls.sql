-- REEMPLAZA COMPLETAMENTE EL SEGUNDO CÓDIGO:
-- alter table ... enable row level security + drop policy ... + create policy ...
-- Ejecutar después de 01-tablas-y-regalos.sql.

alter table public.gifts enable row level security;
alter table public.donations enable row level security;

drop policy if exists "gifts_select" on public.gifts;
drop policy if exists "donations_select_confirmed" on public.donations;
drop policy if exists "donations_insert" on public.donations;

create policy "gifts_select"
on public.gifts
for select
to anon
using (true);

create policy "donations_select_confirmed"
on public.donations
for select
to anon
using (status = 'confirmed');

-- El aporte se confirma inmediatamente, como en el funcionamiento original.
create policy "donations_insert"
on public.donations
for insert
to anon
with check (
  status = 'confirmed'
  and amount >= 500
  and amount <= 5000000
  and length(coalesce(guest_name, '')) <= 80
  and length(coalesce(message, '')) <= 280
);

revoke all on table public.gifts from anon;
revoke all on table public.donations from anon;
grant select on table public.gifts to anon;
grant select, insert on table public.donations to anon;

