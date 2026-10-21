import { createHash } from 'node:crypto';

import { runWithTenantContext, type TenantContext, type TenantTx } from '@/shared/lib/tenant-context';
import { RowRuleError } from './errors';
import type { CommandMeta, UseCaseDeps, UseCaseResult } from './types';

const COMMAND_TIMEOUT_MS = 15_000;

interface CommandSpec extends CommandMeta {
  /** 'daily_report_row.create' | '.resources' | '.status' */
  type: string;
  /** Lo que hace único al pedido (sin `commandId` ni `capturedAt`): detecta un `commandId` reutilizado con otro cuerpo. */
  payload: unknown;
}

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Ejecuta un comando en UNA transacción con el contexto de empresa fijado:
 *  1. Reclama el `commandId` (`INSERT … ON CONFLICT DO NOTHING`). Si otro envío igual está en curso, el segundo espera
 *     en el índice a que el primero confirme; si ya existe, devuelve el resultado guardado (`replayed: true`).
 *  2. Corre el caso de uso.
 *  3. Guarda el resultado en la misma transacción: o queda todo o no queda nada.
 *
 * Una regla incumplida revierte la transacción (también el reclamo): un reintento vuelve a evaluar las reglas,
 * y `baseVersion` impide aplicarlo sobre un estado que cambió.
 */
export async function runCommand<T extends { rowId: string }>(
  deps: UseCaseDeps,
  ctx: TenantContext,
  spec: CommandSpec,
  handler: (tx: TenantTx) => Promise<T>
): Promise<UseCaseResult<T>> {
  const payloadHash = hashPayload(spec.payload);
  try {
    return await runWithTenantContext(
      deps.db,
      ctx,
      async (tx) => {
        const claimed = await tx.$queryRaw<{ command_id: string }[]>`
          INSERT INTO processed_commands (command_id, command_type, payload_hash, actor_user_id, captured_at)
          VALUES (${spec.commandId}::uuid, ${spec.type}, ${payloadHash}, ${ctx.userId}::uuid, ${spec.capturedAt ?? null}::timestamptz)
          ON CONFLICT (company_id, command_id) DO NOTHING
          RETURNING command_id`;

        if (claimed.length === 0) {
          const previous = await tx.$queryRaw<{ command_type: string; payload_hash: string; result: T | null }[]>`
            SELECT command_type, payload_hash, result FROM processed_commands WHERE command_id = ${spec.commandId}::uuid AND company_id = ${ctx.companyId}::uuid`;
          const found = previous[0];
          if (!found || found.command_type !== spec.type || found.payload_hash !== payloadHash || !found.result) {
            throw new RowRuleError('El identificador del comando ya se usó con otro pedido.', 'COMMAND_ID_REUSED');
          }
          return { ok: true as const, data: found.result, replayed: true };
        }

        const data = await handler(tx);
        await tx.$executeRaw`
          UPDATE processed_commands SET result = ${JSON.stringify(data)}::jsonb, entity_id = ${data.rowId}::uuid
          WHERE command_id = ${spec.commandId}::uuid AND company_id = ${ctx.companyId}::uuid`;
        return { ok: true as const, data, replayed: false };
      },
      { timeout: COMMAND_TIMEOUT_MS }
    );
  } catch (error) {
    if (error instanceof RowRuleError) {
      return { ok: false, code: error.code, message: error.message, currentVersion: error.currentVersion };
    }
    throw error;
  }
}
