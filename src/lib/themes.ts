// Estilos de la web de cada negocio (se usa en el servidor y en el navegador).
/**
 * Estilos de la web:
 *  - clasico: portada con el título a la izquierda (el primero de Bunker)
 *  - moderno: título centrado con serifa y barra de reserva redonda, con los colores del negocio (Bunker hoy)
 *  - natural: el armado moderno en verde oscuro y dorado, con hojas
 *  - claro (en /admin, "App claro"): fondo claro, tarjetas blancas, bloque gris carbón arriba y degradé del
 *    color del negocio, como una aplicación
 *  - oscuro (en /admin, "App oscuro"): el mismo armado de aplicación en tonos oscuros (la muestra, verde menta)
 */
export type Theme = 'clasico' | 'moderno' | 'natural' | 'claro' | 'oscuro';
export const THEMES: Theme[] = ['clasico', 'moderno', 'natural', 'claro', 'oscuro'];
/** Estilos con el armado de aplicación (home-app.tsx) */
export const isAppTheme = (t: Theme) => t === 'claro' || t === 'oscuro';
/** Color de la barra del navegador en el celular, según el estilo */
export const THEME_BAR: Record<Theme, string> = {
  clasico: '#121211',
  moderno: '#121211',
  natural: '#111A10',
  claro: '#F3F4F6',
  oscuro: '#0F1114',
};
export const asTheme = (v: unknown): Theme => (THEMES.includes(v as Theme) ? (v as Theme) : 'clasico');
