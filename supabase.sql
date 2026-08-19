-- Lista de regalos de Natalia y Joel
-- Ejecutar completo en Supabase > SQL Editor.
-- Es idempotente: puede volver a ejecutarse sin duplicar regalos ni borrar aportes.

create extension if not exists pgcrypto;

create table if not exists public.gifts (
  id text primary key,
  name text not null,
  description text,
  icon text,
  target_amount numeric not null,
  raised_amount numeric not null default 0,
  suggested_amounts numeric[] default '{}',
  created_at timestamptz default now()
);

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  gift_id text references public.gifts(id) not null,
  amount numeric not null,
  guest_name text,
  message text,
  status text not null default 'pending',
  mp_payment_id text,
  mp_external_reference text unique,
  created_at timestamptz default now()
);

create index if not exists donations_gift_status_idx
  on public.donations (gift_id, status);

-- target_amount = 0 significa "sin objetivo determinado".
-- Las descripciones se dejan en NULL porque no se muestran en la página.
insert into public.gifts (
  id,
  name,
  description,
  icon,
  target_amount,
  raised_amount,
  suggested_amounts
)
values
  ('juego-comedor', 'Juego de comedor', null, '🍽️', 2100000, 0, array[50000,100000,200000]::numeric[]),
  ('sillon', 'Sillón', null, '🛋️', 1900000, 0, array[50000,100000,200000]::numeric[]),
  ('vajilla-completa', 'Vajilla completa', null, '🥂', 450000, 0, array[50000,100000,200000]::numeric[]),
  ('mesas-luz', 'Mesas de luz', null, '🌙', 390000, 0, array[50000,100000,200000]::numeric[]),
  ('sommier', 'Sommier', null, '🛏️', 1600000, 0, array[50000,100000,200000]::numeric[]),
  ('ropa-cama', 'Ropa de cama', null, '🧺', 350000, 0, array[50000,100000,200000]::numeric[]),
  ('ramo-novia', 'Ramo de novia', null, '💐', 290000, 0, array[50000,100000,200000]::numeric[]),
  ('flores-iglesia', 'Flores de la iglesia', null, '⛪', 580000, 0, array[50000,100000,200000]::numeric[]),
  ('alianzas', 'Alianzas', null, '💍', 1200000, 0, array[50000,100000,200000]::numeric[]),
  ('fondo-novios', 'Fondo para los novios', null, '💌', 0, 0, array[50000,100000,200000]::numeric[]),
  ('luna-miel', 'Luna de Miel', null, '✈️', 0, 0, array[50000,100000,200000]::numeric[])
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  target_amount = excluded.target_amount,
  suggested_amounts = excluded.suggested_amounts;

alter table public.gifts enable row level security;
alter table public.donations enable row level security;

drop policy if exists "gifts_select" on public.gifts;
drop policy if exists "donations_select_confirmed" on public.donations;
drop policy if exists "donations_insert" on public.donations;

create policy "gifts_select"
on public.gifts
for select
to anon
using (
  id = any (array[
    'juego-comedor',
    'sillon',
    'vajilla-completa',
    'mesas-luz',
    'sommier',
    'ropa-cama',
    'ramo-novia',
    'flores-iglesia',
    'alianzas',
    'fondo-novios',
    'luna-miel'
  ]::text[])
);

create policy "donations_select_confirmed"
on public.donations
for select
to anon
using (
  status = 'confirmed'
  and gift_id = any (array[
    'juego-comedor',
    'sillon',
    'vajilla-completa',
    'mesas-luz',
    'sommier',
    'ropa-cama',
    'ramo-novia',
    'flores-iglesia',
    'alianzas',
    'fondo-novios',
    'luna-miel'
  ]::text[])
);

-- El visitante solo puede informar una transferencia como pendiente.
-- La confirmación debe hacerse desde el panel de Supabase después de verificarla.
create policy "donations_insert"
on public.donations
for insert
to anon
with check (
  status = 'pending'
  and gift_id = any (array[
    'juego-comedor',
    'sillon',
    'vajilla-completa',
    'mesas-luz',
    'sommier',
    'ropa-cama',
    'ramo-novia',
    'flores-iglesia',
    'alianzas',
    'fondo-novios',
    'luna-miel'
  ]::text[])
  and amount >= 500
  and amount <= 5000000
  and length(coalesce(guest_name, '')) <= 80
  and length(coalesce(message, '')) <= 280
);

revoke all on table public.gifts from anon;
revoke all on table public.donations from anon;
grant select on table public.gifts to anon;
grant select, insert on table public.donations to anon;
