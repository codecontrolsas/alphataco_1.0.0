import type { Column, ColumnDef, Row, Table } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';

// ============================================================================
// SEARCH PARAMS TYPES
// ============================================================================

/**
 * Parámetros de URL para el DataTable server-side
 */
export interface DataTableSearchParams {
  /** Página actual (0-indexed internamente, 1-indexed en URL) */
  page?: string;
  /** Cantidad de filas por página */
  pageSize?: string;
  /** Multi-sort compacto: "name.asc,status.desc" */
  sort?: string;
  /** @deprecated Usar `sort` — Campo por el cual ordenar (compat legacy) */
  sortBy?: string;
  /** @deprecated Usar `sort` — Dirección del ordenamiento (compat legacy) */
  sortOrder?: 'asc' | 'desc';
  /** Término de búsqueda global */
  search?: string;
  /** Filtros adicionales como query params (ej: status=PENDING&priority=HIGH) */
  [key: string]: string | string[] | undefined;
}

/**
 * Elemento de sorting individual
 */
export interface SortItem {
  /** ID de la columna */
  id: string;
  /** true = descendente, false = ascendente */
  desc: boolean;
}

/**
 * Estado parseado de los search params
 */
export interface DataTableState {
  page: number;
  pageSize: number;
  /** Array de ordenamientos (multi-sort) */
  sorting: SortItem[];
  search: string;
  filters: Record<string, string[]>;
}

// ============================================================================
// FILTER TYPES
// ============================================================================

/**
 * Opción de filtro faceteado
 */
export interface DataTableFilterOption {
  /** Valor que se envía al servidor */
  value: string;
  /** Etiqueta visible para el usuario */
  label: string;
  /** Icono opcional */
  icon?: LucideIcon;
  /** Color del badge (para estados) */
  color?: string;
}

/**
 * Resultado de un fetch de facet individual (lazy-load)
 */
export interface FacetResult {
  /** Opciones del filtro (con labels resueltos) */
  options: DataTableFilterOption[];
  /** Mapa de contadores por valor */
  counts: Map<string, number>;
}

/**
 * Configuración de un filtro faceteado
 */
export interface DataTableFacetedFilterConfig {
  /** ID de la columna (debe coincidir con el accessorKey) */
  columnId: string;
  /** Título del filtro */
  title: string;
  /** Tipo de filtro: 'faceted' para multi-select, 'dateRange' para rango de fechas, 'text' para texto libre */
  type?: 'faceted' | 'dateRange' | 'text';
  /** Placeholder para el input de texto (solo para tipo 'text') */
  placeholder?: string;
  /** Opciones disponibles (solo para tipo 'faceted') */
  options?: DataTableFilterOption[];
  /** Contadores externos del servidor (reemplaza el conteo local de facets cuando se proveen) */
  externalCounts?: Map<string, number>;
  /** Deshabilitar el filtro (ej. mientras se cargan las opciones) */
  disabled?: boolean;
  /**
   * Fetch individual de opciones+counts bajo demanda.
   * Cuando se provee, las opciones se cargan lazy al abrir el popover (no en bulk).
   * Recibe los searchParams actuales (sin page/sort) para cross-filtering.
   * El resultado se cachea en React Query (staleTime 5min).
   */
  fetchFacet?: (facetParams: DataTableSearchParams) => Promise<FacetResult>;
}

// ============================================================================
// COLUMN TYPES
// ============================================================================

/**
 * Configuración extendida para columnas del DataTable
 */
export interface DataTableColumnConfig<TData> {
  /** ID único de la columna */
  id: string;
  /** Título visible en el header */
  title: string;
  /** Key del objeto de datos (para accessorKey) */
  accessorKey?: keyof TData | string;
  /** Función de acceso personalizada */
  accessorFn?: (row: TData) => unknown;
  /** Si la columna es ordenable (default: true) */
  sortable?: boolean;
  /** Si la columna se puede ocultar (default: true) */
  hideable?: boolean;
  /** Si la columna es filtrable */
  filterable?: boolean;
  /** Ancho fijo de la columna */
  width?: number | string;
  /** Alineación del contenido */
  align?: 'left' | 'center' | 'right';
  /** Renderizado personalizado de la celda */
  cell?: (props: { row: Row<TData>; getValue: () => unknown }) => React.ReactNode;
}

