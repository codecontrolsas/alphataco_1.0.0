import type { TenantContext } from '@/shared/lib/tenant-context';
import { assertBaseVersion, assertCanChangeResources, loadRowPermissions, lockRow } from './row-access';
import { assertResourcesInCompany } from './row-perimeter';
import { addRowResources, removeRowResources } from './row-resources';
import { readRowOutcome, reconcileStatus, touchRow } from './row-state';
import { runCommand } from './run-command';
import type { ChangeRowResourcesCommand, RowWriteResult, UseCaseDeps, UseCaseResult } from './types';

/** CU-2: agregar y quitar recursos de una línea con altas y bajas explícitas (nada se borra por no figurar). */
export function changeRowResources(
  deps: UseCaseDeps,
  ctx: TenantContext,
  cmd: ChangeRowResourcesCommand
): Promise<UseCaseResult<RowWriteResult>> {
  return runCommand(
    deps,
    ctx,
    {
      commandId: cmd.commandId,
      capturedAt: cmd.capturedAt,
      type: 'daily_report_row.resources',
      payload: { rowId: cmd.rowId, baseVersion: cmd.baseVersion, add: cmd.add, remove: cmd.remove },
    },
    async (tx) => {
      const permissions = await loadRowPermissions(tx, ctx);
      const row = await lockRow(tx, cmd.rowId, ctx.companyId);
      assertBaseVersion(row, cmd.baseVersion);
      assertCanChangeResources(permissions, row);

      // Las bajas no exigen que el recurso siga activo; las altas sí.
      await assertResourcesInCompany(
        tx,
        ctx.companyId,
        {
          employeeIds: cmd.add.employees.map((employee) => employee.id),
          equipmentIds: cmd.add.equipment,
          otherEquipmentIds: cmd.add.otherEquipment,
          customerEquipmentIds: cmd.add.customerEquipment,
        },
        { requireActive: true }
      );

      const removed = await removeRowResources(tx, cmd.rowId, cmd.remove);
      const added = await addRowResources(tx, cmd.rowId, cmd.add);
      await reconcileStatus(tx, cmd.rowId);
      // Sin cambios no se toca la versión: otro usuario con el formulario abierto no debe ver un conflicto falso.
      if (added + removed > 0) await touchRow(tx, cmd.rowId);

      return { ...(await readRowOutcome(tx, cmd.rowId)), added, removed };
    }
  );
}
