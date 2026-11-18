-- Negocios de muestra y propuestas, con una sola función para todos.
--
-- Hasta ahora la muestra (Navaja Barber Club) la armaba demo_business(). Ahora cada muestra es una fila en
-- sample_businesses (su nombre, estilo, barberos, servicios, etc.) y sample_business(slug, reset) la arma:
--   select sample_business('bosco');         la crea si no existe (no toca nada si ya está)
--   select sample_business('bosco', true);   la deja como nueva (borra lo que cargaron al probar y arma los
--                                            turnos desde hoy; conserva nombre, estilo, color, logo, foto,
--                                            WhatsApp, Instagram, dirección y dirección web)
-- demo_business() sigue andando igual (arma Navaja).
--
-- Muestra nueva: propuesta para Bosco Barber Shop (Resistencia), con su nombre, logo, foto del local, dirección e
-- Instagram, en el estilo "natural" (verde oliva, dorado y letras con serifa). Es para mostrársela a Bosco:
--   - Los clientes, turnos, teléfonos y números son de ejemplo (teléfonos 362 0..., que no existen).
--   - No tiene WhatsApp ni alias cargados: así nadie le manda mensajes ni plata a Bosco por error.
--   - Barberos de ejemplo (Mateo, Joaco y Bruno): se cambian por los reales en Central → Ajustes.
--   - Precios y horarios de ejemplo (lun a sáb de 10 a 21): se ajustan en Central → Ajustes.
-- Accesos públicos a propósito: Central "bosco" / "bosco1234"; barberos Mateo 1111, Joaco 2222, Bruno 3333.
--
-- No cambia ni borra nada de Bunker ni de Navaja.

create table if not exists sample_businesses (
  slug       text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  config     jsonb not null,
  created_at timestamptz not null default now()
);
alter table sample_businesses enable row level security;
grant select on sample_businesses to bunker_app;
drop policy if exists sample_businesses_admin on sample_businesses;
create policy sample_businesses_admin on sample_businesses for select to bunker_app using (app_is_admin());

