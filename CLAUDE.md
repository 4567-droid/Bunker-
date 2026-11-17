# Bunker Barber Club — Sistema de turnos

Este archivo explica todo el proyecto. Leelo completo antes de programar y respetalo en cada etapa.

## Contexto

- Lo construye Nicolás (Resistencia, Chaco). Programa a nivel básico: explicale cada paso en español simple y decile qué tiene que hacer él.
- Cliente: **Bunker Barber Club** (Instagram @bunkerbarberclub, "since 2019"), Resistencia, Chaco.
- Barberos: **Mauri** e **Iván**.
- Hoy atienden por orden de llegada. El sistema suma turnos online **sin sacar la fila** de los que llegan sin turno.
- WhatsApp de la barbería: **+54 9 362 420-8452** (`wa.me/5493624208452`). Cambiado el 17/11/2026 (migración 010;
  antes 362 449-3647 y, al principio, 362 549-3647). El dueño también lo puede cambiar en Central → Ajustes.
- Instagram: https://www.instagram.com/bunkerbarberclub · Dirección: Calle Isabel la Católica, H3506 Resistencia, Chaco.
- Más adelante el mismo código tiene que servir para otros negocios (otras barberías, uñas, consultorios): cada negocio con su nombre, colores, logo y dominio, todos manejados desde un panel de administrador.

## Material de referencia (en esta carpeta)

- `docs/maqueta/` — la maqueta aprobada por el cliente. Son archivos de un editor de diseño (`.dc.html`): no se ejecutan tal cual, pero tienen **todo el diseño (estilos en línea) y toda la lógica** de cada pantalla en el bloque `<script>` del final. Usalos como fuente de verdad de textos, colores, tamaños, orden y comportamiento.
  - `1-web-cliente.dc.html` — web pública del cliente.
  - `2-central-dueno.dc.html` — panel del dueño (finanzas).
  - `3-panel-barbero.dc.html` — panel de cada barbero.
  - `4-admin-general.dc.html` — panel del administrador. Tiene el estilo viejo: rehacelo con el estilo nuevo.
- `docs/referencias/`
  - `01-diseno-referencia-minimalista.png` — el estilo que eligió el cliente: portada con foto oscura, título grande, tarjeta "Reservá tu turno" redondeada y menú abajo.
  - `02-promo-bunker-logo-y-colores.jpg` — logo y colores reales de Bunker (negro, amarillo, blanco).
  - `03-instagram-bunkerbarberclub.jpg` — perfil de Instagram (datos y estilo de fotos).
- Maqueta online (si Nicolás la comparte): https://claude.ai/artifact/TnWYuLDAZuE3o3E1dA1YEx

## Tecnología

- Next.js (App Router) + TypeScript + Tailwind CSS.
- Supabase: Postgres, autenticación, Realtime y **Row Level Security en todas las tablas**.
- Hosting en Vercel. Código en GitHub.
- Idioma: español de Argentina (vos). Horarios 24 h. Pesos con punto de miles: `$15.000`. Zona horaria `America/Argentina/Buenos_Aires`.
- **Mobile first**: todo se diseña primero para un celular de 390 px de ancho; en computadora el contenido queda centrado en una columna de máximo 480–560 px.

## Diseño (minimalista)

| Elemento | Valor |
| --- | --- |
| Fondo | `#0E0E0D` (portada `#121211`) |
| Tarjetas | `#1A1A18`, borde `#2A2A27` |
| Campos y filas internas | `#232320` |
| Texto principal | `#EDEAE2` |
| Texto secundario | `#A9A59B` / `#8C887F` |
| Amarillo Bunker (acento) | `#F5C400` |
| Fondo de opción elegida | `#26230F` con borde amarillo |
| Libre | `#4CC26A` · Ocupado `#E0533D` · WhatsApp `#25D366` |
| Tipografía | **Jost** (Google Fonts) 300/400/500/600/700 |
| Bordes | tarjetas 20–24 px, filas 14–16 px, botones tipo píldora (999 px) |

