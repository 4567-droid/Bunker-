import type { Metadata } from 'next';
import { AdminPanel } from '@/components/panels/admin-panel';

export const metadata: Metadata = { title: 'Administrador general', robots: { index: false } };

export default function AdminPage() {
  return <AdminPanel />;
}
