-- =====================================================================
-- 002 · Bloqueos de agenda, días cerrados, fotos, Mercado Pago y recordatorios
-- Solo agrega cosas: no borra ni cambia datos existentes. Se puede correr
-- más de una vez sin problema.
-- =====================================================================

-- Link de pago de Mercado Pago (ej. https://link.mercadopago.com.ar/bunker)
alter table businesses   add column if not exists mp_link text;
-- Fotos (dirección propia /api/img/... o un link externo)
alter table staff        add column if not exists photo_url text;
alter table products     add column if not exists image_url text;
-- Cuándo el barbero mandó el recordatorio por WhatsApp
alter table appointments add column if not exists reminded_at timestamptz;

-- ---------------------------------------------------------------------
-- Bloqueos: horarios en los que no se puede reservar.
--   barber_id con valor  → solo ese barbero (almuerzo, franco, vacaciones)
--   barber_id vacío      → todo el local (feriado, cierre por evento)
-- start_min/end_min en minutos del día; 0 a 1440 = el día entero.
-- ---------------------------------------------------------------------
create table if not exists blocks (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  barber_id   uuid references staff(id) on delete cascade,
  day         date not null,
  start_min   int not null default 0 check (start_min between 0 and 1439),
  end_min     int not null default 1440 check (end_min > start_min and end_min <= 1440),
  reason      text,
  created_by  uuid references staff(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists blocks_business_day_idx on blocks (business_id, day);

-- ---------------------------------------------------------------------
-- Fotos subidas desde el panel (se achican en el celular antes de subir)
-- ---------------------------------------------------------------------
create table if not exists images (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  mime        text not null check (mime in ('image/webp', 'image/jpeg', 'image/png')),
  data        bytea not null,
  bytes       int not null check (bytes > 0 and bytes <= 2000000),
  created_at  timestamptz not null default now()
);
create index if not exists images_business_idx on images (business_id);

-- ---------------------------------------------------------------------
-- Seguridad: mismas reglas que el resto (cada negocio ve solo lo suyo)
-- ---------------------------------------------------------------------
grant select, insert, update, delete on blocks, images to bunker_app;

alter table blocks enable row level security;
alter table images enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['blocks', 'images']
  loop
    execute format('drop policy if exists %I on %I', t || '_tenant', t);
    execute format(
      'create policy %I on %I for all to bunker_app
         using (app_is_admin() or business_id = app_business())
         with check (app_is_admin() or business_id = app_business())',
      t || '_tenant', t);
  end loop;
end $$;

-- Supabase: la API pública no ve estas tablas
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on blocks, images from anon, authenticated';
  end if;
end $$;
