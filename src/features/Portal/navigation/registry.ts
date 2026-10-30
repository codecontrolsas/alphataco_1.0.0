import type { ModuleKey } from '@/features/Modules/catalog';
import { FileText, GraduationCap, House, UserRound, type LucideIcon } from 'lucide-react';

/**
 * Registro central de navegación del portal del empleado.
 *
 * Es la única fuente de las secciones: de acá salen el sidebar, el menú móvil (hoja y barra inferior), el título de
 * sección de la cabecera, el estado activo (`aria-current`), los accesos rápidos del inicio y el corte por módulo de
 * cada página (`requirePortalSection`). Las rutas siguen siendo archivos de App Router: sumar una sección es agregar
 * una entrada acá y su carpeta en `src/app/portal/(panel)/` + `src/features/Portal/components/` (ver
 * `docs/desarrollo/portal-nueva-seccion.md`).
 *
 * Módulo SIN directiva y sin dependencias de servidor: lo importan componentes cliente (los íconos no viajan como prop
 * del servidor al cliente). Los conteos de los badges se resuelven aparte, en `badges.server.ts`.
 */

/** Claves de los contadores de pendientes que puede mostrar una sección (los resuelve `badges.server.ts`). */
export const PORTAL_BADGE_KEYS = ['documents', 'trainings'] as const;
export type PortalBadgeKey = (typeof PORTAL_BADGE_KEYS)[number];
export type PortalBadgeCounts = Partial<Record<PortalBadgeKey, number>>;

export interface PortalSection {
  /** Identificador estable (se usa en badges, corte por módulo y tests). */
  id: string;
  /** Ruta de la sección. Es el destino de primer nivel: sus subrutas son "detalle". */
  href: `/portal${string}`;
  /** Nombre en el menú y título de la cabecera. */
  label: string;
  /** Nombre corto para la barra inferior del celular (si no, `label`). */
  shortLabel?: string;
  /** Una línea para los accesos rápidos del inicio. */
  description: string;
  icon: LucideIcon;
  /** Módulo que tiene que estar encendido para la empresa del legajo. Sin módulo: siempre visible. */
  module?: ModuleKey;
  /** Orden en el menú (menor primero). */
  order: number;
  /** Contador de pendientes junto al nombre. */
  badge?: PortalBadgeKey;
  /** Aparece en la barra inferior del celular (máximo 4 o 5 destinos en total). */
  bottomNav: boolean;
  /** Grupo del menú lateral. */
  group: 'main' | 'account';
}

export const PORTAL_SECTIONS = [
  {
    id: 'home',
    href: '/portal',
    label: 'Inicio',
    description: 'Tus pendientes, vencimientos y avisos.',
    icon: House,
    order: 0,
    bottomNav: true,
    group: 'main',
  },
  {
    id: 'documents',
    href: '/portal/documents',
    label: 'Mis documentos',
    shortLabel: 'Documentos',
    description: 'Normas y procedimientos para leer y aceptar.',
    icon: FileText,
    module: 'hse',
    order: 10,
    badge: 'documents',
    bottomNav: true,
    group: 'main',
  },
  {
    id: 'trainings',
    href: '/portal/trainings',
    label: 'Mis capacitaciones',
    shortLabel: 'Capacitaciones',
    description: 'Material, exámenes y constancias.',
    icon: GraduationCap,
    module: 'hse',
    order: 20,
    badge: 'trainings',
    bottomNav: true,
    group: 'main',
  },
  {
    id: 'profile',
    href: '/portal/profile',
    label: 'Mi perfil',
    shortLabel: 'Perfil',
    description: 'Tus datos del legajo y tu contraseña.',
    icon: UserRound,
    order: 100,
    bottomNav: true,
    group: 'account',
  },
] as const satisfies readonly PortalSection[];

export type PortalSectionId = (typeof PORTAL_SECTIONS)[number]['id'];

/** Secciones ordenadas, filtradas por las que el servidor dejó visibles (corte por módulo). */
export function sectionsFor(visibleIds: readonly string[]): PortalSection[] {
  const visible = new Set(visibleIds);
  return [...PORTAL_SECTIONS].filter((s) => visible.has(s.id)).sort((a, b) => a.order - b.order);
}

export function getPortalSection(id: PortalSectionId): PortalSection {
  const section = PORTAL_SECTIONS.find((s) => s.id === id);
  if (!section) throw new Error(`Sección del portal desconocida: ${id}`);
  return section;
}

/** El inicio solo está activo en `/portal`; el resto, en su ruta y sus subrutas. */
export function isSectionActive(pathname: string, href: string): boolean {
  if (href === '/portal') return pathname === '/portal';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sección a la que pertenece una URL (la de `href` más largo que la contiene). */
export function sectionForPath(pathname: string): PortalSection | undefined {
  return [...PORTAL_SECTIONS]
    .filter((s) => isSectionActive(pathname, s.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** `true` si la URL es exactamente un destino de primer nivel (ahí va la barra inferior del celular). */
export function isTopLevelPath(pathname: string): boolean {
  return PORTAL_SECTIONS.some((s) => s.href === pathname);
}

/** Texto accesible del contador: "2 pendientes". */
export function badgeLabel(count: number): string {
  return count === 1 ? '1 pendiente' : `${count} pendientes`;
}
