-- Estilo "moderno": el armado nuevo (menú con la marca al medio, título centrado con serifa, barra de
-- reserva redonda y servicios en pastillas) con los colores de cada negocio. Bunker lo usa con su negro y
-- amarillo (lo pidió Nicolás el 17/11/2026). Se puede volver al "clásico" desde /admin cuando se quiera.
alter table businesses drop constraint if exists businesses_theme_check;
alter table businesses add constraint businesses_theme_check check (theme in ('clasico', 'moderno', 'natural'));

update businesses set theme = 'moderno' where slug = 'bunker';
