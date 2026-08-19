-- REEMPLAZA COMPLETAMENTE EL PRIMER CÓDIGO:
-- create table gifts (...) + create table donations (...) + insert into gifts (...)
-- Ejecutar en Supabase > SQL Editor.

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
-- No se borran regalos ni aportes anteriores.
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

