'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { storagePublicUrl, storageRemove, storageDownloadUrls, storageUpload } from '@/shared/lib/storage';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('features/Operaciones/PartesDiarios/remitos');

/** Bucket de los archivos de remitos. */
const REMIT_BUCKET = 'daily-reports';

/**
 * Perímetro del módulo: un remito sólo es accesible si su línea cuelga de un parte diario
 * de la empresa activa. Se resuelve por relación en todos los `where`.
 */
function rowScope(companyId: string) {
  return { dailyreportrows: { dailyreport: { company_id: companyId } } };
}

/**
 * Los remitos se gestionan desde Certificación (`comercial › daily_reports`): ver exige `view` y escribir exige `update`,
 * lo mismo que ya pide esa pantalla. Una Server Action se puede invocar sin pasar por ella.
 */
async function requireRemitoPermission(action: 'view' | 'update') {
  if (!(await checkPermissionServer('comercial', 'daily_reports', action))) {
    throw new Error('No tenés permiso para gestionar los remitos.');
  }
}

async function assertRowInCompany(dailyReportRowId: string, companyId: string): Promise<void> {
  const row = await prisma.dailyreportrows.findFirst({
    where: { id: dailyReportRowId, dailyreport: { company_id: companyId } },
    select: { id: true },
  });
  if (!row) throw new Error('La línea del parte diario no existe o no pertenece a la empresa activa.');
}

async function requireRemitInCompany(remitId: string, companyId: string) {
  const remito = await prisma.remitos.findFirst({
    where: { id: remitId, ...rowScope(companyId) },
    select: { id: true, remit_number: true, daily_report_row_id: true, is_linked: true },
  });
  if (!remito) throw new Error('El remito no existe o no pertenece a la empresa activa.');
  return remito;
}

// ============================================================================
// LECTURAS
// ============================================================================

/** Remitos de una línea con sus documentos. */
export async function getRemitosWithDocuments(dailyReportRowId: string) {
  await requireRemitoPermission('view');
  const companyId = await getActiveCompanyId();

  return prisma.remitos.findMany({
    where: { daily_report_row_id: dailyReportRowId, ...rowScope(companyId) },
    include: { remito_documents: { orderBy: { created_at: 'asc' } } },
    orderBy: { created_at: 'asc' },
  });
}

/** Remitos de otras líneas que se pueden vincular a la actual (máximo 10). */
export async function getAvailableRemitosForLinking(currentDailyReportRowId: string, searchQuery?: string) {
  await requireRemitoPermission('view');
  const companyId = await getActiveCompanyId();

  const currentRow = await prisma.dailyreportrows.findFirst({
    where: { id: currentDailyReportRowId, dailyreport: { company_id: companyId } },
    select: { customer_id: true },
  });
  if (!currentRow) throw new Error('La línea del parte diario no existe o no pertenece a la empresa activa.');

  const remitos = await prisma.remitos.findMany({
    where: {
      daily_report_row_id: { not: currentDailyReportRowId },
      ...rowScope(companyId),
      ...(searchQuery?.trim() ? { remit_number: { contains: searchQuery.trim(), mode: 'insensitive' } } : {}),
    },
    select: {
      id: true,
      remit_number: true,
      daily_report_row_id: true,
      created_at: true,
      is_linked: true,
      _count: { select: { remito_documents: true } },
      dailyreportrows: {
        select: {
          id: true,
          customer_id: true,
          customers: { select: { id: true, name: true } },
          dailyreport: { select: { id: true, date: true } },
        },
      },
    },
    orderBy: { created_at: 'desc' },
    take: 10,
  });

  return remitos.map((remito) => ({
    ...remito,
    isSameCustomer: remito.dailyreportrows.customer_id === currentRow.customer_id,
    currentCustomerId: currentRow.customer_id,
  }));
}

// ============================================================================
// ALTAS
// ============================================================================

/** Crea un remito en una línea. El número no se puede repetir dentro de la misma línea. */
export async function createRemito(dailyReportRowId: string, remitNumber: string) {
  await requireRemitoPermission('update');
  const companyId = await getActiveCompanyId();
  await assertRowInCompany(dailyReportRowId, companyId);

  const existing = await prisma.remitos.findFirst({
    where: { daily_report_row_id: dailyReportRowId, remit_number: remitNumber },
    select: { id: true },
  });
  if (existing) {
    throw new Error(`Ya existe un remito con el número ${remitNumber}`);
  }

  return prisma.remitos.create({
    data: { daily_report_row_id: dailyReportRowId, remit_number: remitNumber },
  });
}

/**
 * Sube un archivo y lo asocia al remito. Si falla la fila, se borra el archivo subido
 * para no dejar basura en el storage.
 */
export async function uploadDocumentToRemito(remitId: string, formData: FormData, customerName?: string) {
  await requireRemitoPermission('update');
  const companyId = await getActiveCompanyId();
  const remito = await requireRemitInCompany(remitId, companyId);

  const file = formData.get('file');
  if (!(file instanceof File)) {
    throw new Error('No se recibió ningún archivo.');
  }

  const fileExtension = file.name.split('.').pop();
  const fileName = `remito-${remito.remit_number}-${Date.now()}.${fileExtension}`;
  const storagePath = customerName ? `${customerName}/${fileName}` : `remitos/${fileName}`;

  const uploaded = await storageUpload(REMIT_BUCKET, storagePath, file, { upsert: true });
  if (!uploaded.ok) {
    throw new Error(uploaded.error);
  }

  try {
    return await prisma.remito_documents.create({
      data: { remit_id: remitId, document_path: uploaded.data.path, document_name: file.name },
    });
  } catch (error) {
    await storageRemove(REMIT_BUCKET, [uploaded.data.path]);
    logger.error('Error al registrar el documento del remito', { data: { error, remitId } });
    throw error;
  }
}

