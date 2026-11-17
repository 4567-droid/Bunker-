'use client';

import { useApp } from '@/components/client/app-context';
import { HomeApp } from '@/components/client/home-app';
import { HomeCentered } from '@/components/client/home-centered';
import { HomeClassic } from '@/components/client/home-classic';
import { isAppTheme } from '@/lib/themes';

// Cada negocio elige el estilo de su web en /admin: "clásico", "moderno" (Bunker), "natural",
// "App claro" o "App oscuro" (la muestra).
export default function Inicio() {
  const { config } = useApp();
  const theme = config.business.theme;
  if (theme === 'clasico') return <HomeClassic />;
  if (isAppTheme(theme)) return <HomeApp />;
  return <HomeCentered variant={theme} />;
}
