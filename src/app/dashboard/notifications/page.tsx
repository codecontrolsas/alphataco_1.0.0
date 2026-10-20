import { NotificationsPage } from '@/features/Notifications/NotificationsPage';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Notificaciones' };

export default function Page() {
  return <NotificationsPage />;
}
