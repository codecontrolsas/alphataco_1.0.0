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
  /**
   * `SectionManagerServer`: no dibuja el `<h1>` con el `label` porque el contenido trae su propio
   * título (ej. el Centro de Ayuda del módulo de TaskApp). Sin esto quedaban dos títulos.
   */
  hideTitle?: boolean;
  /**
   * `SectionManagerServer` con `sectionNav`: contador que se dibuja junto al nombre de la sección en la
   * sub-navegación (suele ser un Server Component async envuelto en su propio `<Suspense>`).
   */
  navCounter?: React.ReactNode;
}

/**
 * Props para el componente de Servidor TabsManagerServer con tipado inferido.
 *
 * El tipo de `defaultTab` se infiere automáticamente desde los valores de `tabs`.
 *
 * Para habilitar el autocompletado de `defaultTab`, usa `as const` en el array de tabs:
 *
 * @example
 * ```tsx
 * const tabs = [
 *   { value: 'principal', ... },
 *   { value: 'documentacion', ... },
 * ] as const;
 *
 * <TabsManagerServer
 *   paramName="tab"
 *   searchParams={searchParams}
 *   tabs={tabs}
 *   defaultTab="principal"  // ← Solo acepta: 'principal' | 'documentacion'
 *   dependentParams={['subtab']}
 * />
 * ```
 */
export interface TabsManagerServerProps<M extends ModuleSlug = ModuleSlug> {
  /** Nombre del parámetro en la URL (ej: 'tab', 'view', 'section') */
  paramName: string;
  /** Lista de pestañas a renderizar */
  tabs: readonly TabDefinition<M>[] | TabDefinition<M>[];
  /**
   * Valor de la pestaña por defecto si no hay nada en la URL.
   * Para tipado fuerte, usa `as const` en el array de tabs.
   */
  defaultTab: string;
  /** Parámetros de búsqueda actuales (searchParams de la Page) - En Next.js 16 es una Promise */
  searchParams:
    | Promise<{ [key: string]: string | string[] | undefined }>
    | { [key: string]: string | string[] | undefined };
  /**
   * Lista de parámetros de URL que dependen de este tab y deben limpiarse al cambiar.
   *
   * Ejemplo: Si tienes tabs anidadas con paramName="subtab", al cambiar la tab principal
   * debes limpiar 'subtab' para evitar estados inconsistentes.
   *
   * @example
   * ```tsx
   * // URL: /dashboard?tab=documentacion&subtab=empleados
   * // Usuario cambia a tab="estadisticas"
   * // Con dependentParams={['subtab']}: /dashboard?tab=estadisticas ✅
   * // Sin dependentParams: /dashboard?tab=estadisticas&subtab=empleados ❌
   * ```
   */
  dependentParams?: string[];
  /**
   * Objeto plano de permisos (OBLIGATORIO).
   *
   * Debe obtenerse en cada página usando getUserPermissionsMapServer() y pasarse como prop.
   * No hay fallback: si no se proporciona, no habrá permisos.
   *
   * @example
   * ```tsx
   * // En cada página
   * const permissions = await getUserPermissionsMapServer();
   *
   * <TabsManagerServer
   *   permissions={permissions}  // ← OBLIGATORIO
   *   tabs={tabs}
   *   ...
   * />
   * ```
   */
  permissions: Record<string, boolean>;
  /**
   * Variante visual de las tabs.
   * - 'line': Underline, más prominente (para tabs principales de nivel 1)
   * - 'default': Pill con fondo muted (para subtabs de nivel 2+)
   * @default 'default'
   */
  variant?: TabsManagerVariant;
  /**
   * Acciones a renderizar a la derecha de la lista de tabs.
   * Útil para botones de acción como "Agregar", "Exportar", etc.
   */
  actions?: React.ReactNode;
}

/**
 * Variante visual del TabsManager.
 * - 'default': Estilo pill con fondo muted (ideal para subtabs)
 * - 'line': Estilo underline sin fondo (ideal para tabs principales)
 */
export type TabsManagerVariant = 'default' | 'line';

/**
 * Props para el componente Cliente TabsManagerClient con tipado inferido.
 */
export interface TabsManagerClientProps<M extends ModuleSlug = ModuleSlug> {
  /** Nombre del parámetro en la URL */
  paramName: string;
  /** Lista de pestañas (ya filtradas por permisos en el servidor) */
  tabs: readonly TabDefinition<M>[] | TabDefinition<M>[];
  /**
   * Pestaña activa inicial.
   * Para tipado fuerte, usa `as const` en el array de tabs.
   */
  defaultTab: string;
  /** Parámetros dependientes a limpiar al cambiar de tab */
  dependentParams?: string[];
  /** Clases CSS para la lista de tabs */
  listClassName?: string;
  /** Clases CSS para los triggers de tabs */
  triggerClassName?: string;
  /** Clases CSS para el contenido de tabs */
  contentClassName?: string;
  /**
   * Variante visual de las tabs.
   * - 'line': Underline, más prominente (para tabs principales de nivel 1)
   * - 'default': Pill con fondo muted (para subtabs de nivel 2+)
   * @default 'default'
   */
  variant?: TabsManagerVariant;
  /**
   * Acciones a renderizar a la derecha de la lista de tabs.
   * Útil para botones de acción como "Agregar", "Exportar", etc.
   */
  actions?: React.ReactNode;
}

/**
 * Props de `SectionManagerServer`: las mismas que `TabsManagerServer` menos lo que describe una
 * barra de pestañas que ya no existe (`variant`, `dependentParams`).
 *
 * `dependentParams` no hace falta porque el sidebar navega con `?tab=<value>` y nada más: el
 * href descarta el resto de los parámetros, así que un `subtab` viejo no sobrevive al cambio de
 * sección. Antes había que limpiarlo a mano porque el cambio de tab era un `replaceState` sobre
 * la URL existente.
 */
export interface SectionManagerServerProps<M extends ModuleSlug = ModuleSlug>
  extends Omit<TabsManagerServerProps<M>, 'variant' | 'dependentParams'> {
  /**
   * Opt-in (default `false`): dibuja una sub-navegación con enlaces y contadores por sección sobre el
   * contenido. Los módulos que no la piden siguen navegando solo por el sidebar.
   */
  sectionNav?: boolean;
}
