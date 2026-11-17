-- =====================================================================
-- Bunker Barber Club · esquema inicial
-- Se puede correr con `npm run db:migrate` o pegarlo en el SQL Editor
-- de Supabase. Es idempotente: correrlo dos veces no rompe nada.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Negocios (multi-negocio: cada uno con su nombre, colores y dominio)
-- ---------------------------------------------------------------------
create table if not exists businesses (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name              text not null,
  kind              text not null default 'Barbería',
  domain            text unique,
  status            text not null default 'activo'
                    check (status in ('activo', 'demo', 'por_armar', 'pausado')),
  accent            text not null default '#F5C400' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url          text,
  hero_url          text,
  whatsapp          text,                 -- internacional sin "+": 5493625493647
  instagram         text,
  address           text,
  city              text,
  maps_url          text,
  transfer_alias    text,
  timezone          text not null default 'America/Argentina/Buenos_Aires',
  -- {"0":[], "1":[["10:00","13:00"],["16:00","20:00"]], ...}  0 = domingo
  hours             jsonb not null default '{}'::jsonb,
  slot_step         int not null default 30 check (slot_step between 5 and 120),
  booking_days      int not null default 14 check (booking_days between 1 and 90),
  min_advance_min   int not null default 30 check (min_advance_min >= 0),
  cancel_limit_min  int not null default 60 check (cancel_limit_min >= 0),
  loyalty_goal      int not null default 10 check (loyalty_goal between 2 and 50),
  double_stamp_days int not null default 30 check (double_stamp_days >= 0),
  referral_percent  int not null default 20 check (referral_percent between 0 and 100),
  monthly_goal      int not null default 4000000 check (monthly_goal >= 0),
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Personal: administrador general, dueños y barberos
-- ---------------------------------------------------------------------
create table if not exists staff (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references businesses(id) on delete cascade,
  role          text not null check (role in ('admin', 'owner', 'barber')),
  name          text not null,
  username      text not null,
  password_hash text not null,
  instagram     text,
  active        boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  check ((role = 'admin') = (business_id is null))
);
create unique index if not exists staff_login_uq
  on staff (coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(username));

-- Estado en vivo de cada barbero (lo único que es público: nombre y luz)
create table if not exists barber_status (
  barber_id      uuid primary key references staff(id) on delete cascade,
  business_id    uuid not null references businesses(id) on delete cascade,
  name           text not null,
  state          text not null default 'free' check (state in ('free', 'busy', 'cutting')),
  free_at        timestamptz,
  appointment_id uuid,
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create table if not exists clients (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  name          text not null,
  phone         text not null,
  email         text,
  referral_code text not null,
  referred_by   uuid references clients(id) on delete set null,
  stamps        int not null default 0 check (stamps >= 0),
  visits        int not null default 0 check (visits >= 0),
  last_visit_on date,
  source        text not null default 'web' check (source in ('web', 'barbero', 'fila')),
  created_at    timestamptz not null default now(),
  unique (business_id, phone),
  unique (business_id, referral_code)
);

-- Sesiones (cliente: queda abierta en el navegador; personal: 30 días)
create table if not exists sessions (
  token_hash  text primary key,
  kind        text not null check (kind in ('client', 'staff')),
  business_id uuid references businesses(id) on delete cascade,
  client_id   uuid references clients(id) on delete cascade,
  staff_id    uuid references staff(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  check ((kind = 'client' and client_id is not null) or (kind = 'staff' and staff_id is not null))
);
create index if not exists sessions_expires_idx on sessions (expires_at);

-- Intentos fallidos de ingreso (frena a quien prueba códigos al azar)
create table if not exists auth_failures (
  id         bigserial primary key,
  key        text not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_failures_key_idx on auth_failures (key, created_at);

-- ---------------------------------------------------------------------
-- Servicios y productos (editables desde la Central)
-- ---------------------------------------------------------------------
create table if not exists services (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  name         text not null,
  duration_min int not null check (duration_min between 5 and 480),
  price        int not null check (price >= 0),
  active       boolean not null default true,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  description text,
  price       int check (price >= 0),          -- null = "consultar precio"
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Turnos
-- ---------------------------------------------------------------------
create table if not exists appointments (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id) on delete cascade,
  client_id       uuid references clients(id) on delete set null,
  client_name     text not null,
  client_phone    text,
  barber_id       uuid not null references staff(id),
  service_id      uuid references services(id) on delete set null,
  service_name    text not null,
  duration_min    int not null,
  day             date not null,
  start_min       int not null check (start_min between 0 and 1439),
  end_min         int not null check (end_min > start_min and end_min <= 1440),
  status          text not null default 'booked'
                  check (status in ('booked', 'in_progress', 'completed', 'cancelled', 'no_show')),
  source          text not null default 'web' check (source in ('web', 'barbero', 'fila')),
  payment         text check (payment in ('efectivo', 'transferencia', 'mercadopago')),
  price           int not null check (price >= 0),
  discount_pct    int not null default 0 check (discount_pct between 0 and 100),
  discount_reason text,
  final_price     int not null check (final_price >= 0),
  products        jsonb not null default '[]'::jsonb,
  products_total  int not null default 0,
  reward_id       uuid,
  loyalty_free    boolean not null default false,
  stamps_added    int not null default 0,
  wa_sent_at      timestamptz,
  confirmed_at    timestamptz,
  started_at      timestamptz,
  est_end_at      timestamptz,
  completed_at    timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now(),
  -- La base no deja reservar dos turnos del mismo barbero que se pisen.
  -- (Los que vienen de la fila sin turno no ocupan agenda.)
  constraint appointments_no_overlap exclude using gist (
    barber_id with =, day with =, int4range(start_min, end_min) with &&
  ) where (status in ('booked', 'in_progress', 'completed') and source <> 'fila')
);
create index if not exists appointments_business_day_idx on appointments (business_id, day);
create index if not exists appointments_client_idx on appointments (client_id);

-- Beneficios: 20% de bienvenida (amigo invitado) y 20% para quien invitó
create table if not exists rewards (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses(id) on delete cascade,
  client_id        uuid not null references clients(id) on delete cascade,
  kind             text not null check (kind in ('welcome', 'referral')),
  percent          int not null check (percent between 1 and 100),
  source_client_id uuid references clients(id) on delete set null,
  status           text not null default 'available' check (status in ('available', 'reserved', 'used')),
  appointment_id   uuid,
  created_at       timestamptz not null default now(),
  used_at          timestamptz
);
create unique index if not exists rewards_referral_once
  on rewards (source_client_id) where kind = 'referral';
create unique index if not exists rewards_welcome_once
  on rewards (client_id) where kind = 'welcome';

-- Fila sin turno
create table if not exists queue_entries (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id   uuid references clients(id) on delete cascade,
  name        text not null,
  phone       text,
  status      text not null default 'waiting' check (status in ('waiting', 'called', 'served', 'left')),
  called_by   uuid references staff(id) on delete set null,
  called_at   timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists queue_one_waiting
  on queue_entries (client_id) where status in ('waiting', 'called') and client_id is not null;
create index if not exists queue_business_idx on queue_entries (business_id, status, created_at);

-- ---------------------------------------------------------------------
-- Central del dueño: otros ingresos y gastos
-- ---------------------------------------------------------------------
create table if not exists incomes (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category    text not null check (category in ('Productos', 'Servicios extra', 'Otros')),
  description text not null,
  amount      int not null check (amount > 0),
  on_date     date not null,
  created_at  timestamptz not null default now()
);
create index if not exists incomes_business_date_idx on incomes (business_id, on_date);

create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category    text not null check (category in
              ('Alquiler', 'Servicios', 'Productos', 'Insumos', 'Sueldos', 'Mantenimiento', 'Otros')),
  description text not null,
  amount      int not null check (amount > 0),
  on_date     date not null,
  created_at  timestamptz not null default now()
);
create index if not exists expenses_business_date_idx on expenses (business_id, on_date);

-- =====================================================================
-- Seguridad: Row Level Security en TODAS las tablas
-- ---------------------------------------------------------------------
-- El servidor abre cada pedido como el rol `bunker_app` y le dice a la
-- base de qué negocio es (app.business_id). Las políticas de abajo hacen
-- que cada pedido vea SOLO las filas de su negocio, aunque el código
-- tuviera un error. Desde internet (claves anon de Supabase) no se puede
-- leer nada salvo la luz verde/roja de los barberos.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'bunker_app') then
    create role bunker_app nologin;
  end if;
end $$;

grant bunker_app to current_user;
grant usage on schema public to bunker_app;
grant select, insert, update, delete on all tables in schema public to bunker_app;
grant usage, select on all sequences in schema public to bunker_app;

create or replace function app_business() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.business_id', true), '')::uuid $$;

create or replace function app_is_admin() returns boolean
  language sql stable
  as $$ select coalesce(current_setting('app.is_admin', true), '') = 'on' $$;

alter table businesses     enable row level security;
alter table staff          enable row level security;
alter table barber_status  enable row level security;
alter table clients        enable row level security;
alter table sessions       enable row level security;
alter table auth_failures  enable row level security;
alter table services       enable row level security;
alter table products       enable row level security;
alter table appointments   enable row level security;
alter table rewards        enable row level security;
alter table queue_entries  enable row level security;
alter table incomes        enable row level security;
alter table expenses       enable row level security;

-- Negocios: los datos públicos se leen; cambia solo el propio negocio o el admin
drop policy if exists businesses_read on businesses;
create policy businesses_read on businesses for select to bunker_app using (true);
drop policy if exists businesses_update on businesses;
create policy businesses_update on businesses for update to bunker_app
  using (app_is_admin() or id = app_business())
  with check (app_is_admin() or id = app_business());
drop policy if exists businesses_admin_insert on businesses;
create policy businesses_admin_insert on businesses for insert to bunker_app
  with check (app_is_admin());
drop policy if exists businesses_admin_delete on businesses;
create policy businesses_admin_delete on businesses for delete to bunker_app
  using (app_is_admin());

-- Resto de las tablas: cada negocio ve solo lo suyo (el admin ve todo)
do $$
declare
  t text;
begin
  foreach t in array array['staff', 'barber_status', 'clients', 'services', 'products',
                           'appointments', 'rewards', 'queue_entries', 'incomes', 'expenses']
  loop
    execute format('drop policy if exists %I on %I', t || '_tenant', t);
    execute format(
      'create policy %I on %I for all to bunker_app
         using (app_is_admin() or business_id = app_business())
         with check (app_is_admin() or business_id = app_business())',
      t || '_tenant', t);
  end loop;
end $$;
-- sessions y auth_failures no tienen política para bunker_app: solo las
-- toca el código de ingreso del servidor.

-- Supabase: cerrar la API pública y dejar leer solo la luz de los barberos
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
    execute 'grant select on barber_status to anon, authenticated';
    execute 'drop policy if exists barber_status_public on barber_status';
    execute 'create policy barber_status_public on barber_status for select to anon, authenticated using (true)';
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and tablename = 'barber_status') then
    execute 'alter publication supabase_realtime add table barber_status';
  end if;
end $$;
