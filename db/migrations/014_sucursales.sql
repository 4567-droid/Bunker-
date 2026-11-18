-- Sucursales: un negocio puede tener varias direcciones, cada una con sus barberos.
--
-- Pedido de Nicolás (18/11/2026): Bosco tiene dos locales (Ayacucho 184 y Arturo Illia 897). El cliente elige
-- primero la sucursal y después ve solo los horarios y barberos de esa sucursal.
--
--   locations                  sucursales del negocio (nombre corto, dirección, link de Maps)
--   staff.location_id          dónde atiende cada barbero
--   appointments.location_id   dónde es cada turno (queda guardado aunque después cambie el barbero de local)
--   queue_entries.location_id  la fila sin turno es de cada local
--
-- Con una sola dirección (Bunker, Navaja) no cambia nada: no tienen sucursales cargadas y todo sigue igual.
-- Un barbero sin sucursal cuenta como de la primera.
--
-- La propuesta de Bosco se vuelve a armar (son datos de ejemplo): Ayacucho 184 con Mateo, Joaco y Bruno, y
-- Arturo Illia 897 con Santi (código 4444) y Nacho (código 5555).

create table if not exists locations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null check (length(name) between 2 and 60),
  address     text,
  maps_url    text,
  sort        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists locations_business_idx on locations (business_id, sort);

alter table staff         add column if not exists location_id uuid references locations(id) on delete set null;
alter table appointments  add column if not exists location_id uuid references locations(id) on delete set null;
alter table queue_entries add column if not exists location_id uuid references locations(id) on delete set null;

alter table locations enable row level security;
grant select, insert, update, delete on locations to bunker_app;
drop policy if exists locations_tenant on locations;
create policy locations_tenant on locations for all to bunker_app
  using (app_is_admin() or business_id = app_business())
  with check (app_is_admin() or business_id = app_business());

-- Supabase: la API pública no ve las sucursales ni la configuración de las muestras (todo pasa por el servidor)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on locations, sample_businesses from anon, authenticated';
  end if;
end $$;

-- Muestras con sucursales: "locations" en la configuración y "location" en cada barbero
create or replace function sample_business(p_slug text, p_reset boolean default false) returns uuid
language plpgsql as $fn$
declare
  v_cfg       jsonb;
  v_old       businesses%rowtype;
  v_src       businesses%rowtype;   -- negocio del que se copia la configuración ("copy_from"), si hay
  v_biz       uuid;
  v_local     timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_today     date;
  v_nowmin    int;
  v_hours     jsonb;
  v_barbers   uuid[] := '{}';
  v_locs      uuid[] := '{}';         -- sucursales (si la muestra tiene más de una dirección)
  v_bloc      uuid[] := '{}';         -- sucursal de cada barbero
  v_nb        int;
  v_svc       uuid[] := '{}';
  v_sname     text[] := '{}';
  v_sdur      int[]  := '{}';
  v_sprice    int[]  := '{}';
  v_nsvc      int;
  v_maxdur    int;
  v_step      int;
  v_clients   uuid[] := '{}';
  v_cname     text[] := '{}';
  v_cphone    text[] := '{}';
  v_first     text[] := array['Martín', 'Facundo', 'Julián', 'Lautaro', 'Santiago', 'Matías', 'Franco', 'Gonzalo', 'Nicolás', 'Bruno',
                              'Ramiro', 'Emiliano', 'Thiago', 'Benjamín', 'Ignacio', 'Valentín', 'Lucio', 'Agustín', 'Mateo', 'Joaquín'];
  v_last      text[] := array['Gómez', 'Fernández', 'López', 'Romero', 'Acosta', 'Benítez', 'Sosa', 'Ramírez', 'Medina', 'Aguirre',
                              'Ojeda', 'Cabrera', 'Ríos', 'Vera', 'Duarte'];
  v_pay       text[] := array['efectivo', 'efectivo', 'transferencia', 'mercadopago'];
  v_slots     int[];
  v_day       date;
  v_slot      int;
  v_h         int;
  v_i         int;
  v_j         int;
  v_si        int;
  v_ci        int;
  v_goal      int;
  v_status    text;
  v_past      boolean;
  v_id        uuid;
  v_month     date;
  r           record;