Reglas:
- El amarillo se usa solo para lo importante: botón principal, opción elegida, sellos, precios y pestaña activa.
- Toda opción que el cliente toca (servicio, día, horario, barbero, pago, producto) **se marca en amarillo con un tilde**. El botón "Siguiente" queda gris y bloqueado hasta que elige.
- Botones y áreas táctiles de 44 px como mínimo.
- Títulos de portada: "TU ESTILO," en 700 y "NUESTRA PASIÓN." en 300 con letras espaciadas, línea amarilla debajo.
- Menú fijo abajo con íconos de línea y texto; la pestaña activa en amarillo.
- Sin emojis. Íconos de línea finos.

## Servicios y precios

| Servicio | Duración | Precio |
| --- | --- | --- |
| Corte | 30 min | $15.000 |
| Corte + barba | 50 min | $18.000 |
| Barba sola | 20 min | $10.000 |

Editables desde el panel (el dueño los cambia sin programar).

## Roles

1. **Administrador general** (Nicolás): ve y maneja todos los negocios, crea negocios y sus dueños.
2. **Dueño** de cada negocio: entra a la Central (finanzas) y da de alta barberos.
3. **Barbero**: entra con su nombre y contraseña o código; ve solo lo suyo.
4. **Cliente**: se registra una sola vez (nombre y apellido, teléfono, correo) y queda con la sesión abierta en ese navegador.

Cada usuario ve solo datos de su negocio. Esto se controla con RLS en la base, no solo en la pantalla.

## Web del cliente — menú abajo: Inicio · Turno · Fidelidad · Productos · Cuenta

**Inicio**
- Portada estilo referencia (foto real del local de fondo cuando la pasen), logo "BUNKER", botón de WhatsApp.
- Tarjeta "Reservá tu turno" con filas: corte, fecha y horario, barbero (muestran lo elegido) y botón "Sacar turno →".
- "Ahora en el local": cada barbero con luz verde (Libre) o roja ("Se libera en X min"), en tiempo real.
- Acceso a la tarjeta de fidelidad ("6 de 10 sellos").
- Pie: nombre e Instagram. La dirección, los horarios y "Cómo llegar" están en la tarjeta "Dónde estamos".
  Los paneles **no** aparecen en la web pública: barberos y dueño entran con su link (`/barbero`, `/central`).

**Turno** — 5 pasos, uno por pantalla, con "Paso X de 5" y barra de avance:
1. Servicio.
2. Día (próximos días, domingos cerrado) y horario: **solo se muestran horarios con al menos un barbero libre**.
3. Barbero: Mauri / Iván con luz verde o roja; el ocupado no se puede elegir.
4. Pago: Efectivo (en el local), Transferencia (alias de la barbería), Mercado Pago (link o QR).
5. Resumen (servicio, día, horario, barbero, pago, productos, total). Si es la primera vez pide nombre y apellido, teléfono y correo, y crea la cuenta.
- Al reservar: botón "Confirmar por WhatsApp" que abre el mensaje ya escrito al número de la barbería con todos los datos. Opción "Cambiar turno".
- Debajo: aviso de **fila sin turno** ("¿Sin turno? 3 en la fila (~50 min)") con botón para anotarse (requiere cuenta).
- Validar en la base que no se reserven dos turnos del mismo barbero en el mismo horario.

**Fidelidad**
- Tarjeta de 10 sellos; el 10.º corte es gratis. El barbero sella al terminar cada corte.
- Promo **Doble sello**: si el cliente vuelve dentro de los 30 días de su último corte, ese corte suma 2 sellos (llega al gratis en 6 visitas).
- Promo **Invitá a un amigo**: 20% de descuento para cada uno si el amigo nunca se cortó en Bunker. Botón para invitar por WhatsApp.

