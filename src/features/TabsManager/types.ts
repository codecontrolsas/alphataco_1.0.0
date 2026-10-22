import type { AllTabSlugsUnion, ModuleSlug } from '@/features/Permissions/permissions-map';
import React from 'react';

/**
 * Definición de una pestaña para el TabsManager con tipado fuerte.
 *
 * El tipado genérico permite autocompletado inteligente:
 * - moduleSlug: Autocompleta todos los módulos disponibles
 * - tabSlug: Autocompleta tabs y subtabs del módulo seleccionado (hasta 3 niveles de anidación)
 *
 * Soporta:
 * - Tabs principales de un módulo (nivel 1)
 * - Subtabs de una tab principal (nivel 2)
 * - Sub-subtabs de una subtab (nivel 3)
 * - Múltiples módulos en un mismo array de tabs
 *
 * @example
 * ```tsx
 * // Tab principal
 * const tab: TabDefinition<'dashboard'> = {
 *   value: 'principal',
 *   label: 'Principal',
 *   moduleSlug: 'dashboard',  // ← Tipado fuerte
 *   tabSlug: 'principal',      // ← Autocompleta tabs de dashboard
 *   content: <Content />,
 * };
 *
 * // Subtabs (nivel 2)
 * const subtab: TabDefinition<'dashboard'> = {
 *   value: 'empleados',
 *   moduleSlug: 'dashboard',
 *   tabSlug: 'empleados',      // ← Subtabs de 'documentacion'
 *   content: <Content />,
 * };
 *
 * // Múltiples módulos
 * const tabs: TabDefinition<'empleados' | 'documentacion'>[] = [
 *   { moduleSlug: 'empleados', tabSlug: 'employees', ... },
 *   { moduleSlug: 'documentacion', tabSlug: 'tipos-de-documentos', ... },
 * ];
 * ```
 */
export interface TabDefinition<M extends ModuleSlug = ModuleSlug> {
  /** Identificador único de la pestaña en la URL */
  value: string;
  /** Etiqueta a mostrar en la pestaña (Texto o Componente) */
  label: string | React.ReactNode;
  /** Contenido a renderizar cuando la pestaña está activa */
  content: React.ReactNode;
  /**
   * Slug del módulo para verificación de permisos.
   * Obtener de: src/features/Permissions/permissions-map.ts
   * Ejemplo: 'dashboard', 'empleados', 'equipos'
   *
   * Autocompleta automáticamente todos los módulos disponibles.
   * Debe ser un módulo válido definido en permissions-map.ts.
   */
  moduleSlug?: M;
  /**
   * Slug del tab/subtab/sub-subtab para verificación de permisos.
   * Obtener de: src/features/Permissions/permissions-map.ts
   *
   * Autocompleta automáticamente todos los tabs y subtabs válidos (hasta 3 niveles de anidación):
   * - Nivel 1: Tabs principales (ej: 'employees', 'diagrams')
   * - Nivel 2: Subtabs (ej: 'empleados-activos', 'empleados-inactivos')
   * - Nivel 3: Sub-subtabs (ej: 'indicadores', 'graficos')
   *
   * Cuando hay múltiples módulos en el array, acepta tabs válidos de cualquiera de esos módulos.
   * Se valida en tiempo de compilación que el tabSlug existe en permissions-map.ts.
   */
  tabSlug?: AllTabSlugsUnion<M>;
  /** Deshabilita la pestaña */
  disabled?: boolean;
  /** Otros valores de la URL que también abren esta pestaña (enlaces viejos o marcadores). */
  aliases?: string[];
  /**
   * La pestaña es visible si el usuario puede ver ALGUNA de estas tabs (mismo checker que `moduleSlug`/`tabSlug`,
   * que además se evalúa si están presentes). Para una pestaña que junta varias tabs con permiso propio.
   */
  visibleWhenAny?: Array<{ moduleSlug: M; tabSlug: AllTabSlugsUnion<M> }>;
  /**
   * `SectionManagerServer`: no dibuja el `<h1>` con el `label` porque el contenido trae su propio
   * título (ej. el Centro de Ayuda del módulo de TaskApp). Sin esto quedaban dos títulos.
   */
  hideTitle?: boolean;
  /** Texto corto bajo el título de la sección (`PageHeader`). */
  description?: string;
}

