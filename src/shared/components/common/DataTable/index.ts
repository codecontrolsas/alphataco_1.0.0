// ============================================================================
// DataTable - Server-Side Data Table Component
// ============================================================================
// Documentación completa: ./DOCS.md
// ============================================================================

// Componente principal
export { DataTable } from './DataTable';

// Contexto de estado pendiente (para componentes que necesitan compartir startTransition)
export { DataTablePendingProvider, useDataTablePending } from './DataTablePendingContext';

// Sub-componentes (para uso individual si es necesario)
export { DataTableActiveFilterChip } from './DataTableActiveFilterChip';
export { DataTableCard } from './DataTableCard';
export { DataTableCards } from './DataTableCards';
export { DataTableColumnHeader } from './DataTableColumnHeader';
export { DataTableDateRangeFilter } from './DataTableDateRangeFilter';
export { DataTableDesktop } from './DataTableDesktop';
export { DataTableDetailSheet } from './DataTableDetailSheet';
export { DataTableFacetedFilter } from './DataTableFacetedFilter';
export { DataTableFilterOptions, DataTableFilterVisibilityList } from './DataTableFilterOptions';
export {
  DataTableMobileFilters,
  DataTableMobileFiltersTrigger,
  DataTableMobileSortTrigger,
} from './DataTableMobileFilters';
export { DataTableMoreMenu } from './DataTableMoreMenu';
export { DataTablePagination } from './DataTablePagination';
export { DataTableSelectionBar } from './DataTableSelectionBar';
export { DataTableTextFilter } from './DataTableTextFilter';
export { DataTableToolbar } from './DataTableToolbar';
export { DataTableColumnsPanel, DataTableViewOptions } from './DataTableViewOptions';
export { useDataTableExport } from './_DataTableExportButton';

// Modo mobile (puro, sin directiva): resolución de roles de la tarjeta y label de columna
export { getColumnLabel, getColumnTitle, resolveMobileLayout } from './mobile-columns';

// Hook (solo cliente)
export { useDataTable } from './useDataTable';

// Helpers del modo in-memory (filtros y ordenamiento resueltos en el cliente)
export { inMemoryDateSortingFn, inMemoryFacetedFilterFn, inMemoryTextFilterFn } from './in-memory';

// Helpers puros (pueden usarse en servidor o cliente)
// IMPORTANTE: Para server actions, importar directamente de ./helpers
export {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  PARAM_SEPARATOR,
  applyTablePreferences,
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  parseSortString,
  serializeSorting,
  stateToPrismaParams,
  stateToSearchParams,
  stripPrefixFromSearchParams,
  type TablePreferences,
} from './helpers';

// Types
export type {
  // Column types
  DataTableColumnConfig,
  DataTableColumnHeaderProps,
  DataTableColumnMobileMeta,
  // Export types
  DataTableExportConfig,
  DataTableExportOptions,
  DataTableFacetedFilterConfig,
  DataTableFacetedFilterProps,
  // Filter types
  DataTableFilterOption,
  DataTableFilterVariant,
  DataTableMobileLayoutMode,
  DataTableMobileRole,
  DataTablePaginationProps,
  // Component props
  DataTableProps,
  // Server action types
  DataTableQueryParams,
  DataTableQueryResult,
  // Search params
  DataTableSearchParams,
  DataTableState,
  DataTableToolbarProps,
  DataTableViewOptionsProps,
  FacetResult,
  MobileColumnEntry,
  MobileLayout,
  PrismaTableParams,
  // Sorting
  SortItem,
} from './types';

// Excel export utilities
export {
  exportToExcel,
  tanstackColumnsToExcelColumns,
  type ExcelColumn,
  type ExcelExportOptions,
} from '@/shared/lib/excel-export';
