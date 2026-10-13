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
export { DataTableColumnHeader } from './DataTableColumnHeader';
export { DataTableDateRangeFilter } from './DataTableDateRangeFilter';
export { DataTableFacetedFilter } from './DataTableFacetedFilter';
export { DataTableFilterOptions } from './DataTableFilterOptions';
export { DataTablePagination } from './DataTablePagination';
export { DataTableTextFilter } from './DataTableTextFilter';
export { DataTableToolbar } from './DataTableToolbar';
export { DataTableViewOptions } from './DataTableViewOptions';

// Hook (solo cliente)
export { useDataTable } from './useDataTable';
export { useDataTableFilter } from './useDataTableFilter';

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
  // Export types
  DataTableExportConfig,
  DataTableExportOptions,
  DataTableFacetedFilterConfig,
  DataTableFacetedFilterProps,
  // Filter types
  DataTableFilterOption,
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
