import { getInboxBellData } from '../lib/registry.server';
import { InboxBell } from './InboxBell';

/**
 * Ícono de Mi bandeja con su contador inicial desde el servidor. Corre en todas las páginas del dashboard: una sola
 * resolución de empresa, permisos y tipos ocultos (en paralelo). Sin proveedor habilitado o sin empresa activa no se muestra.
 */
export async function InboxBellAsync() {
  const data = await getInboxBellData();
  if (!data) return null;
  return <InboxBell companyId={data.companyId} initialCount={data.count} />;
}

/** Mismo lugar y tamaño que el ícono mientras carga. */
export function InboxBellFallback() {
  return <span aria-hidden="true" className="size-10" />;
}
