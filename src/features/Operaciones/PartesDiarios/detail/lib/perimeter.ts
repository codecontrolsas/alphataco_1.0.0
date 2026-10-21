import 'server-only';

import { prisma } from '@/shared/lib/prisma';
import { assertResourcesInCompany, type RowResourceRefs } from '../use-cases/row-perimeter';

// ============================================================================
// PERÍMETRO DE EMPRESA (sin RLS: cada action verifica lo que escribe)
// ============================================================================

/** Lanza si el parte diario no pertenece a la empresa indicada. */
export async function assertDailyReportInCompany(dailyReportId: string, companyId: string): Promise<void> {
  const report = await prisma.dailyreport.findFirst({
    where: { id: dailyReportId, company_id: companyId },
    select: { id: true },
  });
  if (!report) {
    throw new Error('El parte diario no existe o no pertenece a la empresa activa.');
  }
}

/** Lanza si la línea no cuelga de un parte diario de la empresa indicada. */
export async function assertRowInCompany(rowId: string, companyId: string): Promise<void> {
  const row = await prisma.dailyreportrows.findFirst({
    where: { id: rowId, dailyreport: { company_id: companyId } },
    select: { id: true },
  });
  if (!row) {
    throw new Error('La línea del parte diario no existe o no pertenece a la empresa activa.');
  }
}

/** Devuelve, de `rowIds`, sólo las líneas que cuelgan de partes de la empresa indicada. */
export async function filterRowsInCompany(rowIds: string[], companyId: string): Promise<string[]> {
  if (rowIds.length === 0) return [];
  const rows = await prisma.dailyreportrows.findMany({
    where: { id: { in: rowIds }, dailyreport: { company_id: companyId } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export type { RowResourceRefs };

/** Verifica que lo que la línea referencia sea de la empresa activa (misma regla que los casos de uso). */
export async function assertRowResourcesInCompany(companyId: string, refs: RowResourceRefs): Promise<void> {
  await assertResourcesInCompany(prisma, companyId, refs);
}
