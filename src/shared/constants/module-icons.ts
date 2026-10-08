import type { ModuleSlug } from '@/features/Permissions/permissions-map';
import {
  Boxes,
  Building2,
  CalendarDays,
  CircleHelp,
  ClipboardList,
  FileText,
  Handshake,
  LayoutDashboard,
  Settings,
  Truck,
  UserSearch,
  Users,
  Wrench,
} from 'lucide-react';
import type { ComponentType } from 'react';

/** Forma de un icono: la comparten los de lucide y cualquier SVG propio que reciba `className`. */
export type ModuleIcon = ComponentType<{ className?: string }>;

/**
 * Icono de cada modulo del sistema. Fuente unica.
 *
 * Antes vivia duplicado en tres lugares —el sidebar y los dos editores de permisos
 * (`RolePermissionsEditor`, `ModulePermissions`)—, con el riesgo de que un modulo se viera con
 * un icono en el menu y con otro en la pantalla de permisos.
 *
 * Nombres al dia de lucide (0.562): `CircleHelp` en lugar del alias viejo `HelpCircle`,
 * `CalendarDays` en lugar de `Calendar`, y `Handshake` de lucide en lugar del SVG dibujado a
 * mano que habia en `shared/components/common/Icons.tsx`.
 */
export const MODULE_ICONS: Record<ModuleSlug, ModuleIcon> = {
  dashboard: LayoutDashboard,
  configuracion: Settings,
  empleados: Users,
  equipos: Truck,
  comercial: Handshake,
  documentacion: FileText,
  operaciones: CalendarDays,
  mantenimiento: Wrench,
  formularios: ClipboardList,
  ayuda: CircleHelp,
  seleccion: UserSearch,
  almacenes: Boxes,
};

/**
 * Icono de un modulo a partir de un slug que viene de la base (por eso `string` y no
 * `ModuleSlug`: la columna no esta acotada al union de TypeScript). Cae a `Building2` para
 * un slug desconocido, que es lo que hacian los dos editores de permisos antes de compartir
 * el mapa.
 */
export function getModuleIcon(slug: string | null | undefined): ModuleIcon {
  return MODULE_ICONS[slug as ModuleSlug] ?? Building2;
}
