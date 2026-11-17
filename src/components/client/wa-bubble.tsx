'use client';

import { usePathname } from 'next/navigation';
import { useApp } from '@/components/client/app-context';
import { Icon } from '@/components/ui';
import { enviarWhatsApp } from '@/lib/whatsapp';

// Dónde aparece: en Inicio y Productos. En Turno, Fidelidad y Cuenta taparía botones
// (y ahí ya hay botones de WhatsApp: "Confirmar por WhatsApp", "Invitar").
const SHOW_ON = ['/', '/productos'];

/** Globo de WhatsApp fijo abajo a la derecha (arriba del menú), con el mensaje ya escrito */
export function WaBubble() {
  const { config } = useApp();
  const path = usePathname();
  const biz = config.business;
  if (!biz.whatsapp || !SHOW_ON.includes(path)) return null;
  const short = biz.name.split(/\s+/)[0];
  const url = enviarWhatsApp({ to: biz.whatsapp, text: `Hola ${short}! Quería hacer una consulta.` }).url;
  return (
    <>
      {/* Lugar al final de la página para que el globo no tape lo último */}
      <div aria-hidden="true" className="h-16 shrink-0" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Escribinos por WhatsApp"
        title="Escribinos por WhatsApp"
        className="wa-bubble fixed z-20 flex h-14 w-14 items-center justify-center rounded-full bg-wa text-wa-ink shadow-[0_6px_20px_rgba(0,0,0,.45)] transition-transform active:scale-95"
        style={{
          right: 'max(16px, calc((100vw - 480px) / 2 + 16px))',
          bottom: 'calc(84px + env(safe-area-inset-bottom))',
        }}
      >
        <Icon name="whatsapp" size={28} stroke={2} />
      </a>
    </>
  );
}