// ============================================================================
// EXPORT CONFIG
// ============================================================================

/**
 * Opciones para exportación a Excel
 */
export interface DataTableExportOptions {
  /** Nombre del archivo (sin extensión) */
  filename: string;
  /** Nombre de la hoja en Excel */
  sheetName?: string;
  /** Título del reporte (se muestra en la primera fila) */
  title?: string;
  /** Incluir fecha de generación (default: true) */
  includeDate?: boolean;
}

/**
 * Configuración de exportación a Excel
 */
export interface DataTableExportConfig<TData> {
  /**
   * Función que obtiene TODOS los datos con los filtros actuales (sin paginación)
   * Esta función se llama cuando el usuario hace clic en "Exportar"
   */
  fetchAllData: () => Promise<TData[]>;
  /**
   * Opciones de exportación
   */
  options: DataTableExportOptions;
  /**
   * Formatters personalizados por key de columna
   * Útil para convertir enums a labels legibles
   * @example { status: (val) => statusLabels[val] }
   */
  formatters?: Record<string, (value: unknown, row: TData) => string | number | null>;
  /**
   * Columnas adicionales a excluir (además de 'select' y 'actions')
   */
  excludeColumns?: string[];
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

/**
 * Props del componente DataTable principal
 */
export interface DataTableProps<TData, TValue = unknown> {
  /** Definiciones de columnas de TanStack Table */
  columns: ColumnDef<TData, TValue>[];
  /** Datos de la página actual */
  data: TData[];
  /** Total de filas en el servidor (para paginación) */
  totalRows: number;
  /** Search params actuales de la URL */
  searchParams?: DataTableSearchParams;
  /** Configuración de filtros faceteados */
  facetedFilters?: DataTableFacetedFilterConfig[];
  /** Placeholder del input de búsqueda */
  searchPlaceholder?: string;
  /** Key del campo donde buscar (default: busca en todos) */
  searchColumn?: string;
  /** Mostrar selector de columnas (default: true) */
  showColumnToggle?: boolean;
  /** Mostrar contador de selección (default: false) */
  showRowSelection?: boolean;
  /** Habilitar selección de filas (default: false) */
  enableRowSelection?: boolean | ((row: Row<TData>) => boolean);
  /** Callback cuando cambia la selección — entrega las filas seleccionadas de la página actual. */
  onRowSelectionChange?: (selectedRows: TData[]) => void;
  /**
   * Callback cuando cambia la selección — entrega los IDs de TODAS las filas seleccionadas
   * (acumulando entre páginas). Requiere que el dato tenga campo `id`.
   */
  onRowSelectionIdsChange?: (ids: string[]) => void;
  /**
   * Trigger externo para limpiar la selección de filas. Cada vez que este valor
   * cambia (cualquier número distinto al anterior), el DataTable resetea su
   * estado interno de `rowSelection`. Útil para que un padre que muestre una
   * acción masiva pueda deseleccionar todo desde afuera sin perder otros estados
   * (filtros, paginación, sorting).
   */
  clearSelectionTrigger?: number;
  /** Mensaje cuando no hay resultados */
  emptyMessage?: string;
  /**
   * Debajo de `md` dibuja cada fila como una tarjeta (rótulo + valor por columna) en vez de una tabla
   * con scroll horizontal. Opt-in: asume que la 1.ª columna es el selector y la 2.ª la identidad de la fila.
   */
  mobileCards?: boolean;
  /** Tamaños de página disponibles */
  pageSizeOptions?: number[];
  /** Componente de acciones para el toolbar */
  toolbarActions?: React.ReactNode;
  /** Configuración de exportación a Excel (si se omite, se oculta el botón) */
  exportConfig?: DataTableExportConfig<TData>;
  /** Mostrar botón de exportar a Excel (default: true si hay exportConfig) */
  showExportButton?: boolean;
  /** Visibilidad inicial de columnas (para ocultar columnas por defecto) */
  initialColumnVisibility?: Record<string, boolean>;
  /**
   * Filas por página iniciales (preferencia guardada del usuario o default de la tabla).
   * Se aplica cuando la URL no trae `pageSize`. Si hay `tableId`, los cambios del
   * usuario se persisten automáticamente.
   */
  initialPageSize?: number;
  /**
   * Ordenamiento inicial (preferencia guardada del usuario o default de la tabla).
   * Se aplica cuando la URL no trae `sort`. Si hay `tableId`, los cambios del
   * usuario se persisten automáticamente.
   */
  initialSorting?: SortItem[];
  /**
   * Persistir filas por página y ordenamiento del usuario (requiere `tableId`).
   * Es opt-in: solo tiene sentido en tablas cuyo Server Component además APLICA
   * esas preferencias con `applyTablePreferences` + `initialPageSize`/`initialSorting`.
   * Sin eso, la tabla guardaría una vista que nunca vuelve a usar.
   */
  persistViewPreferences?: boolean;
  /**
   * Permite al usuario reordenar las columnas y persiste ese orden (requiere `tableId`).
   * Opt-in: solo las tablas que lo habilitan muestran la interacción de reordenamiento.
   */
  enableColumnReorder?: boolean;
  /** Orden de columnas guardado por el usuario (ids de izquierda a derecha) */
  initialColumnOrder?: string[];
  /** ID único de la tabla para persistir preferencias por usuario */
  tableId?: string;
  /** Namespace para aislar params de URL entre DataTables en la misma página.
   * Cuando se pasa, todos los params (page, sort, filters) se prefijan con `${paramNamespace}__`
   * para evitar colisiones entre tablas en diferentes tabs. */
  paramNamespace?: string;
  /** Mostrar botón para toggle de visibilidad de filtros (default: false) */
  showFilterToggle?: boolean;
  /** Visibilidad inicial de filtros (cargada desde preferencias del servidor) */
  initialFilterVisibility?: Record<string, boolean>;
  /** Mostrar input de búsqueda en el toolbar (default: false) */
  showSearch?: boolean;
  /** ID del test para cypress */
  'data-testid'?: string;
  /** Indica que los facets se están re-fetcheando (muestra skeletons en los filtros activos) */
  isFetchingFacets?: boolean;

