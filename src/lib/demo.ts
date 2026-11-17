// Negocio de muestra: copia de Bunker con otro nombre (función demo_business(), migraciones 006 y 007).
// Los accesos son públicos a propósito: sirven para que cualquiera pruebe los paneles.
export const DEMO_SLUG = 'demo';
export const DEMO_ACCESS = {
  owner: { user: 'demo', password: 'demo1234' },
  barbers: [
    { name: 'Lucas', code: '1111' },
    { name: 'Tomi', code: '2222' },
    { name: 'Fede', code: '3333' },
  ],
};
