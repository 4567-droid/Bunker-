'use client';

import { useApp } from '@/components/client/app-context';
import { HomeClassic } from '@/components/client/home-classic';
import { HomeNatural } from '@/components/client/home-natural';

// Cada negocio elige el estilo de su web en /admin: "clásico" (como Bunker) o "natural".
export default function Inicio() {
  const { config } = useApp();
  return config.business.theme === 'natural' ? <HomeNatural /> : <HomeClassic />;
}
