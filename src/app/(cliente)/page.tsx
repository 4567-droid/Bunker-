'use client';

import { useApp } from '@/components/client/app-context';
import { HomeCentered } from '@/components/client/home-centered';
import { HomeClassic } from '@/components/client/home-classic';

// Cada negocio elige el estilo de su web en /admin: "clásico", "moderno" (Bunker) o "natural" (la muestra).
export default function Inicio() {
  const { config } = useApp();
  const theme = config.business.theme;
  return theme === 'clasico' ? <HomeClassic /> : <HomeCentered variant={theme} />;
}
