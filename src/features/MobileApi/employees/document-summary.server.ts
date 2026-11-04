import 'server-only';

import { runInTenantScope, type TenantContext } from '@/shared/lib/tenant-context';
import { loadMobileDocumentRows } from '../documents/queries.server';
import type { EmployeeAccess } from './access';

export interface DocumentCounts {
  valid: number;
  expiring: number;
  expired: number;
  missing: number;
  rejected: number;
}

/** Hay alguna alerta: vencido, por vencer, rechazado o faltante. */
export const hasAlert = (counts: DocumentCounts) =>
  counts.expired + counts.expiring + counts.missing + counts.rejected > 0;

/**
 * Conteo de documentos por empleado ACTIVO, con el MISMO motor de cumplimiento que las listas web (estado derivado,
 * faltantes sintéticos, sin «ya no aplica» ni archivados; permanentes y mensuales según permisos; privados solo con
 * `view_private`). El motor evalúa a toda la empresa de una vez y se cachea por pedido: una sola pasada por página,
 * sin consultas por empleado. null = el usuario no puede ver la lista de documentos de empleados.
 */
export async function loadEmployeeDocumentCounts(
  ctx: TenantContext,
  access: EmployeeAccess
): Promise<Map<string, DocumentCounts> | null> {
  const { permanent, monthly, privateTypes } = access.documentList;
  if (!permanent && !monthly) return null;
  const periods = [...(permanent ? [false] : []), ...(monthly ? [true] : [])];

  const rows = await runInTenantScope(ctx, async () =>
    (
      await Promise.all(
        periods.map((isMonthly) =>
          loadMobileDocumentRows(ctx, { resource: 'employee', monthly: isMonthly, privateTypes }, '')
        )
      )
    ).flat()
  );

  const counts = new Map<string, DocumentCounts>();
  for (const row of rows) {
    const entry = counts.get(row.resource.id) ?? { valid: 0, expiring: 0, expired: 0, missing: 0, rejected: 0 };
    entry[row.status] += 1;
    counts.set(row.resource.id, entry);
  }
  return counts;
}