/** Copia un remito (y las referencias a sus documentos) a otra línea, marcándolo vinculado. */
export async function linkExistingRemito(sourceRemitId: string, targetDailyReportRowId: string) {
  await requireRemitoPermission('update');
  const companyId = await getActiveCompanyId();
  await assertRowInCompany(targetDailyReportRowId, companyId);

  const sourceRemito = await prisma.remitos.findFirst({
    where: { id: sourceRemitId, ...rowScope(companyId) },
    include: { remito_documents: true },
  });
  if (!sourceRemito) {
    throw new Error('El remito de origen no existe o no pertenece a la empresa activa.');
  }

  const existing = await prisma.remitos.findFirst({
    where: { daily_report_row_id: targetDailyReportRowId, remit_number: sourceRemito.remit_number },
    select: { id: true },
  });
  if (existing) {
    throw new Error(`Ya existe un remito con el número ${sourceRemito.remit_number} en esta línea`);
  }

  return prisma.$transaction(async (tx) => {
    const newRemito = await tx.remitos.create({
      data: {
        daily_report_row_id: targetDailyReportRowId,
        remit_number: sourceRemito.remit_number,
        is_linked: true,
      },
    });

    if (sourceRemito.remito_documents.length > 0) {
      await tx.remito_documents.createMany({
        data: sourceRemito.remito_documents.map((document) => ({
          remit_id: newRemito.id,
          document_path: document.document_path,
          document_name: document.document_name,
        })),
      });
    }

    return newRemito;
  });
}

// ============================================================================
// BAJAS
// ============================================================================

/** Borra un documento y su archivo del storage. */
export async function deleteRemitDocument(documentId: string) {
  await requireRemitoPermission('update');
  const companyId = await getActiveCompanyId();

  const document = await prisma.remito_documents.findFirst({
    where: { id: documentId, remitos: rowScope(companyId) },
    select: { id: true, document_path: true },
  });
  if (!document) {
    throw new Error('El documento no existe o no pertenece a la empresa activa.');
  }

  await prisma.remito_documents.delete({ where: { id: documentId } });
  await storageRemove(REMIT_BUCKET, [document.document_path]);
  return true;
}

/** Borra un remito con todos sus documentos y archivos. */
export async function deleteRemito(remitId: string) {
  await requireRemitoPermission('update');
  const companyId = await getActiveCompanyId();
  await requireRemitInCompany(remitId, companyId);

  const documents = await prisma.remito_documents.findMany({
    where: { remit_id: remitId },
    select: { document_path: true },
  });

  await prisma.remitos.delete({ where: { id: remitId } });

  if (documents.length > 0) {
    await storageRemove(
      REMIT_BUCKET,
      documents.map((document) => document.document_path)
    );
  }
  return true;
}

/** Desvincula un remito copiado: borra las referencias, nunca los archivos originales. */
export async function unlinkRemito(remitId: string) {
  await requireRemitoPermission('update');
  const companyId = await getActiveCompanyId();
  const remito = await requireRemitInCompany(remitId, companyId);

  if (!remito.is_linked) {
    throw new Error('Este remito no es vinculado y no puede ser desvinculado');
  }

  // `remito_documents` cae por cascada; los archivos del storage quedan intactos.
  await prisma.remitos.delete({ where: { id: remitId } });
  return true;
}

// ============================================================================
// ARCHIVOS
// ============================================================================

/**
 * URL estable del archivo, para mostrarlo embebido.
 *
 * Perímetro: el path llega del cliente, así que tiene que corresponder a un documento de
 * la empresa activa. La ruta `/api/files/...` lo vuelve a validar al servir el archivo,
 * pero la action no devuelve la URL de un documento ajeno ni para confirmar que existe.
 */
export async function getRemitDocumentUrl(documentPath: string): Promise<string> {
  await requireRemitoPermission('view');
  const companyId = await getActiveCompanyId();
  const document = await prisma.remito_documents.findFirst({
    where: { document_path: documentPath, remitos: rowScope(companyId) },
    select: { id: true },
  });
  if (!document) {
    throw new Error('El documento no existe o no pertenece a la empresa activa.');
  }
  return storagePublicUrl(REMIT_BUCKET, documentPath);
}

/**
 * URL para descargar el archivo desde el navegador.
 *
 * Perímetro: el path tiene que corresponder a un documento de la empresa activa, y la ruta
 * que sirve el archivo lo vuelve a verificar.
 */
export async function getRemitDocumentDownloadUrl(documentPath: string): Promise<string> {
  await requireRemitoPermission('view');
  const companyId = await getActiveCompanyId();

  const document = await prisma.remito_documents.findFirst({
    where: { document_path: documentPath, remitos: rowScope(companyId) },
    select: { id: true },
  });
  if (!document) {
    throw new Error('El documento no existe o no pertenece a la empresa activa.');
  }

  const signed = await storageDownloadUrls(REMIT_BUCKET, [documentPath]);
  if (!signed.ok) {
    throw new Error(signed.error);
  }
  return signed.data[0].url;
}

// ============================================================================
// TIPOS
// ============================================================================

export type RemitoWithDocuments = Awaited<ReturnType<typeof getRemitosWithDocuments>>[number];
export type RemitDocument = RemitoWithDocuments['remito_documents'][number];