insert into sample_businesses (slug, config) values
  ('demo', '{
  "name": "Navaja Barber Club",
  "kind": "Barbería",
  "domain": "turnos-navaja-demo.vercel.app",
  "accent": "#10A383",
  "theme": "oscuro",
  "address": "Av. Ejemplo 123",
  "city": "Resistencia, Chaco",
  "transfer_alias": "navaja.muestra",
  "copy_from": "bunker",
  "owner": {
    "name": "Dueño (muestra)",
    "user": "demo",
    "hash": "scrypt$16384$8$1$FQgbqPLjW2FXWg577fhg0g==$CE+yFGoMCzc8yO+8dvHBjNcx4uV0Irgt4S4IlNqDSEk="
  },
  "barbers": [
    {
      "name": "Lucas",
      "hash": "scrypt$16384$8$1$lrsdT9BwvhbfCioZIXddww==$Dx81+1tW1CIMV34F9ZFe4v70N4hNttOkt8spZACSzV4="
    },
    {
      "name": "Tomi",
      "hash": "scrypt$16384$8$1$L/BIPIIO5gg9b5GCmFOZPg==$9Tmvm8JeO6ht7M0F4X7yl3raGRkmBGOAtfQmRPIms2U="
    },
    {
      "name": "Fede",
      "hash": "scrypt$16384$8$1$kQy2aHTsw5JmTYGSw+rwkw==$oaoIdtmNFuNTa7rBE8HahyqyiMf8uEAoCgpJNxy9LqM="
    }
  ]
}'::jsonb),
  ('bosco', '{
  "name": "Bosco Barber Shop",
  "kind": "Barbería",
  "domain": "turnos-bosco-propuesta.vercel.app",
  "accent": "#C9A66B",
  "theme": "natural",
  "address": "Ayacucho 184 · Arturo Illia 897",
  "city": "Resistencia, Chaco",
  "maps_url": "https://www.google.com/maps/search/?api=1&query=Ayacucho%20184%2C%20Resistencia%2C%20Chaco",
  "instagram": "bosco.barbershopp",
  "logo_url": "/muestras/bosco/logo.png",
  "hero_url": "/muestras/bosco/local.jpg",
  "hours": {
    "0": [],
    "1": [
      [
        "10:00",
        "21:00"
      ]
    ],
    "2": [
      [
        "10:00",
        "21:00"
      ]
    ],
    "3": [
      [
        "10:00",
        "21:00"
      ]
    ],
    "4": [
      [
        "10:00",
        "21:00"
      ]
    ],
    "5": [
      [
        "10:00",
        "21:00"
      ]
    ],
    "6": [
      [
        "10:00",
        "21:00"
      ]
    ]
  },
  "services": [
    {
      "name": "Corte",
      "duration": 30,
      "price": 15000
    },
    {
      "name": "Corte + barba",
      "duration": 50,
      "price": 18000
    },
    {
      "name": "Acondicionamiento de barba",
      "duration": 25,
      "price": 11000
    },
    {
      "name": "Afeitado con navaja",
      "duration": 30,
      "price": 12000
    },
    {
      "name": "Tintura de cabello",
      "duration": 60,
      "price": 25000
    }
  ],
  "products": [
    {
      "name": "Polvo texturizador",
      "description": "Volumen y textura con acabado mate, para el día a día.",
      "price": 9500
    },
    {
      "name": "Pasta modeladora",
      "description": "Fijación media y acabado natural, sin brillo.",
      "price": 9000
    },
    {
      "name": "Aceite para barba",
      "description": "Hidrata, suaviza y da un aroma suave a la barba.",
      "price": 10500
    }
  ],
  "loyalty_goal": 10,
  "loyalty_reward": "free",
  "double_stamp_days": 30,
  "referral_percent": 20,
  "owner": {
    "name": "Dueño (prueba)",
    "user": "bosco",
    "hash": "scrypt$16384$8$1$/HJyhOTRxrwZrBgxe8R4pA==$CZ3AQgCDjCjnEiNRVFgEmK6xEH1S6QVfZpilsuCEMtk="
  },
  "barbers": [
    {
      "name": "Mateo",
      "hash": "scrypt$16384$8$1$lrsdT9BwvhbfCioZIXddww==$Dx81+1tW1CIMV34F9ZFe4v70N4hNttOkt8spZACSzV4="
    },
    {
      "name": "Joaco",
      "hash": "scrypt$16384$8$1$L/BIPIIO5gg9b5GCmFOZPg==$9Tmvm8JeO6ht7M0F4X7yl3raGRkmBGOAtfQmRPIms2U="
    },
    {
      "name": "Bruno",
      "hash": "scrypt$16384$8$1$kQy2aHTsw5JmTYGSw+rwkw==$oaoIdtmNFuNTa7rBE8HahyqyiMf8uEAoCgpJNxy9LqM="
    }
  ]
}'::jsonb)
on conflict (slug) do update set config = excluded.config;

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

  -- Dueño y barberos
  insert into staff (business_id, role, name, username, password_hash)
  values (v_biz, 'owner', coalesce(v_cfg #>> '{owner,name}', 'Dueño (muestra)'), v_cfg #>> '{owner,user}', v_cfg #>> '{owner,hash}');
  for r in select x ->> 'name' as name, x ->> 'hash' as hash, n
           from jsonb_array_elements(v_cfg -> 'barbers') with ordinality as t(x, n) order by n loop
    insert into staff (business_id, role, name, username, password_hash, sort)
    values (v_biz, 'barber', r.name, lower(r.name), r.hash, r.n - 1)
    returning id into v_id;
    v_barbers := v_barbers || v_id;
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
                                  stamps_added, confirmed_at, wa_sent_at, completed_at, created_at)
        values (v_biz, v_clients[v_ci], v_cname[v_ci], v_cphone[v_ci], v_barbers[v_i], v_svc[v_si], v_sname[v_si],
                v_sdur[v_si], v_day, v_slot, v_slot + v_sdur[v_si], v_status,
                case when v_j % 6 = 0 then 'barbero' else 'web' end, v_pay[1 + v_j % 4],
                v_sprice[v_si], v_sprice[v_si], case when v_status = 'completed' then 1 else 0 end,
                case when v_status <> 'booked' or v_j % 2 = 0 then now() end, now(),
                case when v_status = 'completed'
                     then (v_day + make_interval(mins => v_slot + v_sdur[v_si])) at time zone 'America/Argentina/Buenos_Aires' end,
                now() - make_interval(days => greatest(v_h, 0) + 2));
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

-- La de siempre (Navaja) ahora usa la función nueva
create or replace function demo_business(p_reset boolean default false) returns uuid
language sql as $$ select sample_business('demo', p_reset) $$;
revoke all on function demo_business(boolean) from public;
grant execute on function demo_business(boolean) to bunker_app;