begin
  select config into v_cfg from sample_businesses where slug = p_slug;
  if v_cfg is null then
    raise exception 'No hay una muestra llamada %', p_slug;
  end if;
  v_today  := v_local::date;
  v_nowmin := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;

  select * into v_old from businesses where slug = p_slug;
  if found then
    if not p_reset then
      return v_old.id;
    end if;
    delete from businesses where id = v_old.id;  -- se lleva todo lo de esta muestra (y nada de otros negocios)
  end if;

  if v_cfg ? 'copy_from' then
    select * into v_src from businesses where slug = v_cfg ->> 'copy_from';
  end if;
  v_hours := coalesce(v_cfg -> 'hours', v_src.hours,
    '{"0": [], "1": [["10:00", "13:00"], ["16:00", "20:00"]], "2": [["10:00", "13:00"], ["16:00", "20:00"]],
      "3": [["10:00", "13:00"], ["16:00", "20:00"]], "4": [["10:00", "13:00"], ["16:00", "20:00"]],
      "5": [["10:00", "13:00"], ["16:00", "20:00"]], "6": [["10:00", "13:00"], ["16:00", "20:00"]]}'::jsonb);
  v_goal := coalesce(v_src.loyalty_goal, (v_cfg ->> 'loyalty_goal')::int, 10);

  -- Al dejarla como nueva se conserva lo que pudieron haber cambiado (nombre, marca, contacto y dirección web)
  insert into businesses (id, slug, name, kind, domain, status, accent, logo_url, hero_url, whatsapp, instagram,
                          address, city, maps_url, transfer_alias, hours, slot_step, booking_days, min_advance_min,
                          cancel_limit_min, monthly_goal, loyalty_goal, loyalty_reward, loyalty_reward_pct,
                          loyalty_reward_text, double_stamp_days, referral_percent, theme)
  values (coalesce(v_old.id, gen_random_uuid()), p_slug, coalesce(v_old.name, v_cfg ->> 'name'),
          coalesce(v_cfg ->> 'kind', 'Barbería'),
          case when v_old.id is null then v_cfg ->> 'domain' else v_old.domain end,
          'demo', coalesce(v_old.accent, v_cfg ->> 'accent', '#F5C400'),
          case when v_old.id is null then v_cfg ->> 'logo_url' else v_old.logo_url end,
          case when v_old.id is null then v_cfg ->> 'hero_url' else v_old.hero_url end,
          case when v_old.id is null then v_cfg ->> 'whatsapp' else v_old.whatsapp end,
          case when v_old.id is null then v_cfg ->> 'instagram' else v_old.instagram end,
          coalesce(v_old.address, v_cfg ->> 'address'), coalesce(v_old.city, v_cfg ->> 'city'),
          case when v_old.id is null then v_cfg ->> 'maps_url' else v_old.maps_url end,
          case when v_old.id is null then v_cfg ->> 'transfer_alias' else v_old.transfer_alias end,
          v_hours,
          coalesce(v_src.slot_step, (v_cfg ->> 'slot_step')::int, 30),
          coalesce(v_src.booking_days, (v_cfg ->> 'booking_days')::int, 14),
          coalesce(v_src.min_advance_min, (v_cfg ->> 'min_advance_min')::int, 30),
          coalesce(v_src.cancel_limit_min, (v_cfg ->> 'cancel_limit_min')::int, 60),
          coalesce(v_src.monthly_goal, (v_cfg ->> 'monthly_goal')::int, 4000000), v_goal,
          coalesce(v_src.loyalty_reward, v_cfg ->> 'loyalty_reward', 'free'),
          coalesce(v_src.loyalty_reward_pct, (v_cfg ->> 'loyalty_reward_pct')::int, 50),
          coalesce(v_src.loyalty_reward_text, v_cfg ->> 'loyalty_reward_text'),
          coalesce(v_src.double_stamp_days, (v_cfg ->> 'double_stamp_days')::int, 30),
          coalesce(v_src.referral_percent, (v_cfg ->> 'referral_percent')::int, 20),
          coalesce(v_old.theme, v_cfg ->> 'theme', 'clasico'))
  returning id into v_biz;

  -- Sucursales
  for r in select x ->> 'name' as name, x ->> 'address' as address, x ->> 'maps_url' as maps_url, n
           from jsonb_array_elements(coalesce(v_cfg -> 'locations', '[]'::jsonb)) with ordinality as t(x, n) order by n loop
    insert into locations (business_id, name, address, maps_url, sort)
    values (v_biz, r.name, r.address, r.maps_url, r.n - 1) returning id into v_id;
    v_locs := v_locs || v_id;
  end loop;

  -- Dueño y barberos (cada barbero en su sucursal: "location" es el número de la lista, desde 0)
  insert into staff (business_id, role, name, username, password_hash)
  values (v_biz, 'owner', coalesce(v_cfg #>> '{owner,name}', 'Dueño (muestra)'), v_cfg #>> '{owner,user}', v_cfg #>> '{owner,hash}');
  for r in select x ->> 'name' as name, x ->> 'hash' as hash, coalesce((x ->> 'location')::int, 0) as loc, n
           from jsonb_array_elements(v_cfg -> 'barbers') with ordinality as t(x, n) order by n loop
    insert into staff (business_id, role, name, username, password_hash, sort, location_id)
    values (v_biz, 'barber', r.name, lower(r.name), r.hash, r.n - 1,
            case when coalesce(array_length(v_locs, 1), 0) > 0 then v_locs[1 + least(r.loc, array_length(v_locs, 1) - 1)] end)
    returning id into v_id;
    v_barbers := v_barbers || v_id;
    v_bloc := v_bloc || (select location_id from staff where id = v_id);
    insert into barber_status (barber_id, business_id, name, state) values (v_id, v_biz, r.name, 'free');
  end loop;
  v_nb := coalesce(array_length(v_barbers, 1), 0);

  -- Servicios: los de la muestra; si no tiene, los del negocio que copia; si no, los de siempre
  if v_cfg ? 'services' then
    for r in select x ->> 'name' as name, (x ->> 'duration')::int as dur, (x ->> 'price')::int as price, n - 1 as sort
             from jsonb_array_elements(v_cfg -> 'services') with ordinality as t(x, n) order by n loop
      insert into services (business_id, name, duration_min, price, sort)
      values (v_biz, r.name, r.dur, r.price, r.sort) returning id into v_id;
      v_svc := v_svc || v_id; v_sname := v_sname || r.name; v_sdur := v_sdur || r.dur; v_sprice := v_sprice || r.price;
    end loop;
  elsif v_src.id is not null then
    for r in select name, duration_min, price, sort from services where business_id = v_src.id and active order by sort, name loop
      insert into services (business_id, name, duration_min, price, sort)
      values (v_biz, r.name, r.duration_min, r.price, r.sort) returning id into v_id;
      v_svc := v_svc || v_id; v_sname := v_sname || r.name; v_sdur := v_sdur || r.duration_min; v_sprice := v_sprice || r.price;
    end loop;
  end if;
  if coalesce(array_length(v_svc, 1), 0) = 0 then
    for r in select * from (values ('Corte', 30, 15000, 0), ('Corte + barba', 50, 18000, 1), ('Barba sola', 20, 10000, 2)) as x(name, dur, price, sort) loop
      insert into services (business_id, name, duration_min, price, sort)
      values (v_biz, r.name, r.dur, r.price, r.sort) returning id into v_id;
      v_svc := v_svc || v_id; v_sname := v_sname || r.name; v_sdur := v_sdur || r.dur; v_sprice := v_sprice || r.price;
    end loop;
  end if;
  v_nsvc := array_length(v_svc, 1);
  select max(d) into v_maxdur from unnest(v_sdur) d;
  v_step := greatest(60, ceil(v_maxdur / 30.0)::int * 30);  -- los turnos de ejemplo nunca se pisan

  -- Productos: los de la muestra; si no tiene, los del negocio que copia (sin fotos); si no, los de siempre
  if v_cfg ? 'products' then
    insert into products (business_id, name, description, price, sort)
    select v_biz, x ->> 'name', x ->> 'description', (x ->> 'price')::int, n - 1
    from jsonb_array_elements(v_cfg -> 'products') with ordinality as t(x, n);
  elsif v_src.id is not null then
    insert into products (business_id, name, description, price, sort)
    select v_biz, p.name, p.description, coalesce(p.price, 8500 + p.sort * 500), p.sort
    from products p where p.business_id = v_src.id and p.active;
  end if;
  if not exists (select 1 from products where business_id = v_biz) then
    insert into products (business_id, name, description, price, sort) values
      (v_biz, 'Cera mate', 'Fija sin brillo. Para texturizados y pelo corto.', 8500, 0),
      (v_biz, 'Pomada con brillo', 'Brillo prolijo para peinados clásicos.', 9000, 1),
      (v_biz, 'Aceite para barba', 'Hidrata y saca el frizz de la barba.', 10500, 2);
  end if;

  -- 120 clientes de ejemplo. Los teléfonos empiezan con 362 0..., que no existen: nadie real recibe mensajes.
  for v_i in 1..120 loop
    insert into clients (business_id, name, phone, email, referral_code, source, created_at)
    values (v_biz,
            v_first[1 + (v_i - 1) % 20] || ' ' || v_last[1 + ((v_i - 1) / 20 + (v_i - 1) * 7) % 15],
            '3620' || lpad(v_i::text, 6, '0'),
            case when v_i % 3 = 0 then 'cliente' || v_i || '@example.com' end,
            translate(upper(v_first[1 + (v_i - 1) % 20]), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') || v_i,
            case when v_i % 5 = 0 then 'barbero' else 'web' end,
            now() - make_interval(days => 5 + (v_i * 37) % 110))
    returning id into v_id;
    v_clients := v_clients || v_id;
  end loop;
  select array_agg(c.name order by o.n), array_agg(c.phone order by o.n) into v_cname, v_cphone
  from unnest(v_clients) with ordinality as o(id, n) join clients c on c.id = o.id;
  -- Algunos llegaron invitados por otros
  update clients set referred_by = v_clients[1 + (substring(referral_code from '\d+$')::int % 10)]
  where business_id = v_biz and substring(referral_code from '\d+$')::int between 101 and 110;

  -- Turnos: 4 meses de cortes terminados, los de hoy y los de los próximos 6 días, según los horarios
  for v_h in -6..120 loop
    v_day := v_today - v_h;
    select coalesce(array_agg(t order by t), '{}') into v_slots
    from jsonb_array_elements(coalesce(v_hours -> (extract(dow from v_day)::int)::text, '[]'::jsonb)) as rg(x),
         generate_series(split_part(rg.x ->> 0, ':', 1)::int * 60 + split_part(rg.x ->> 0, ':', 2)::int,
                         split_part(rg.x ->> 1, ':', 1)::int * 60 + split_part(rg.x ->> 1, ':', 2)::int - v_maxdur,
                         v_step) as t;
    continue when coalesce(array_length(v_slots, 1), 0) = 0;  -- día cerrado
    for v_i in 1..v_nb loop
      foreach v_slot in array v_slots loop
        v_j := abs(hashtext(v_day::text || ':' || v_i || ':' || v_slot)) % 100;
        v_past := v_day < v_today or (v_day = v_today and v_slot + v_maxdur <= v_nowmin);
        continue when v_j >= case when v_past then 60 when v_day = v_today then 45 else 30 end;
        -- El primer servicio (corte) es el más pedido
        v_si := case when v_j % 20 < 9 then 1 else 1 + (v_j * 7 + v_slot / 60) % v_nsvc end;
        v_ci := 1 + abs(hashtext(v_slot::text || ':' || v_day::text || ':' || v_i)) % 120;
        v_status := case when not v_past then 'booked' when v_j % 23 = 0 then 'no_show' else 'completed' end;
        insert into appointments (business_id, client_id, client_name, client_phone, barber_id, service_id, service_name,
                                  duration_min, day, start_min, end_min, status, source, payment, price, final_price,
                                  stamps_added, confirmed_at, wa_sent_at, completed_at, created_at, location_id)
        values (v_biz, v_clients[v_ci], v_cname[v_ci], v_cphone[v_ci], v_barbers[v_i], v_svc[v_si], v_sname[v_si],
                v_sdur[v_si], v_day, v_slot, v_slot + v_sdur[v_si], v_status,
                case when v_j % 6 = 0 then 'barbero' else 'web' end, v_pay[1 + v_j % 4],
                v_sprice[v_si], v_sprice[v_si], case when v_status = 'completed' then 1 else 0 end,
                case when v_status <> 'booked' or v_j % 2 = 0 then now() end, now(),
                case when v_status = 'completed'
                     then (v_day + make_interval(mins => v_slot + v_sdur[v_si])) at time zone 'America/Argentina/Buenos_Aires' end,
                now() - make_interval(days => greatest(v_h, 0) + 2), v_bloc[v_i]);
      end loop;
    end loop;
  end loop;

  -- Visitas y sellos de cada cliente según sus cortes
  update clients c set visits = s.n, last_visit_on = s.last, stamps = s.n % v_goal
  from (select client_id, count(*)::int as n, max(day) as last from appointments
        where business_id = v_biz and status = 'completed' group by client_id) s
  where c.id = s.client_id;

  -- Ingresos y gastos de los últimos meses (para la Central y "Todos los meses")
  for v_h in 0..4 loop
    v_month := (date_trunc('month', v_today) - make_interval(months => v_h))::date;
    insert into expenses (business_id, category, description, amount, on_date)
    select v_biz, x.cat, x.det, x.amount, v_month + x.d
    from (values ('Alquiler', 'Alquiler del local', 450000, 4),
                 ('Servicios', 'Luz', 78000 + v_h * 4000, 9),
                 ('Servicios', 'Agua e internet', 43000, 11),
                 ('Insumos', 'Navajas, talco y toallas', 45000 + (v_h % 2) * 9000, 7),
                 ('Productos', 'Ceras y pomadas para reventa', 120000, 14),
                 ('Mantenimiento', 'Afilado y service de máquinas', 30000, 21)) as x(cat, det, amount, d)
    where v_month + x.d <= v_today;
    insert into incomes (business_id, category, description, amount, on_date)
    select v_biz, x.cat, x.det, x.amount, v_month + x.d
    from (values ('Productos', 'Venta de ceras y pomadas', 64000 + v_h * 6000, 17),
                 ('Servicios extra', 'Diseño de barba y cejas', 28000, 23)) as x(cat, det, amount, d)
    where v_month + x.d <= v_today;
  end loop;

  return v_biz;
end
$fn$;

revoke all on function sample_business(text, boolean) from public;
grant execute on function sample_business(text, boolean) to bunker_app;

-- Bosco: sus dos locales y dos barberos más para Arturo Illia 897
update sample_businesses set config = config || '{
  "locations": [
    {
      "name": "Ayacucho 184",
      "address": "Ayacucho 184, Resistencia, Chaco",
      "maps_url": "https://www.google.com/maps/search/?api=1&query=Ayacucho%20184%2C%20Resistencia%2C%20Chaco"
    },
    {
      "name": "Arturo Illia 897",
      "address": "Arturo Illia 897, Resistencia, Chaco",
      "maps_url": "https://www.google.com/maps/search/?api=1&query=Arturo%20Illia%20897%2C%20Resistencia%2C%20Chaco"
    }
  ],
  "barbers": [
    {
      "name": "Mateo",
      "hash": "scrypt$16384$8$1$lrsdT9BwvhbfCioZIXddww==$Dx81+1tW1CIMV34F9ZFe4v70N4hNttOkt8spZACSzV4=",
      "location": 0
    },
    {
      "name": "Joaco",
      "hash": "scrypt$16384$8$1$L/BIPIIO5gg9b5GCmFOZPg==$9Tmvm8JeO6ht7M0F4X7yl3raGRkmBGOAtfQmRPIms2U=",
      "location": 0
    },
    {
      "name": "Bruno",
      "hash": "scrypt$16384$8$1$kQy2aHTsw5JmTYGSw+rwkw==$oaoIdtmNFuNTa7rBE8HahyqyiMf8uEAoCgpJNxy9LqM=",
      "location": 0
    },
    {
      "name": "Santi",
      "hash": "scrypt$16384$8$1$0OR8WQ6nIzCW4S98AyCALg==$qLTl/syodTTvfypEFI6oxd3i8KH3BuKKRdo9EmYGP7M=",
      "location": 1
    },
    {
      "name": "Nacho",
      "hash": "scrypt$16384$8$1$JvV7wpsDlae2DoqAbGOzOw==$9NQQ3X10uKo/DcCwZBtMEOTycDs/jRIBSWxtJgkM69g=",
      "location": 1
    }
  ]
}'::jsonb
where slug = 'bosco';

-- Se vuelve a armar la propuesta de Bosco con las sucursales (datos de ejemplo; conserva nombre, marca y dirección web)
select sample_business('bosco', true) from businesses where slug = 'bosco';
