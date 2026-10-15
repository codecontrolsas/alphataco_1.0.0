import { prisma } from '@/shared/lib/prisma';
import { assertDailyReportInCompany, filterRowsInCompany } from './row-query';

type TypeService = 'mensual' | 'adicional' | 'adicional_permanente';

/**
 * Resuelve las líneas efectivas a clonar (compartido por `cloneDailyReportRows` y `getCloneConflicts`).
 *
 * - Con `rowIds`: sólo las que cuelgan de la empresa activa.
 * - Sin `rowIds` y con `cloneAllFromReportId` ("clonar todo"): todas las del parte (filtro opcional por tipo).
 * - Sin ninguno de los dos: lista vacía.
 */
export async function resolveCloneRowIds(
  companyId: string,
  rowIds: string[],
  cloneAllFromReportId?: string,
  typeServiceFilter?: TypeService[]
): Promise<string[]> {
  if (rowIds.length > 0) return filterRowsInCompany(rowIds, companyId);
  if (!cloneAllFromReportId) return [];

  await assertDailyReportInCompany(cloneAllFromReportId, companyId);
  const allRows = await prisma.dailyreportrows.findMany({
    where: {
      daily_report_id: cloneAllFromReportId,
      ...(typeServiceFilter?.length ? { type_service: { in: typeServiceFilter } } : {}),
    },
    select: { id: true },
  });
  return allRows.map((r) => r.id);
}
