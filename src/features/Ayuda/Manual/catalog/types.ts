/**
 * Tipos del catálogo del manual. El catálogo es la ÚNICA declaración de qué guías existen, a qué
 * permiso responde cada una y qué pantallas documenta: de acá salen el índice, el filtrado por
 * permisos, anterior/siguiente, la búsqueda y el botón "?" del encabezado.
 *
 * Todo el directorio `catalog/` es puro (sin `@/`, sin React, sin `server-only`) para que lo pueda
 * leer también `scripts/check-manual.ts` con Node.
 */
import type { ModuleSlug } from '../../../Permissions/permissions-map.ts';

/** Una tab o subtab del mapa de permisos. Se arma con `tab()`, que la valida al compilar. */
export type TabRef = { module: ModuleSlug; tab: string };

/**
 * Pantalla del sistema que documenta una guía. Alimenta el botón "?" (qué guía abrir según dónde
 * está parado el usuario) y el enlace "Abrir pantalla" de la guía.
 *
 * `tab`/`subtab` son los valores de los query params `?tab=` y `?subtab=` tal como aparecen en la
 * URL (que no siempre coinciden con el slug de permisos).
 */
export type ScreenRef = {
  /**
   * Ruta exacta, o `…/*` para "cualquier página hija" (detalles con id en la URL, como
   * `/dashboard/operations/<id>`). Una ruta `/*` nunca es destino de "Abrir pantalla".
   */
  path: `/dashboard${string}`;
  tab?: string;
  subtab?: string;
};

export type GuideDef = {
  /** Identificador global y nombre del archivo: `src/content/manual/<seccion>/<slug>.mdx`. */
  slug: string;
  /**
   * Permisos que habilitan la guía (alcanza con uno). Sin `access` la guía es general: la ve
   * cualquiera que pueda abrir el manual.
   */
  access?: TabRef[];
  /** Tabs/subtabs que la guía documenta además de las de `access` (para el control de cobertura). */
  covers?: TabRef[];
  /** Pantallas que documenta. La primera es la que abre "Abrir pantalla". */
  screens?: ScreenRef[];
  /** "Ver también": otras guías relacionadas. */
  related?: string[];
};

/** Nombres de ícono de sección. La UI los traduce a íconos reales. */
export type SectionIcon =
  | 'start'
  | 'process'
  | 'dashboard'
  | 'employees'
  | 'recruitment'
  | 'equipment'
  | 'commercial'
  | 'documents'
  | 'operations'
  | 'maintenance'
  | 'warehouse'
  | 'forms'
  | 'help'
  | 'settings'
  | 'field';

export type SectionDef = {
  /** Carpeta del contenido: `src/content/manual/<key>/`. */
  key: string;
  title: string;
  description: string;
  icon: SectionIcon;
  guides: GuideDef[];
};

/** Recorrido sugerido para un perfil de usuario ("Si sos de RRHH, leé esto en este orden"). */
export type ReadingPath = {
  id: string;
  title: string;
  audience: string;
  steps: string[];
};

/** Una tab que deliberadamente no tiene guía, con el motivo. */
export type CoverageExclusion = TabRef & { reason: string };
