-- Estilo de la web por negocio, y la muestra con estilo "natural".
--
-- businesses.theme: 'clasico' (como Bunker: negro y amarillo, Jost) o 'natural' (verde oscuro, dorado,
-- letras con serifa, Inicio con título centrado y barra de reserva). Lo elige el administrador.
--
-- Negocio de muestra, versión 3: sigue siendo una COPIA DE BUNKER en lo que hace (horarios, reglas,
-- servicios y precios, productos, tarjeta e invitación), con otro nombre ("Navaja Barber Club") y el
-- estilo "natural" con dorado. NO se copia nada privado de Bunker (clientes, turnos, teléfonos,
-- dirección, WhatsApp, alias).
--
-- Tiene 3 barberos (cada uno con su panel), 1 Central del dueño y la web de clientes:
--   Central: usuario "demo", contraseña "demo1234"
--   Barberos: "Lucas" código 1111 · "Tomi" código 2222 · "Fede" código 3333
--
--   select demo_business();       la crea si no existe
--   select demo_business(true);   la deja como nueva (vuelve a copiar de Bunker y arma turnos desde hoy;
--                                 conserva nombre, estilo, color, logo, foto, WhatsApp, Instagram y dirección web)

alter table businesses add column if not exists theme text not null default 'clasico';
do $$
begin
  alter table businesses add constraint businesses_theme_check check (theme in ('clasico', 'natural'));
exception when duplicate_object then null;
end $$;

create or replace function demo_business(p_reset boolean default false) returns uuid
language plpgsql as $fn$
declare
  v_old       businesses%rowtype;
  v_src       businesses%rowtype;   -- Bunker, del que se copia la configuración
  v_biz       uuid;
  v_local     timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_today     date;
  v_nowmin    int;
  v_hours     jsonb;
  v_barbers   uuid[] := '{}';
  v_bnames    text[] := array['Lucas', 'Tomi', 'Fede'];
  v_bhash     text[] := array['scrypt$16384$8$1$lrsdT9BwvhbfCioZIXddww==$Dx81+1tW1CIMV34F9ZFe4v70N4hNttOkt8spZACSzV4=', 'scrypt$16384$8$1$L/BIPIIO5gg9b5GCmFOZPg==$9Tmvm8JeO6ht7M0F4X7yl3raGRkmBGOAtfQmRPIms2U=', 'scrypt$16384$8$1$kQy2aHTsw5JmTYGSw+rwkw==$oaoIdtmNFuNTa7rBE8HahyqyiMf8uEAoCgpJNxy9LqM='];
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
  v_today  := v_local::date;
  v_nowmin := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;

  select * into v_old from businesses where slug = 'demo';
  if found then
    if not p_reset then
      return v_old.id;
    end if;
    delete from businesses where id = v_old.id;  -- se lleva todo lo de la muestra (y nada de otros negocios)
  end if;

  select * into v_src from businesses where slug = 'bunker';
  v_hours := coalesce(v_src.hours,
    '{"0": [], "1": [["10:00", "13:00"], ["16:00", "20:00"]], "2": [["10:00", "13:00"], ["16:00", "20:00"]],
      "3": [["10:00", "13:00"], ["16:00", "20:00"]], "4": [["10:00", "13:00"], ["16:00", "20:00"]],
      "5": [["10:00", "13:00"], ["16:00", "20:00"]], "6": [["10:00", "13:00"], ["16:00", "20:00"]]}'::jsonb);
  v_goal := coalesce(v_src.loyalty_goal, 10);

  insert into businesses (id, slug, name, kind, domain, status, accent, logo_url, hero_url, whatsapp, instagram,
                          address, city, maps_url, transfer_alias, hours, slot_step, booking_days, min_advance_min,
                          cancel_limit_min, monthly_goal, loyalty_goal, loyalty_reward, loyalty_reward_pct,
                          loyalty_reward_text, double_stamp_days, referral_percent, theme)
  values (coalesce(v_old.id, gen_random_uuid()), 'demo', coalesce(v_old.name, 'Navaja Barber Club'), 'Barbería',
          case when v_old.id is null then 'turnos-navaja-demo.vercel.app' else v_old.domain end,
          'demo', coalesce(v_old.accent, '#C9A66B'), v_old.logo_url, v_old.hero_url, v_old.whatsapp, v_old.instagram,
          coalesce(v_old.address, 'Av. Ejemplo 123'), coalesce(v_old.city, 'Resistencia, Chaco'), v_old.maps_url,
          coalesce(v_old.transfer_alias, 'navaja.muestra'), v_hours,
          coalesce(v_src.slot_step, 30), coalesce(v_src.booking_days, 14), coalesce(v_src.min_advance_min, 30),
          coalesce(v_src.cancel_limit_min, 60), coalesce(v_src.monthly_goal, 4000000), v_goal,
          coalesce(v_src.loyalty_reward, 'free'), coalesce(v_src.loyalty_reward_pct, 50), v_src.loyalty_reward_text,
          coalesce(v_src.double_stamp_days, 30), coalesce(v_src.referral_percent, 20), coalesce(v_old.theme, 'natural'))
  returning id into v_biz;

  -- Dueño y 3 barberos
  insert into staff (business_id, role, name, username, password_hash)
  values (v_biz, 'owner', 'Dueño (muestra)', 'demo', 'scrypt$16384$8$1$FQgbqPLjW2FXWg577fhg0g==$CE+yFGoMCzc8yO+8dvHBjNcx4uV0Irgt4S4IlNqDSEk=');
  for v_i in 1..3 loop
    insert into staff (business_id, role, name, username, password_hash, sort)
    values (v_biz, 'barber', v_bnames[v_i], lower(v_bnames[v_i]), v_bhash[v_i], v_i - 1)
    returning id into v_id;
    v_barbers := v_barbers || v_id;
    insert into barber_status (barber_id, business_id, name, state) values (v_id, v_biz, v_bnames[v_i], 'free');
  end loop;

  -- Servicios: los mismos de Bunker (o los de siempre si Bunker no está)
  if v_src.id is not null then
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

  -- Productos: los de Bunker, sin fotos (si no tienen precio, uno de ejemplo para que se vea)
  insert into products (business_id, name, description, price, sort)
  select v_biz, p.name, p.description, coalesce(p.price, 8500 + p.sort * 500), p.sort
  from products p where v_src.id is not null and p.business_id = v_src.id and p.active;
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
    for v_i in 1..3 loop
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

revoke all on function demo_business(boolean) from public;
grant execute on function demo_business(boolean) to bunker_app;

-- La muestra que ya existe pasa al estilo natural con dorado (sin tocar sus datos)
update businesses set theme = 'natural', accent = '#C9A66B' where slug = 'demo';