**Productos**
- Cera mate, pomada con brillo, aceite para barba: nombre, para qué sirve, precio (a definir con fotos reales de Bunker).
- Botón "Sumar a mi turno": se agrega al resumen y al mensaje de WhatsApp; se paga en el local.

**Cuenta**
- Si no está registrado: formulario de alta.
- Si está registrado: datos, próximo turno con estado y botón "Confirmar asistencia", lugar en la fila, cerrar sesión.

## Panel del barbero — menú abajo: Agenda · Estado · Fila · Nuevo · Clientes

- Login con nombre y contraseña o código. Arriba siempre: "Hola, Mauri" y su estado (Libre / Ocupado / Cortando).
- **Agenda**: contadores (turnos hoy, confirmaron, atendidos) y lista de turnos con estado (Confirmó, Sin confirmar, Cortando, Atendido). Al tocar uno: ficha del cliente con teléfono y tarjeta de sellos.
  - Elige tiempo estimado (10, 15, 20, 30, 45 min) y toca "Empezar corte": la web muestra "Mauri se libera en X min".
  - Si con ese tiempo se pasa del próximo turno, **los turnos siguientes se corren solos** (hora nueva y la vieja tachada), sumando la duración de cada servicio.
  - "Vino · marcar y sellar": registra el corte, suma el sello (doble si corresponde) y lo deja libre. También "Cancelar turno".
- **Estado**: luz grande, botones "Estoy libre" / "Estoy ocupado". Mientras corta: cuánto falta, si viene demorado, mensaje listo y botón "Avisar a [cliente] por WhatsApp" ("Hola Agustín! Mauri se libera en 30 minutos. Tu turno de las 16:30 pasa a las 16:40."), y "Terminé · sellar tarjeta".
- **Fila**: lista de los que esperan sin turno y "Llamar al siguiente", con aviso por WhatsApp.
- **Nuevo**: crear un turno a mano (nombre del cliente, servicio, horario libre).
- **Clientes**: sus clientes con teléfono, correo y sellos.

## Central del dueño — menú abajo: Resumen · Ingresos · Gastos · Estimado

- **Resumen**: ganancia hasta hoy (destacada en amarillo), ingresos (verde) y gastos (rojo), estimado de cierre, botones "+ Ingreso" y "+ Gasto", últimos 5 movimientos.
- **Ingresos**: total del mes; por barbero, lo facturado y cantidad de cada servicio (sale solo de los cortes marcados como terminados); otros ingresos (venta de productos, servicios extra, otros) con alta y baja.
- **Gastos**: total y barras por categoría (Alquiler, Servicios, Productos, Insumos, Sueldos, Mantenimiento, Otros); alta (categoría, detalle, monto) y baja.
- **Estimado**: proyección del mes = promedio por día abierto (lunes a sábado) × días abiertos del mes; ganancia estimada = proyección − gastos; turnos ya reservados; meta de ingresos elegible con barra (logrado y estimado) y cuántos cortes faltan.

## Panel del administrador general

- Lista de negocios (rubro, dominio, estado), alta de negocio con nombre, colores, logo y dominio, y alta de su dueño.
- Mismo estilo minimalista que el resto.

## WhatsApp

- Etapa 1: botones `wa.me` con el mensaje ya escrito. Sin costo.
- Etapa 2 (más adelante): API oficial de WhatsApp Business para recordatorio el día antes, aviso de demora y aviso de fila automáticos. Dejar el código preparado (una función `enviarWhatsApp` que hoy arma el link y mañana llama a la API).

## Datos a completar (hoy son placeholders)

- Horarios de atención reales, alias para transferencias y la altura de la dirección (hoy: Calle Isabel la Católica, sin número).
- Fotos del local, de los barberos y de los productos, y precios de productos.
- Dominio (opción más barata: `bunkerbarberclub.com.ar` en NIC Argentina, con Clave Fiscal nivel 2).

## Reglas de trabajo

