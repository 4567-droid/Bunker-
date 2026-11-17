-- Invitaciones: el 20% de bienvenida es para quien nunca fue cliente.
-- Cuando alguien borra su cuenta, queda solo una huella de su teléfono (un código HMAC, no el número):
-- si vuelve a crear la cuenta con ese teléfono, no recibe otra vez el descuento de invitación.
create table if not exists former_clients (
  business_id uuid not null references businesses(id) on delete cascade,
  phone_hash  text not null,
  created_at  timestamptz not null default now(),
  primary key (business_id, phone_hash)
);

grant select, insert on former_clients to bunker_app;
alter table former_clients enable row level security;
drop policy if exists former_clients_tenant on former_clients;
create policy former_clients_tenant on former_clients for all to bunker_app
  using (app_is_admin() or business_id = app_business())
  with check (app_is_admin() or business_id = app_business());

-- Supabase: la API pública no ve esta tabla
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on former_clients from anon, authenticated';
  end if;
end $$;
