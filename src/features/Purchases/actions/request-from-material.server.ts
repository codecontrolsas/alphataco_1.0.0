'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { lockRequest } from '@/features/Warehouses/lib/requests';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { revalidatePath } from 'next/cache';
import {
  NO_PERMISSION,
  PURCHASES_PATH,
  SESSION_EXPIRED,
  firstIssue,
  toPurchaseActionError,
} from '../lib/action-errors';
import { notifyRequestSubmitted } from '../lib/approval-notifications.server';
import { materialRequestShortfall, type MaterialRequestShortfall } from '../lib/from-material-request';
import { PurchaseError } from '../lib/purchase-errors';
import { insertPurchaseRequest } from '../lib/request-writes';
import { purchaseRequestFormSchema, toPurchaseRequestInput, type PurchaseRequestFormValues } from '../schemas/requests';

const logger = new Logger('features/Purchases/request-from-material');

function revalidate() {
  revalidatePath(PURCHASES_PATH);
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// ── Desde un pedido de materiales de Almacenes ──────────────────────────────

/**
 * Mismo criterio de visibilidad que el detalle del pedido en Almacenes: `almacenes:pedidos:view`
 * y, sin `view_all_requests`, solo los pedidos propios. Sin esto, quien puede crear solicitudes de
 * compra veria (y colgaria compras de) pedidos ajenos con solo conocer su uuid.
 */
async function assertMaterialRequestVisible(materialRequestId: string, profileId: string, companyId: string) {
  const [canView, canViewAll] = await Promise.all([
    checkPermissionServer('almacenes', 'pedidos', 'view'),
    checkPermissionServer('almacenes', 'pedidos', 'view_all_requests'),
  ]);
  const request = canView
    ? await prisma.material_requests.findFirst({
        where: { id: materialRequestId, company_id: companyId, ...(canViewAll ? {} : { requested_by: profileId }) },
        select: { id: true },
      })
    : null;
  if (!request) throw new PurchaseError('El pedido de materiales no existe');
}

/** Faltante del pedido para precargar la solicitud (pendiente de entrega - stock de la empresa). */
export async function getMaterialRequestShortfall(
  materialRequestId: string
): Promise<ActionResult<MaterialRequestShortfall>> {
  if (!(await checkPermissionServer('compras', 'solicitudes', 'create'))) return fail(NO_PERMISSION);
  if (!isUuid(materialRequestId)) return fail('El pedido de materiales no existe');
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await assertMaterialRequestVisible(materialRequestId, profile.id, companyId);
    return ok(await materialRequestShortfall(prisma, companyId, materialRequestId));
  } catch (error) {
    return toPurchaseActionError(error, logger, 'calcular el faltante del pedido');
  }
}

/**
 * Crea la solicitud vinculada al pedido. El destino es SIEMPRE el del pedido (el del formulario
 * se ignora) y cada linea tiene que ser un material del pedido; las cantidades las ajusta el
 * usuario. Se permiten varias solicitudes por pedido (por ejemplo, una por proveedor).
 */
export async function createPurchaseRequestFromMaterialRequest(
  materialRequestId: string,
  values: PurchaseRequestFormValues,
  options: { submit: boolean }
): Promise<ActionResult<{ id: string; number: string }>> {
  if (!(await checkPermissionServer('compras', 'solicitudes', 'create'))) return fail(NO_PERMISSION);
  if (!isUuid(materialRequestId)) return fail('El pedido de materiales no existe');
  const parsed = purchaseRequestFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();

  try {
    await assertMaterialRequestVisible(materialRequestId, profile.id, companyId);
    const created = await prisma.$transaction(async (tx) => {
      // El pedido se lockea: una entrega simultanea no cambia el faltante a mitad de camino.
      await lockRequest(tx, companyId, materialRequestId);
      const shortfall = await materialRequestShortfall(tx, companyId, materialRequestId);
      const pedidoMaterials = new Set(
        (
          await tx.material_request_lines.findMany({
            where: { request_id: materialRequestId },
            select: { material_id: true },
          })
        ).map((l) => l.material_id)
      );
      const input = toPurchaseRequestInput(parsed.data);
      input.lines.forEach((line, i) => {
        if (!line.materialId || !pedidoMaterials.has(line.materialId)) {
          throw new PurchaseError(`Línea ${i + 1}: solo se piden materiales del pedido ${shortfall.number}`);
        }
      });
      return insertPurchaseRequest(
        tx,
        companyId,
        profile.id,
        { ...input, destination: shortfall.destination },
        { submit: options.submit, materialRequestId }
      );
    });
    logger.info('Solicitud de compra creada desde un pedido', { data: { number: created.number, materialRequestId } });
    if (options.submit) await notifyRequestSubmitted(created.id, companyId, profile.fullname, new Date());
    revalidate();
    revalidatePath(`/dashboard/warehouse/requests/${materialRequestId}`);
    return ok(created);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'crear la solicitud');
  }
}
