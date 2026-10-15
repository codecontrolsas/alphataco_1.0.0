import 'server-only';

import { prisma } from '@/shared/lib/prisma';
import { fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import { buildRowSelect } from './row-query';

// El tope y el error son los genéricos de Operaciones; se re-exportan para los consumidores del detalle.
export { EXPORT_MAX_ROWS, ExportTooLargeError } from '@/shared/lib/export-batches';

type ExportWhere = NonNullable<Parameters<typeof prisma.dailyreportrows.findMany>[0]>['where'];
type ExportOrderBy = NonNullable<Parameters<typeof prisma.dailyreportrows.findMany>[0]>['orderBy'];

/** Líneas del parte para el export, por tandas y con tope (ver `Operaciones/lib/export-batches`). */
export function fetchDetailExportRows(where: ExportWhere, orderBy: ExportOrderBy) {
  const order = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];

  return fetchExportRowsInBatches({
    listIds: (take) =>
      prisma.dailyreportrows.findMany({ where, orderBy: [...order, { id: 'asc' as const }], select: { id: true }, take }),
    fetchByIds: (ids) => prisma.dailyreportrows.findMany({ where: { id: { in: ids } }, select: buildRowSelect() }),
    tooLargeMessage: (maxRows) =>
      `El parte tiene más de ${maxRows.toLocaleString('es-AR')} líneas con los filtros actuales. Acote la exportación con filtros.`,
  });
}
