// WhatsApp
// Etapa 1 (hoy): arma un link wa.me con el mensaje ya escrito. Sin costo.
// Etapa 2 (más adelante): esta misma función va a llamar a la API oficial de
// WhatsApp Business para mandar recordatorios y avisos automáticos. Por eso
// todo el código pasa por acá.

export interface MensajeWhatsApp {
  /** Teléfono destino: 10 dígitos argentinos ("3624493647") o internacional ("5493624493647"). Vacío = elegir contacto. */
  to?: string | null;
  text: string;
}

export function waNumber(phone: string | null | undefined): string {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10) return `549${d}`;
  return d;
}

export function enviarWhatsApp(msg: MensajeWhatsApp): { url: string } {
  const to = waNumber(msg.to);
  const text = encodeURIComponent(msg.text);
  return { url: to ? `https://wa.me/${to}?text=${text}` : `https://wa.me/?text=${text}` };
}
