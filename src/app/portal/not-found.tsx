import { PortalUnavailable } from '@/features/Portal/components/states/PortalUnavailable';

export const metadata = { title: 'No disponible' };

/**
 * 404 del portal FUERA del panel: lo ve quien entra con el módulo `portal` apagado para su empresa o para la instancia
 * (`requireCompanyRoute` / `requireInstanceRoute`), o una URL que no existe antes de tener sesión. Sin el marco del
 * portal: no se sabe si la persona tiene acceso.
 */
export default function PortalNotFound() {
  return <PortalUnavailable />;
}