  /** Función para asignar className condicional a cada fila (ej: background por estado) */
  rowClassName?: (row: TData) => string;

  // ---- Client-side navigation mode ----

  /**
   * Función para fetch de datos client-side. Cuando se provee, la tabla usa React Query
   * internamente y window.history.replaceState (NO router.push) para actualizar la URL.
   * Los props `data` y `totalRows` se usan como datos iniciales (SSR).
   */
  queryFn?: (params: DataTableSearchParams) => Promise<{ data: TData[]; total: number }>;

  /** Key base para React Query (solo con queryFn). Se le agrega el state como último elemento. */
  queryKey?: readonly unknown[];

  /**
   * Callback que se dispara cada vez que el estado de la tabla cambia (filtros, sort, paginación).
   * Útil para que el padre actualice queries dependientes (ej: facets) con los nuevos params.
   */
  onStateChange?: (searchParams: DataTableSearchParams) => void;

  // ---- In-memory mode ----

  /**
   * Modo in-memory (opt-in, default `false`): la tabla recibe el dataset COMPLETO por `data`
   * y resuelve ordenamiento, filtros, búsqueda y paginación en el cliente con los row models
   * de TanStack, sin ir al servidor.
   *
   * Usar SOLO cuando los datos no se pueden paginar server-side — por ejemplo, el resultado
   * de un RPC de Postgres que devuelve un JSON entero. Para cualquier tabla que pueda paginar
   * con Prisma, el modo correcto sigue siendo `queryFn`.
   *
   * Requisitos en las columnas: `filterFn` en toda columna filtrable (el valor del filtro llega
   * como `string[]`) y `sortingFn` en las columnas cuyo valor crudo no ordena bien de forma
   * alfabética (fechas `DD/MM/YYYY`, por ejemplo). Ver los helpers de `./in-memory`.
   *
   * Se ignora si se pasa `queryFn`.
   */
  inMemory?: boolean;
}

/**
 * Props del DataTableToolbar
 */
export interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  /** Habilita reordenar columnas desde el menu de columnas */
  enableColumnReorder?: boolean;
  searchPlaceholder?: string;
  searchColumn?: string;
  facetedFilters?: DataTableFacetedFilterConfig[];
  showColumnToggle?: boolean;
  toolbarActions?: React.ReactNode;
  exportActions?: React.ReactNode;
  showSearch?: boolean;
  tableId?: string;
  showFilterToggle?: boolean;
  filterVisibility?: Record<string, boolean>;
  onFilterVisibilityChange?: (visibility: Record<string, boolean>) => void;
  /** Namespace para prefijar los params de URL de filtros de texto y dateRange */
  paramNamespace?: string;
  /** Indica que los facets se están re-fetcheando (se propaga a cada FacetedFilter) */
  isFetchingFacets?: boolean;
  /** Params actuales de la tabla (sin page/sort) para lazy-load de facets */
  facetParams?: DataTableSearchParams;
  /** Identidad de la tabla en la queryKey de los facets lazy (ver DataTableFacetedFilterProps.facetScope) */
  facetScope?: readonly unknown[];
  /**
   * Handler externo para cambios de búsqueda global (sincroniza con URL via router).
   * Cuando se provee, reemplaza el comportamiento local de TanStack Table (setGlobalFilter).
   */
  onSearchChange?: (value: string) => void;
  /**
   * Valor controlado de la búsqueda global (desde URL).
   * Se usa junto con onSearchChange para mantener sincronía con el servidor.
   */
  searchValue?: string;
  /**
   * Indica si hay filtros activos en el estado de la tabla (incluyendo dateRange _from/_to
   * y filtros de columnas no visibles en el toolbar).
   * Cuando es true, se muestra el botón "Limpiar filtros" aunque `columnFilters` de TanStack
   * esté vacío (caso: filtro en columna oculta o filtro dateRange llegado por URL).
   */
  hasActiveFilters?: boolean;
  /**
   * Callback para limpiar TODOS los filtros activos (incluyendo dateRange y columnas ocultas).
   * Cuando se provee, reemplaza el `table.resetColumnFilters()` por defecto.
   */
  onResetFilters?: () => void;
}

