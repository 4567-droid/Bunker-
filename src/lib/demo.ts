// Negocios de muestra y propuestas (migración 013: tabla sample_businesses y función sample_business()).
// Los accesos son públicos a propósito: sirven para que cualquiera pruebe los paneles.
export interface Sample {
  slug: string;
  /** Cómo se la llama en /admin */
  label: string;
  /** Qué es, en una o dos oraciones */
  about: string;
  owner: { user: string; password: string };
  barbers: { name: string; code: string }[];
  tip: string;
}

export const SAMPLES: Sample[] = [
  {
    slug: 'demo',
    label: 'muestra',
    about:
      'Copia de Bunker con otro nombre, para mostrarle el sistema a otros negocios. Es un negocio aparte: lo que hagan ahí no toca a Bunker. Al dejarla como nueva vuelve a copiar precios y configuración de Bunker.',
    owner: { user: 'demo', password: 'demo1234' },
    barbers: [
      { name: 'Lucas', code: '1111' },
      { name: 'Tomi', code: '2222' },
      { name: 'Fede', code: '3333' },
    ],
    tip: 'Consejo: en la Central de la muestra (Ajustes) cargá tu WhatsApp, así los interesados te escriben a vos.',
  },
  {
    slug: 'bosco',
    label: 'propuesta',
    about:
      'Propuesta para Bosco Barber Shop: su nombre, logo, foto del local, dirección e Instagram, con clientes, turnos y números de ejemplo. No tiene WhatsApp ni alias cargados, así no le llegan mensajes de prueba.',
    owner: { user: 'bosco', password: 'bosco1234' },
    barbers: [
      { name: 'Mateo', code: '1111' },
      { name: 'Joaco', code: '2222' },
      { name: 'Bruno', code: '3333' },
    ],
    tip: 'Cuando se la muestres al dueño, podés cargar el WhatsApp de Bosco en su Central (Ajustes) para que vea llegar el mensaje del turno.',
  },
];
