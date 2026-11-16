# Bunker Barber Club · Turnos online

Web para sacar turnos en **Bunker Barber Club** (Resistencia, Chaco), con tarjeta de fidelidad,
promo "Invitá a un amigo", fila sin turno, panel para los barberos, central de finanzas para el
dueño y un administrador general para sumar otros negocios más adelante.

Está hecha a partir de la maqueta aprobada (`docs/maqueta/`) y de las reglas de `CLAUDE.md`.

## Qué hay adentro

| Dirección | Para quién | Qué hace |
| --- | --- | --- |
| `/` | Clientes | Portada, "Reservá tu turno", **Ahora en el local** (luz verde/roja de cada barbero), fila sin turno |
| `/turno` | Clientes | 5 pasos: servicio → día y horario → barbero → pago → resumen. La primera vez pide nombre y apellido, teléfono y correo (opcional). Después: "Confirmar por WhatsApp", alias para transferir (con botón Copiar) o link de Mercado Pago, y "Agregar a mi calendario" |
| `/fidelidad` | Clientes | Tarjeta de 10 sellos (el 10.º corte es gratis), **doble sello** si vuelve antes de 30 días, **20% para cada uno** invitando a un amigo |
| `/productos` | Clientes | Ceras, pomadas, aceite: "Sumar a mi turno" (se paga en el local) |
| `/cuenta` | Clientes | Sus datos (editar o borrar la cuenta), próximo turno, "Confirmar asistencia", calendario, últimos cortes, lugar en la fila |
| `/barbero` | Mauri, Iván | Agenda de 14 días, empezar corte (la web muestra "se libera en X min" y los turnos siguientes se corren solos), sellar tarjeta, **No vino**, **Recordar turno por WhatsApp**, **bloquear horarios** (almuerzo, franco, vacaciones), fila, turnos a mano, clientes |
| `/central` | Dueño | Ganancia, ingresos por barbero, gastos, estimado del mes y meta. **Turnos del día** de todos los barberos y **Clientes** (búsqueda y planilla para Excel). En **Ajustes**: horarios, **feriados y vacaciones**, precios, productos y barberos **con foto**, foto de portada, alias, link de Mercado Pago, dirección |
| `/admin` | Nicolás | Todos los negocios: alta de negocio (nombre, color, logo, dominio) y su dueño |

Reglas que ya funcionan solas:

- La base de datos **no deja** reservar dos turnos del mismo barbero que se pisen.
- Solo se muestran horarios con al menos un barbero libre; domingo cerrado; 30 min de anticipación mínima.
- Tarjeta: cada corte suma 1 sello (2 si vuelve dentro de los 30 días). Con 9 sellos, el próximo corte es gratis y la tarjeta vuelve a 0.
- Invitación: el amigo se registra con el link `/?ref=CODIGO` → tiene 20% en su primer corte. Cuando el barbero marca ese primer corte, el que invitó gana 20% para su próximo turno. Se aplican solos.
- Cada negocio ve solo sus datos: lo controla la base (Row Level Security), no solo la pantalla.
- Feriados y bloqueos: en esos horarios no se ofrece nada. Si ya hay turnos reservados ahí, no deja bloquear y
  dice cuáles son (para avisarles antes). Un cierre de golpe (corte de luz) pone la web en "Cerrado" y frena la fila.
- "No vino": libera el horario y el descuento reservado; el barbero y el dueño ven cuántas veces faltó cada cliente.
- Fotos: se suben desde el celular en **/central → Ajustes**; el navegador las achica (WebP) y se guardan en la base.
- La web se puede instalar en el celular ("Agregar a pantalla de inicio") y al compartir el link por WhatsApp
  aparece una vista previa con el logo y la promo.

## Probarlo en tu PC

Necesitás **Node.js 20 o más nuevo** y una base Postgres (la de Supabase sirve, ver abajo).

```bash
npm install
cp .env.example .env.local      # y completá DATABASE_URL
npm run db:migrate              # crea las tablas
npm run db:seed -- --demo       # carga Bunker + clientes y turnos de ejemplo
npm run dev
```

Abrí http://localhost:3000 en el navegador (o desde el celular, con la IP de tu PC en la misma red).

El `db:seed` muestra **una sola vez** los usuarios y claves creados (dueño, barberos, admin).
Si querés elegirlas vos, ponelas antes en `.env.local` (`OWNER_PASSWORD`, `MAURI_CODE`, `IVAN_CODE`, `ADMIN_PASSWORD`).
Sin `--demo` se carga solo lo real: negocio, dueño, barberos, servicios y productos.

## Subirlo a internet (Supabase + Vercel)

### 1. Base de datos en Supabase

1. Entrá a supabase.com → **New project**. Región: **South America (São Paulo)**.
   Para la contraseña de la base usá solo letras y números (los símbolos rompen la dirección de conexión). Guardala.
2. Cuando termine: botón **Connect** (arriba) → copiá dos direcciones y en cada una cambiá
   `[YOUR-PASSWORD]` por la contraseña de la base:
   - **Transaction pooler** (puerto **6543**) → va a ser `DATABASE_URL`.
   - **Session pooler** (puerto **5432**) → va a ser `DIRECT_URL`.

No hace falta correr nada en tu PC: las tablas se crean solas la primera vez que Vercel publica.

### 2. La web en Vercel

