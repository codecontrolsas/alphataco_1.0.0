import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { isValidRequestTransition } from '@/features/Mantenimiento/lib/request-approval';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

type PrismaLike = Prisma.TransactionClient | typeof prisma;

/**
 * Perímetro de las mutaciones sobre una solicitud.
 *
 * Sin RLS, cada `'use server'` exportado es un endpoint público: antes de escribir hay que
 * verificar que la solicitud pertenezca a la empresa activa del usuario. Devuelve la empresa
 * para que quien llama la reuse (los registros derivados heredan la misma).
 *
 * Módulo server-only (NO es una Server Action): no expone ningún endpoint propio.
 */
export async function assertRequestInActiveCompany(requestId: string): Promise<string> {
  const companyId = await getActiveCompanyId();

  const request = await prisma.maintenance_requests.findFirst({
    where: { id: requestId, company_id: companyId },
    select: { id: true },
  });

  if (!request) throw new Error('La solicitud no pertenece a la empresa activa');

  return companyId;
}

/**
 * Guarda de transición de `maintenance_requests.status`.
 *
 * Una solicitud sólo se resuelve desde `pending_approval` (la máquina vive en
 * `lib/request-approval.ts`). Sin esta guarda, volver a aprobar una solicitud ya cerrada
 * creaba un segundo pedido de mantenimiento para el mismo checklist.
 *
 * Reescribir el MISMO estado se deja pasar (doble click / reintento), igual que antes.
 */
export async function assertRequestTransition(
  client: PrismaLike,
  requestId: string,
  nextStatus: 'approved' | 'rejected'
): Promise<string | null> {
  const request = await client.maintenance_requests.findUnique({
    where: { id: requestId },
    select: { status: true },
  });

  if (!request) throw new Error('Solicitud de mantenimiento no encontrada');

  const current = request.status;
  if (current === nextStatus) return current;

  if (!isValidRequestTransition(current, nextStatus)) {
    throw new Error(`No se puede pasar la solicitud de "${current}" a "${nextStatus}"`);
  }

  return current;
}

/**
 * Resuelve (aprueba o rechaza) una solicitud de forma ATÓMICA: el `where` lleva el estado
 * `pending_approval`, así que dos aprobaciones simultáneas (o un doble click) no pueden
 * escribir las dos ni crear dos pedidos para la misma solicitud. Verifica `count`.
 *
 * Reemplaza a `assertRequestTransition` + `update` (que leía y luego escribía sin el estado en
 * el `where`, y dejaba pasar la reescritura del mismo estado).
 */
export async function resolveRequestFromPending(
  tx: Prisma.TransactionClient,
  requestId: string,
  companyId: string,
  nextStatus: 'approved' | 'rejected',
  data: Omit<Prisma.maintenance_requestsUncheckedUpdateManyInput, 'status'> = {}
): Promise<void> {
  const result = await tx.maintenance_requests.updateMany({
    where: { id: requestId, company_id: companyId, status: 'pending_approval' },
    data: { ...data, status: nextStatus },
  });

  if (result.count !== 1) {
    throw new Error('La solicitud ya fue resuelta o no está pendiente de aprobación. Recargá la lista.');
  }
}
