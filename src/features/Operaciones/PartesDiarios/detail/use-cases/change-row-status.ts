import type { TenantContext } from '@/shared/lib/tenant-context';
import { RowRuleError } from './errors';
import { assertBaseVersion, assertCanChangeStatus, loadRowPermissions, lockRow } from './row-access';
import { readRowOutcome, reconcileStatus } from './row-state';
import { runCommand } from './run-command';
import type { ChangeRowStatusCommand, RowWriteResult, UseCaseDeps, UseCaseResult } from './types';

/**
 * CU-3: cambiar el estado de una línea (`ejecutado`, `cancelado`, `pendiente`) o completar un turno. Con los dos turnos
 * completos la línea pasa a `ejecutado`, igual que la edición masiva. `reprogramado` (clona la línea a otra fecha)
 * sigue por el flujo de edición masiva hasta migrarlo.
 */
export function changeRowStatus(
  deps: UseCaseDeps,
  ctx: TenantContext,
  cmd: ChangeRowStatusCommand
): Promise<UseCaseResult<RowWriteResult>> {
  return runCommand(
    deps,
    ctx,
    {
      commandId: cmd.commandId,
      capturedAt: cmd.capturedAt,
      type: 'daily_report_row.status',
      payload: {
        rowId: cmd.rowId,
        baseVersion: cmd.baseVersion,
        status: cmd.status ?? null,
        cancelReason: cmd.cancelReason ?? null,
        completeDay: cmd.completeDay ?? false,
        completeNight: cmd.completeNight ?? false,
      },
    },
    async (tx) => {
      const completing = Boolean(cmd.completeDay || cmd.completeNight);
      if (completing === (cmd.status !== undefined)) {
        throw new RowRuleError('El pedido debe indicar un estado o un turno a completar, no ambos ni ninguno.', 'INVALID_INPUT');
      }
      if (cmd.status === 'cancelado' && !cmd.cancelReason?.trim()) {
        throw new RowRuleError('Para cancelar hace falta indicar el motivo.', 'INVALID_INPUT');
      }

      const permissions = await loadRowPermissions(tx, ctx);
      const row = await lockRow(tx, cmd.rowId, ctx.companyId);
      assertBaseVersion(row, cmd.baseVersion);
      assertCanChangeStatus(permissions, row);

      if (completing) {
        const completedDay = cmd.completeDay ? true : row.completedDay;
        const completedNight = cmd.completeNight ? true : row.completedNight;
        await tx.dailyreportrows.update({
          where: { id: cmd.rowId },
          data: {
            ...(cmd.completeDay ? { completed_day: true } : {}),
            ...(cmd.completeNight ? { completed_night: true } : {}),
            ...(completedDay === true && completedNight === true ? { status: 'ejecutado' as const } : {}),
          },
        });
      } else {
        await tx.dailyreportrows.update({
          where: { id: cmd.rowId },
          data: { status: cmd.status, ...(cmd.cancelReason !== undefined ? { cancel_reason: cmd.cancelReason } : {}) },
        });
        // Pasar a 'pendiente' a mano no puede dejar una línea sin recursos como pendiente.
        if (cmd.status === 'pendiente') await reconcileStatus(tx, cmd.rowId);
      }

      return readRowOutcome(tx, cmd.rowId);
    }
  );
}