1. vercel.com → **Add New → Project** → elegí este repositorio de GitHub (se publica la rama `main`).
2. Antes de tocar **Deploy**, abrí **Environment Variables** y cargá:

   | Nombre | Valor |
   | --- | --- |
   | `DATABASE_URL` | la del Transaction pooler (6543) |
   | `DIRECT_URL` | la del Session pooler (5432) |
   | `DEFAULT_BUSINESS_SLUG` | `bunker` |
   | `ADMIN_PASSWORD` | la clave que quieras para `/admin` (8 o más caracteres) |
   | `OWNER_PASSWORD` | la clave del dueño para `/central` (8 o más caracteres) |
   | `MAURI_CODE` | el código de Mauri para `/barbero` (4 o más números) |
   | `IVAN_CODE` | el código de Iván para `/barbero` (4 o más números) |

3. **Deploy**. Vercel crea las tablas, carga Bunker (negocio, dueño, barberos, servicios y productos) y
   publica. En un par de minutos te da una dirección tipo `bunker-xxx.vercel.app`. Probala desde el celular.
   Usuarios: `admin` (admin), `bunker` (dueño), `Mauri` e `Iván` (barberos), con las claves que cargaste.
4. Si falta alguna variable, la publicación se frena y el registro dice cuál ("Falta OWNER_PASSWORD...").
   Cargala y tocá **Redeploy**.

Las publicaciones siguientes no tocan los datos: solo aplican cambios nuevos de tablas, si los hay.
Las cuatro claves iniciales se usan una sola vez; después de la primera publicación las podés borrar de Vercel
(el dueño cambia la suya desde **/central → Ajustes**).

`vercel.json` pone el servidor en San Pablo (`gru1`), al lado de la base, para que la web responda rápido.

**Tiempo real (opcional).** Supabase → **Project Settings → API**: copiá la *Project URL* y la clave
*anon public* y cargalas en Vercel como `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(después, **Redeploy**). Con esto la luz verde/roja cambia al instante; sin esto se actualiza sola cada 15 segundos.

> Ojo: el plan gratis de Vercel (Hobby) es para uso personal y no comercial. Para la web de un negocio
> Vercel pide el plan Pro. Revisá sus condiciones antes de lanzar. El proyecto también corre en cualquier
> servidor con Node.js (Render, Railway, un VPS), con la misma `DATABASE_URL`.

### 3. El dominio (bunkerbarberclub.com.ar)

1. Registralo en **nic.ar** (necesitás Clave Fiscal nivel 2 de ARCA).
2. En Vercel → tu proyecto → **Settings → Domains** → agregá `bunkerbarberclub.com.ar` y `www.bunkerbarberclub.com.ar`.
   Vercel te muestra los **servidores DNS** (por ejemplo `ns1.vercel-dns.com` y `ns2.vercel-dns.com`).
3. En nic.ar → tu dominio → **Delegar** → pegá esos servidores DNS. Puede tardar unas horas.
4. En `/admin` → Bunker → **Dominio** escribí `bunkerbarberclub.com.ar` y guardá.
   (Así cada negocio futuro se reconoce por su propio dominio.)

Mientras un negocio no tenga dominio, se lo puede ver con `?negocio=identificador`, por ejemplo
`https://bunker-xxx.vercel.app/?negocio=bunker`.

## Lo que falta que pase la barbería

Todo se carga desde **/central → Ajustes**, sin programar:

- Dirección, link de Google Maps y **alias** para transferencias.
- **Horarios reales** (hoy: lunes a sábado 10 a 13 y 16 a 20; domingo cerrado).
- Precios de los productos (hoy dicen "Consultar").
- Foto del local para la portada, fotos de Mauri e Iván y de los productos: **/central → Ajustes → Subir foto** (mientras tanto se ve el dibujo de la silla de la maqueta).
- Link de pago de Mercado Pago (opcional): **/central → Ajustes**.
- Feriados del año: **/central → Ajustes → Feriados, vacaciones y horarios bloqueados**.

## Pruebas

`scripts/e2e.sh` arma una base nueva, levanta la app y prueba todo el circuito (21 pruebas: registro, reservas
sin choques, 20% de invitación, sellos, corte gratis, doble sello, fila, turnos a mano, central,
admin, aislamiento entre negocios, bloqueos y feriados, "No vino", recordatorios, fotos, Mercado Pago,
calendario, editar y borrar cuenta, planilla de clientes y freno a claves al azar):

```bash
DATABASE_URL=postgres://...una-base-de-PRUEBA... npm run test:e2e   # ¡borra esa base!
```

## Cómo está hecho (para quien siga programando)

- **Next.js 16 (App Router) + TypeScript + Tailwind 4**, fuente Jost, colores de `CLAUDE.md` en `src/app/globals.css`.
- **Postgres (Supabase)** con `postgres` (postgres.js). Esquema en `db/migrations/` (`001_esquema.sql`,
  `002_bloqueos_fotos_pagos.sql`); Vercel aplica las nuevas solo al publicar.
- **Seguridad por negocio**: cada pedido abre una transacción como el rol `bunker_app` con
  `app.business_id` del negocio (ver `src/lib/db.ts`). Las políticas RLS de cada tabla filtran por ese
  negocio. La API pública de Supabase (clave anon) no puede leer nada salvo la luz de los barberos.
- **Ingreso**: clientes con teléfono (y correo si lo cargaron), sesión que queda abierta un año en ese
  navegador. Barberos con nombre + código, dueño y admin con usuario + contraseña. Las claves se guardan
  con scrypt y hay freno de 8 intentos fallidos cada 15 minutos. No se usa Supabase Auth porque pide
  correo o SMS para todos, y acá el barbero entra con su nombre y un código.
- **WhatsApp**: todo pasa por `enviarWhatsApp()` en `src/lib/whatsapp.ts`. Hoy arma el link `wa.me`;
  para la etapa 2 (recordatorios automáticos) se cambia solo esa función.
- **Reglas de negocio** sin base de datos en `src/lib/rules.ts` (sellos, horarios libres, corrimiento, fila).