- Antes de programar, devolvé un plan por etapas y la lista de tablas. No avances de etapa sin que Nicolás diga "seguimos".
- Orden sugerido: proyecto base → web del cliente con datos de ejemplo → tablas + RLS → registro del cliente → reservas reales → panel del barbero → Central del dueño → tiempo real → botones de WhatsApp → subir a Vercel → admin y multi-negocio → WhatsApp automático.
- Nunca escribas claves en el código: van en `.env.local` (no se sube a GitHub). La `SUPABASE_SERVICE_ROLE_KEY` solo en el servidor.
- Mostrá el SQL antes de correrlo y avisá antes de borrar o cambiar datos.
- Commits chicos con mensajes claros al terminar cada etapa.
- Al terminar cada etapa, explicá cómo probarla desde el celular.
- Teléfonos y correos de clientes son datos personales: solo los ve su barbero, el dueño y el admin.

## Estado actual (noviembre 2026)

Ya está construido y probado (ver `README.md` para correrlo y subirlo):

- Web del cliente completa (Inicio, Turno en 5 pasos, Fidelidad, Productos, Cuenta), panel del barbero,
  Central del dueño (con pestaña **Ajustes**: horarios, precios, productos, alta de barberos, alias)
  y administrador general con el estilo nuevo.
- Reservas reales con bloqueo en la base (`appointments_no_overlap`), sellos, doble sello, corte gratis,
  20% de invitación para cada uno, fila sin turno, corrimiento automático de turnos, botones de WhatsApp.
- Prueba de punta a punta: `DATABASE_URL=<base de prueba> npm run test:e2e` (borra esa base).

Decisiones tomadas (respetarlas o cambiarlas a conciencia):

- **Sin Supabase Auth**: clientes entran con teléfono (+ correo si lo cargaron) y quedan con sesión un año;
  barberos con nombre + código; dueño/admin con usuario + contraseña. Sesiones propias en la tabla `sessions`.
- **Acceso a datos solo desde el servidor** (route handlers en `src/app/api/*`), con `postgres.js`.
  Cada pedido corre como el rol `bunker_app` con `app.business_id` fijado: las políticas RLS filtran por negocio.
  La clave anon de Supabase solo puede leer `barber_status` (para el tiempo real).
- **Multi-negocio** por dominio (`businesses.domain`); sin dominio, `?negocio=slug` o `DEFAULT_BUSINESS_SLUG`.
- Reglas puras (sellos, horarios libres, corrimiento, fila) en `src/lib/rules.ts`; lógica con base en `src/lib/booking.ts`.

Sumado después (migración `002_bloqueos_fotos_pagos.sql`):

- Bloqueos (`blocks`): el barbero bloquea su almuerzo/franco/vacaciones; el dueño cierra el local (feriados) o bloquea
  a un barbero varios días. Los cierres del local se restan del horario (`rangesFor(..., cuts)`); los del barbero lo
  ocupan. No se bloquea encima de turnos reservados. `lockDay()` serializa turnos y bloqueos del mismo día.
- "No vino" (`no_show`), recordatorio por WhatsApp (`reminded_at`), turnos del día y clientes (con CSV) en la Central.
- Fotos (`images`, servidas en `/api/img/<id>`), `mp_link` de Mercado Pago, `.ics` para el calendario,
  editar/borrar cuenta del cliente (los cortes viejos quedan anónimos), `manifest.ts` y vista previa (`og-bunker.png`).

Velocidad e historial:

- Las funciones de Vercel corren en **San Pablo (`gru1`)**, igual que la base de Supabase (`sa-east-1`).
  Si se crea otro proyecto en Vercel, revisar Settings → Functions → Region: si queda en Washington, cada
  consulta cruza el continente y todo anda lento.
- Cada pedido hace las menos idas a la base posibles: sesión + usuario en una consulta, negocio en una consulta,
  y las acciones del barbero devuelven la agenda nueva (`?view=día`).
