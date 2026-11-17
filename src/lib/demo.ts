// Negocio de muestra (lo arma la función demo_business() de la migración 006).
// Los accesos son públicos a propósito: sirven para que cualquiera pruebe los paneles.
export const DEMO_SLUG = 'demo';
export const DEMO_ACCESS = {
  owner: { user: 'demo', password: 'demo1234' },
  barbers: [
    { name: 'Lucas', code: '1111' },
    { name: 'Tomi', code: '2222' },
  ],
};
