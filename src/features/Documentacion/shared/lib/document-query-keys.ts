import type { QueryClient } from '@tanstack/react-query';

/**
 * Prefijos de las `queryKey` de las listas de documentos (empleados, equipos y empresa; permanentes y
 * mensuales) y de los facets de sus filtros. Tras una mutación se invalidan sólo estos, no toda la
 * caché de React Query. Si una lista cambia su `queryKey`, actualizarla acá.
 */
export const DOCUMENT_LIST_QUERY_KEYS = [
  ['employee-permanent-docs'],
  ['monthly-employee-documents'],
  ['equipment-permanent-docs'],
  ['monthly-equipment-documents'],
  ['company-docs'],
  ['datatable-facet'],
] as const;

export function invalidateDocumentLists(queryClient: QueryClient): Promise<void[]> {
  return Promise.all(
    DOCUMENT_LIST_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey] }))
  );
}
