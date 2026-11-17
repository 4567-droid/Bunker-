-- Datos reales de Bunker Barber Club (los pasó Nicolás el 17/11/2026).
-- Solo toca la fila de Bunker. En una base nueva no hace nada: ahí los carga `npm run db:seed`.
update businesses set
  whatsapp  = '5493624493647',
  instagram = 'bunkerbarberclub',
  address   = 'Calle Isabel la Católica',
  city      = 'H3506 Resistencia, Chaco',
  maps_url  = 'https://www.google.com/maps/search/?api=1&query=Isabel+la+Cat%C3%B3lica%2C+H3506+Resistencia%2C+Chaco'
where slug = 'bunker';
