import 'server-only';

import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { ExportTooLargeError } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';

/** Tope de filas de un export de catálogo: más que esto se pide acotar con filtros. */
export const CATALOG_EXPORT_MAX_ROWS = 10_000;

/**
 * `where` del filtro facetado de `is_active` (booleano nullable). Llegan 'true' / 'false' / NULL_FILTER_VALUE.
 * Devuelve `{}` si no hay filtro; con un solo valor, la igualdad; con varios, un OR.
 */
export function buildIsActiveWhere(values: string[] | undefined): {
  is_active?: boolean | null;
  OR?: Array<{ is_active: boolean | null }>;
} {
  if (!values || values.length === 0) return {};

  const toCondition = (value: string) => ({ is_active: value === NULL_FILTER_VALUE ? null : value === 'true' });

  if (values.length === 1) return toCondition(values[0]);
  return { OR: values.map(toCondition) };
}

/** Resultado de error de un export: el mensaje del tope se muestra tal cual, el resto es genérico. */
export function catalogExportFailure(error: unknown, noun: string): Extract<ExportResult<never>, { ok: false }> {
  return {
    ok: false,
    message: error instanceof ExportTooLargeError ? error.message : `No se pudo exportar ${noun}. Intente nuevamente.`,
  };
}
