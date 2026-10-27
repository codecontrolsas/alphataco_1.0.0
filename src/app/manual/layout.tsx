import TanstackQueryInicializador from '@/shared/providers/TanstackQueryInicializador';

/**
 * Layout del manual de uso (`/manual`): fuera del dashboard, así que no monta el sidebar de la app.
 * La sesión la exige el proxy (mismo matcher que `/dashboard`); el buscador usa React Query.
 */
export default function ManualLayout({ children }: { children: React.ReactNode }) {
  return <TanstackQueryInicializador>{children}</TanstackQueryInicializador>;
}
