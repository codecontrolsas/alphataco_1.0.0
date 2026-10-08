'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions';
import { toActionError } from '@/features/Warehouses/lib/action-errors';
import { reverseStockMovement } from '@/features/Warehouses/lib/stock-engine';
import { StockError } from '@/features/Warehouses/lib/stock-errors';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';

const logger = new Logger('features/Clothing/cancel');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 };

/**
 * Anula una entrega de ropa (Almacenes etapa 5): anula su salida de stock (la ropa vuelve al
 * deposito al mismo costo) y marca la entrega. La entrega NO se borra: la constancia firmada se
 * conserva, con la marca "Anulada".
 *
 * Orden de locks: entrega de ropa -> movimiento original -> ... (el resto lo toma el motor).
 * Ningun camino del motor lockea una entrega de ropa, asi que no hay ciclo.
 */
export async function cancelClothingDeliveryAction(deliveryId: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('empleados', 'indumentaria_empleado', 'delete'))) {
    return fail('No tenés permiso para anular entregas de ropa');
  }
  const motive = reason.trim();
  if (!motive) return fail('Indicá el motivo de la anulación');
  if (motive.length > 500) return fail('El motivo puede tener hasta 500 caracteres');
  if (!UUID_RE.test(deliveryId)) return fail('La entrega no existe');

  const profile = await getServerAuthProfile();
  if (!profile) return fail('Tu sesión expiró. Volvé a ingresar.');
  const companyId = await getActiveCompanyId();

  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM clothing_deliveries
          WHERE id = ${deliveryId}::uuid AND company_id = ${companyId}::uuid
          FOR UPDATE
        `;
        if (locked.length === 0) throw new StockError('NOT_FOUND', 'La entrega no existe');

        const delivery = await tx.clothing_deliveries.findUniqueOrThrow({
          where: { id: deliveryId },
          select: {
            cancelled_at: true,
            stock_movement: { select: { id: true, reversed_by: { select: { number: true } } } },
          },
        });
        if (delivery.cancelled_at) throw new StockError('INVALID_STATE', 'La entrega ya está anulada');

        // Si la salida ya se anulo desde Almacenes, la entrega se marca igual (spec etapa 5 §3.3).
        if (delivery.stock_movement && !delivery.stock_movement.reversed_by) {
          await reverseStockMovement(
            tx,
            companyId,
            profile.id,
            delivery.stock_movement.id,
            `Anulación de entrega de ropa: ${motive}`
          );
        }

        await tx.clothing_deliveries.update({
          where: { id: deliveryId },
          data: { cancelled_at: new Date(), cancelled_by: profile.id, cancel_reason: motive, updated_at: new Date() },
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    logger.info('Entrega de ropa anulada', { data: { deliveryId } });
    revalidatePath('/dashboard/employee');
    return ok(null);
  } catch (error) {
    return toActionError(error, logger, 'anular la entrega');
  }
}
