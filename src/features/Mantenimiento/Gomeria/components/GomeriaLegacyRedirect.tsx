import { StateBlock } from '@/shared/components/common/StateBlock';
import { redirect } from 'next/navigation';
import {
  GOMERIA_CATALOG_HREF,
  GOMERIA_ORDERS_HREF,
  GOMERIA_SETTINGS_HREF,
} from '../lib/gomeria-locations';

/** Vista vieja (`?gomeria_tab=`) → nueva ubicación y permiso que la habilita (el mismo de siempre). */
const LEGACY_VIEWS = [
  { value: 'ordenes_gomeria', href: GOMERIA_ORDERS_HREF },
  { value: 'catalogo_cubiertas', href: GOMERIA_CATALOG_HREF },
  { value: 'plantillas_cubiertas', href: GOMERIA_SETTINGS_HREF },
  { value: 'marcas_cubiertas', href: GOMERIA_SETTINGS_HREF },
  { value: 'tipos_cubiertas', href: GOMERIA_SETTINGS_HREF },
] as const;

interface GomeriaLegacyRedirectProps {
  searchParams: Record<string, string | string[] | undefined>;
  /** Mapa `modulo:tab:accion -> boolean` del usuario. */
  permissions: Record<string, boolean>;
}

/**
 * Contenido de la pestaña `gomeria`, que ya no tiene pantalla propia: reenvía los enlaces viejos
 * (`?tab=gomeria&gomeria_tab=…`: marcadores, notificaciones y mails guardados) a donde vive ahora cada vista.
 *
 * - `ordenes_gomeria` o sin valor → Gestión > Taller > Gomería.
 * - `catalogo_cubiertas` → Almacenes > Cubiertas.
 * - `plantillas_cubiertas`, `marcas_cubiertas`, `tipos_cubiertas` → Configuración > Taller > Cubiertas.
 *
 * Si el usuario no puede ver la vista pedida, va a la primera de las otras que sí puede ver (no se pierde el acceso
 * que tenía a Gomería). Redirige en el servidor con `redirect()`; sin ninguna, avisa en vez de dejar una pantalla vacía.
 */
export function GomeriaLegacyRedirect({ searchParams, permissions }: GomeriaLegacyRedirectProps) {
  const raw = searchParams.gomeria_tab;
  const requested = typeof raw === 'string' ? raw : 'ordenes_gomeria';
  const start = Math.max(
    0,
    LEGACY_VIEWS.findIndex((view) => view.value === requested)
  );

  const ordered = [...LEGACY_VIEWS.slice(start), ...LEGACY_VIEWS.slice(0, start)];
  const target = ordered.find((view) => permissions[`mantenimiento:${view.value}:view`] === true);
  if (target) redirect(target.href);

  return (
    <StateBlock variant="noperm" title="Sin acceso" description="No tenés permisos para ver ninguna sección de gomería." />
  );
}