/**
 * Props del DataTablePagination
 */
export interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  totalRows: number;
  pageSizeOptions?: number[];
  showRowSelection?: boolean;
}

/**
 * Props del DataTableColumnHeader
 */
export interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
}

/**
 * Props del DataTableFacetedFilter
 */
export interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>;
  title: string;
  options: DataTableFilterOption[];
  /** Contadores externos del servidor (reemplaza el conteo local de facets) */
  externalCounts?: Map<string, number>;
  /** Deshabilitar el filtro (ej. mientras se cargan las opciones) */
  disabled?: boolean;
  /** Indica que los facets se están re-fetcheando (muestra skeletons en el popover) */
  isFetching?: boolean;
  /**
   * Fetch individual de opciones+counts bajo demanda (lazy-load).
   * Cuando se provee, las opciones se cargan al abrir el popover.
   */
  fetchFacet?: (facetParams: DataTableSearchParams) => Promise<FacetResult>;
  /** Params actuales de la tabla (sin page/sort) para queryKey de React Query */
  facetParams?: DataTableSearchParams;
  /**
   * Identidad de la tabla dueña del filtro (su `queryKey`). Va en la queryKey del facet:
   * sin ella, dos tablas montadas a la vez con el mismo columnId (ej. `status`) y los
   * mismos params comparten la entrada de cache y una muestra las opciones de la otra.
   */
  facetScope?: readonly unknown[];
}

/**
 * Props del DataTableViewOptions
 */
export interface DataTableViewOptionsProps<TData> {
  table: Table<TData>;
  /** Habilita la interaccion para reordenar columnas dentro del menu */
  enableColumnReorder?: boolean;
}

// ============================================================================
// SERVER ACTION TYPES
// ============================================================================

/**
 * Parámetros para server actions de paginación
 */
export interface DataTableQueryParams {
  page: number;
  pageSize: number;
  /** Multi-sort array */
  sorting?: SortItem[];
  search?: string;
  filters?: Record<string, string[]>;
}

/**
 * Respuesta de server actions con paginación
 */
export interface DataTableQueryResult<TData> {
  data: TData[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

// ============================================================================
// PRISMA HELPERS
// ============================================================================

/**
 * Genera los parámetros de Prisma a partir de DataTableQueryParams
 */
export interface PrismaTableParams {
  skip: number;
  take: number;
  orderBy?: Record<string, 'asc' | 'desc'>[];
  where?: Record<string, unknown>;
}