/**
 * Props de `SectionManagerServer`: monta una sola sección según `?<paramName>=`.
 *
 * El sidebar navega con `?tab=<value>` y nada más: el href descarta el resto de los parámetros, así que un
 * `subtab` viejo no sobrevive al cambio de sección y no hace falta limpiarlo a mano.
 */
export interface SectionManagerServerProps<M extends ModuleSlug = ModuleSlug> {
  /** Nombre del parámetro en la URL (ej: 'tab', 'view', 'section') */
  paramName: string;
  /** Lista de secciones a renderizar */
  tabs: readonly TabDefinition<M>[] | TabDefinition<M>[];
  /** Valor de la sección por defecto si no hay nada en la URL. */
  defaultTab: string;
  /** Parámetros de búsqueda actuales (searchParams de la Page) - En Next.js 16 es una Promise */
  searchParams:
    | Promise<{ [key: string]: string | string[] | undefined }>
    | { [key: string]: string | string[] | undefined };
  /**
   * Objeto plano de permisos (OBLIGATORIO), obtenido en cada página con `getUserPermissionsMapServer()`.
   * No hay fallback: si no se proporciona, no habrá permisos.
   */
  permissions: Record<string, boolean>;
  /**
   * Acciones a renderizar a la derecha del título.
   * Útil para botones de acción como "Agregar", "Exportar", etc.
   */
  actions?: React.ReactNode;
}

/** Una vista dentro de una sección (`ViewManagerServer`): contenido alternativo de la misma pantalla. */
export interface ViewDefinition<M extends ModuleSlug = ModuleSlug>
  extends Pick<TabDefinition<M>, 'value' | 'content' | 'moduleSlug' | 'tabSlug'> {
  /** Texto plano: se usa también como `aria-label` del selector. */
  label: string;
  description?: string;
  /**
   * Contador junto al nombre de la vista. Se renderiza solo para la vista activa; su carga se comparte
   * con la lista vía `React.cache`, así las otras vistas no ejecutan su consulta solo para un número.
   */
  counter?: React.ReactNode;
  /** Otros valores de la URL que también abren esta vista (enlaces viejos o marcadores). */
  aliases?: string[];
  /**
   * Opt-in (default `false`): `ViewManagerServer` envuelve el contenido de la vista activa en una superficie
   * (`SectionCard`, `bg-card` + borde). NO usar donde el contenido ya trae su Card o es una grilla de widgets / ficha.
   */
  surface?: boolean;
  /**
   * La vista es visible si el usuario puede ver ALGUNA de estas pestañas (mismo checker que `moduleSlug`/`tabSlug`).
   * Se evalúa además de `moduleSlug`/`tabSlug` cuando también están presentes.
   */
  visibleWhenAny?: Array<{ moduleSlug: M; tabSlug: AllTabSlugsUnion<M> }>;
}

export interface ViewManagerServerProps<M extends ModuleSlug = ModuleSlug> {
  /** Parámetro de URL que guarda la vista activa (ej. `view`). */
  paramName: string;
  views: ViewDefinition<M>[];
  defaultView: string;
  searchParams: SectionManagerServerProps<M>['searchParams'];
  permissions: Record<string, boolean>;
  /** Parámetros que se conservan al cambiar de vista (default `['tab']`); el resto se descarta. */
  preserveParams?: string[];
  /** `menu`: desplegable en todos los anchos. `rail`: columna lateral desde `2xl`, desplegable debajo. */
  layout?: 'rail' | 'menu';
  ariaLabel: string;
  actions?: React.ReactNode;
}
