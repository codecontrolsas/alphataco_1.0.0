'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { safeFileName } from '@/features/Purchases/lib/storage-files';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { storagePublicUrl, storageRemove, storageUpload } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { NO_PERMISSION, UUID_RE, toTreasuryActionError } from '../lib/action-errors';
import { lockReceipt } from '../lib/receipt-locks';
import { CUSTOMER_FILES_BUCKET } from '../lib/storage-files';
import { TreasuryError } from '../lib/treasury-errors';
import { CERTIFICATE_MAX_BYTES } from '../schemas/receipts';
import { SESSION_EXPIRED, TRANSACTION_OPTIONS, revalidateTreasury } from './shared';

/**
 * Certificados de las retenciones sufridas (spec Tesorería etapa 2 §3.4). Se adjuntan o
 * reemplazan en cualquier estado salvo anulado: suelen llegar días después del cobro.
 */

const logger = new Logger('features/Treasury/withholdings');

const NOT_FOUND = 'La retención no existe';

/** FormData `{ file }`: solo PDF hasta 10 MB. Borra el anterior después de guardar; si falla, el nuevo. */
export async function attachWithholdingCertificate(withholdingId: string, formData: FormData): Promise<ActionResult<{ name: string; url: string }>> {
  const allowed = await Promise.all([
    checkPermissionServer('tesoreria', 'retenciones-sufridas', 'update'),
    checkPermissionServer('tesoreria', 'cobranzas', 'update'),
  ]);
  if (!allowed.some(Boolean)) return fail(NO_PERMISSION);
  if (!UUID_RE.test(withholdingId)) return fail(NOT_FOUND);
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return fail('Elegí el archivo');
  if (file.size > CERTIFICATE_MAX_BYTES) return fail('El archivo supera los 10 MB');
  if (file.type !== 'application/pdf') return fail('El certificado tiene que ser un PDF');
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();

  const withholding = await prisma.customer_receipt_withholdings.findFirst({
    where: { id: withholdingId, company_id: companyId },
    select: { receipt_id: true, customer_id: true },
  });
  if (!withholding) return fail(NOT_FOUND);

  const path = `${companyId}/${withholding.customer_id}/withholdings/${Date.now()}-${safeFileName(file.name)}`;
  const uploaded = await storageUpload(CUSTOMER_FILES_BUCKET, path, file);
  if (!uploaded.ok) return fail('No se pudo subir el archivo. Intentá de nuevo.');

  try {
    const previous = await withActor(
      profile.credentialId,
      async (tx) => {
        const receipt = await lockReceipt(tx, companyId, withholding.receipt_id);
        if (receipt.status === 'CANCELLED') throw new TreasuryError('El recibo está anulado');
        const current = await tx.customer_receipt_withholdings.findUnique({ where: { id: withholdingId }, select: { file_path: true } });
        if (!current) throw new TreasuryError(NOT_FOUND);
        await tx.customer_receipt_withholdings.update({ where: { id: withholdingId }, data: { file_path: path, file_name: file.name } });
        return current.file_path;
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    if (previous) {
      const removed = await storageRemove(CUSTOMER_FILES_BUCKET, [previous]);
      if (!removed.ok) logger.warn('No se pudo borrar el certificado reemplazado', { data: { path: previous } });
    }
    revalidateTreasury();
    return ok({ name: file.name, url: await storagePublicUrl(CUSTOMER_FILES_BUCKET, path) });
  } catch (error) {
    await storageRemove(CUSTOMER_FILES_BUCKET, [path]);
    return toTreasuryActionError(error, logger, 'guardar el certificado');
  }
}
