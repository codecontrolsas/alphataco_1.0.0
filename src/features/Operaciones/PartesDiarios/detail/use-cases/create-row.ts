import { resolveRowQuantity } from '../../lib/row-quantity';
import { buildResourceCheck, buildRowScalarData, resolveRowResources } from '../lib/row-write-helpers';
import { RowRuleError } from './errors';
import { assertCanCreate, assertStatusSettable, loadRowPermissions } from './row-access';
import { assertResourcesInCompany } from './row-perimeter';
import { addRowResources } from './row-resources';
import { readRowOutcome, reconcileStatus } from './row-state';
import { toReportDateString } from '../lib/report-date';
import { runCommand } from './run-command';
import type { TenantContext } from '@/shared/lib/tenant-context';
import type { CreateRowCommand, RowWriteResult, UseCaseDeps, UseCaseResult } from './types';

type TerminalStatus = 'ejecutado' | 'cancelado' | 'reprogramado';

/** Estado inicial: el terminal pedido se respeta; el resto parte de provisional y lo fija `reconcileStatus`. */
function initialStatus(requested: string, hasResources: boolean): TerminalStatus | 'pendiente' | 'sin_recursos_asignados' {
  if (requested === 'ejecutado' || requested === 'cancelado' || requested === 'reprogramado') return requested as TerminalStatus;
  return hasResources ? 'pendiente' : 'sin_recursos_asignados';
}

/** CU-1: crear una línea del parte diario con sus recursos. */
export function createRow(
  deps: UseCaseDeps,
  ctx: TenantContext,
  cmd: CreateRowCommand
): Promise<UseCaseResult<RowWriteResult>> {
  const { row } = cmd;
  return runCommand(
    deps,
    ctx,
    { commandId: cmd.commandId, capturedAt: cmd.capturedAt, type: 'daily_report_row.create', payload: { dailyReportId: cmd.dailyReportId, row } },
    async (tx) => {
      const permissions = await loadRowPermissions(tx, ctx);
      const report = await tx.dailyreport.findFirst({
        where: { id: cmd.dailyReportId, company_id: ctx.companyId },
        select: { status: true, date: true },
      });
      if (!report) throw new RowRuleError('El parte diario no existe o no pertenece a la empresa activa.', 'NOT_FOUND');
      assertCanCreate(permissions, { status: report.status ?? 'abierto', reportDate: toReportDateString(report.date) });
      assertStatusSettable(row.status);

      const resources = resolveRowResources(row);
      await assertResourcesInCompany(tx, ctx.companyId, buildResourceCheck(row, resources), { requireActive: true });

      const rowId = crypto.randomUUID();
      await tx.dailyreportrows.create({
        data: {
          id: rowId,
          daily_report_id: cmd.dailyReportId,
          ...buildRowScalarData(row),
          quantity: resolveRowQuantity(row.quantity),
          status: initialStatus(row.status, resources.hasResources),
          type_service: row.type_service ?? null,
        },
      });
      const added = await addRowResources(tx, rowId, {
        employees: resources.employees,
        equipment: resources.equipment,
        otherEquipment: resources.otherEquipment,
        customerEquipment: resources.customerEquipment,
      });
      await reconcileStatus(tx, rowId);

      return { ...(await readRowOutcome(tx, rowId)), added };
    }
  );
}