- Central → "Todos los meses" (`/api/owner/months`): ganancia, ingresos, gastos y cortes de cada mes.

Revisión del 17/11/2026 (migración `003_datos_bunker.sql` con WhatsApp, Instagram y dirección reales):

- Globo de WhatsApp fijo (`src/components/client/wa-bubble.tsx`) en Inicio y Productos; en Turno, Fidelidad y
  Cuenta no se muestra porque taparía botones. Tarjeta "Dónde estamos" en Inicio (Cómo llegar, Instagram, WhatsApp).
- En Ajustes el WhatsApp, Instagram y Maps se aceptan como los escriba el dueño (`whatsappIntl`, `instagramHandle`,
  `mapsHref` en `format.ts`); los links solo pueden ser https. Horarios con listas en 24 h.
- "Crear cuenta" con un teléfono que ya tiene cuenta entra a esa cuenta (si tiene correo, lo pide: código `needs_email`).
- El corte gratis de la tarjeta vale para un solo turno reservado a la vez.
- Turno: Atrás/Siguiente fijos abajo, aviso de los turnos que ya tiene, confirmación antes de "Cambiar turno".

Invitaciones (migración `004_invitaciones.sql`):

- El código de un amigo se escribe al crear la cuenta (viene escrito si entra por el link `/?ref=CODIGO`) y avisa
  al momento si existe. Un código mal escrito da error (antes se ignoraba en silencio).
- Si se registró sin código, lo puede cargar después en Fidelidad, hasta su primer corte; si ya tiene un turno
  reservado, el 20% se aplica a ese turno. Una vez usado, la opción desaparece (`me.invite.canUse`).
- El código de cada cliente sirve para invitar a muchos amigos (un premio por cada amigo que se corta).
- Quien borra su cuenta deja la huella HMAC de su teléfono en `former_clients` (clave `APP_SECRET`, solo en Vercel):
  si vuelve a registrarse con ese teléfono, no recibe otra vez el descuento.

Premio de la tarjeta y búsqueda (migración `005_premio_tarjeta.sql`):

- Central → Ajustes → "Tarjeta de fidelidad": el negocio elige el premio (corte gratis, % de descuento o un regalo
  con texto) y cuántos cortes hacen falta (`loyalty_goal`: el N.º corte tiene el premio). Todos los textos salen de
  `prizeInfo()` en `rules.ts`. Con "regalo" el corte se cobra normal y el barbero ve qué entregar.
- Búsqueda de clientes (`src/lib/client-search.ts`): sin importar tildes ni mayúsculas, varias palabras, y el teléfono
  escrito de cualquier forma (con 7+ números compara el número sin código de área). En la Central, buscador arriba del
  Resumen. El barbero busca entre todos los clientes del local, pero el teléfono y el correo completos solo los ve de
  los que atendió él.

Vista en PC (pantallas de 768 px o más; en el celular no cambia nada):

- Menú arriba con la marca y "Sacar turno" (`ClientNav` en `app-context.tsx`); en el celular sigue abajo.
- Inicio: portada a lo ancho; en 1024 px o más, la tarjeta "Reservá tu turno" va al lado del título y las demás
  tarjetas en columnas. Cada página define su ancho (la columna de 480 px ya no está en el layout).
- Globo de WhatsApp en la esquina de la pantalla; productos en grilla.

Varios negocios y negocio de muestra (migración `006_negocio_demo.sql`):

- Desde /admin → "Agregar negocio" se arma el sistema completo para otro negocio: nombre, color, logo, dominio y
  dueño; arranca con servicios de ejemplo y horarios, y el dueño termina de configurarlo en su Central → Ajustes
  (barberos, precios, productos, premio de la tarjeta). Nada queda atado a Bunker: textos, color e ícono son de
  cada negocio (sin logo, ícono neutro `public/brand/turnos-*`).
- Negocio de muestra "Navaja Barber Club" (slug `demo`, estado `demo`) en `turnos-navaja-demo.vercel.app`
  (dirección agregada al proyecto de Vercel). Es una **copia de Bunker con otro nombre** (migración 007): copia de
  Bunker el color, horarios, reglas, servicios y precios, productos, tarjeta e invitación; nunca sus clientes,
  turnos, teléfonos, dirección, WhatsApp ni alias. Lo arma la función SQL `demo_business(reset)`: 3 barberos,
  120 clientes (teléfonos 362 0…, que no existen), 4 meses de cortes, gastos e ingresos, y turnos para los próximos
  días. Accesos públicos a propósito: Central `demo` / `demo1234`; barberos Lucas `1111`, Tomi `2222` y
  Fede `3333` (`src/lib/demo.ts`).
- Se crea sola en cada publicación si no existe (`prepare` en Vercel; `DEMO_BUSINESS=off` lo apaga). En /admin hay
  una tarjeta con sus links, los accesos y "Dejar la muestra como nueva" (borra lo que cargaron al probar, vuelve a
  copiar la configuración de Bunker y arma los turnos desde hoy; conserva nombre, logo, WhatsApp y dirección web). Local: `node scripts/db.mjs demo [--reset]`.
- La muestra nunca es el negocio por defecto: sin dominio ni `?negocio=`, se muestra Bunker.

Estilos de web por negocio (migraciones `008_estilo_natural.sql`, `009_estilo_moderno.sql` y `011_estilo_app.sql`,
columna `businesses.theme`):

- `moderno` (**Bunker hoy**, desde el 17/11/2026): el armado centrado con los colores del negocio (negro y amarillo):
  su logo arriba, título con serifa "Tu estilo, nuestra pasión.", línea amarilla, barra de reserva redonda con el botón
  "Reservar" amarillo, servicios en pastillas, el sillón dibujado y un brillo amarillo suave.
- `clasico` (el primer diseño de Bunker): Jost, portada con el título a la izquierda (`home-classic.tsx`).
- `natural` (inspirado en la estética de Bosco Barber Shop, sin usar su nombre, logo ni fotos):
  el mismo armado centrado en verde oscuro y dorado, con hojas.
- `claro` (en /admin se llama **"App"**; **la muestra hoy**, desde el 17/11/2026, en verde menta `#10A383`): armado de
  aplicación del celular (`home-app.tsx`). Fondo gris muy claro, tarjetas blancas sin borde con sombra suave, bloque
  gris carbón arriba con el saludo y una tarjeta grande en degradé (próximo turno, la reserva empezada o "Turnos desde
  $X"), accesos rápidos con íconos, filas con cuadraditos de ícono (barberos, servicios, "Dónde estamos") y la tarjeta
  de fidelidad con barra de avance. Todo en `globals.css` (`html[data-theme='claro']`): el `bg-accent` pasa a degradé
  y el `text-accent` se oscurece un poco para leerse sobre blanco; los paneles y la Central también quedan claros.
  Los colores fijos de los paneles usan las variables (`var(--color-card)`, etc.) para servir en los dos modos.
- `moderno` y `natural` comparten `home-centered.tsx` (variante por estilo) y, en la PC, el menú con links a la
  izquierda, la marca con serifa (Cormorant Garamond) en el medio y "Mi cuenta" + "Sacar turno" a la derecha.
- Los colores de base de cada estilo están en `globals.css` (`html[data-theme='natural']`), así la web, los paneles
  y la Central quedan con la misma marca. Las tarjetas del Inicio son las mismas para los dos (`home-cards.tsx`).
- El administrador elige el estilo al crear o editar un negocio (con su color sugerido). La barra del navegador del
  celular toma el color de cada estilo (`THEME_BAR` en `business.ts`).

Pendiente: datos reales de la barbería (dirección, alias, horarios, fotos, precios de productos),
dominio, y la etapa 2 de WhatsApp (API oficial) dentro de `enviarWhatsApp` en `src/lib/whatsapp.ts`.
