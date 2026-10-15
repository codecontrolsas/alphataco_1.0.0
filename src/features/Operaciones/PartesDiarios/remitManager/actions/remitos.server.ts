'use server';

import { withSessionActor } from '@/features/Operaciones/lib/with-session-actor';
import { checkPermissionServer } from '@/features/Permissions';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { storagePublicUrl, storageRemove, storageDownloadUrls, storageUpload } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from '../types';

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
 * Quién puede escribir remitos: el gestor se usa desde Operaciones (detalle del parte) y desde
 * Comercial (partes diarios), así que alcanza con **Editar** en cualquiera de las dos pantallas.
 * La regla de estado de la línea (en qué estados se muestra el gestor) vive en la UI de cada módulo:
 * Comercial además carga el remito al crear una línea, cuando todavía puede estar "Sin recursos".
 */
async function assertCanWriteRemitos({ allowCommercialCreate = false } = {}): Promise<void> {
  const [fromOperations, fromCommercial, fromCommercialCreate] = await Promise.all([
    checkPermissionServer('operaciones', 'detalle-parte-diario', 'update'),
    checkPermissionServer('comercial', 'daily_reports', 'update'),
    // "Crear Línea" de Comercial carga el primer remito con el permiso Crear (no exige Editar)
    allowCommercialCreate ? checkPermissionServer('comercial', 'daily_reports', 'create') : Promise.resolve(false),
  ]);
  if (!fromOperations && !fromCommercial && !fromCommercialCreate) {
    throw new Error('No tenés permiso para gestionar remitos.');
  }
}

/**
 * Borra del storage los archivos que ya no referencia ningún documento. Un remito vinculado desde
 * otra línea comparte el MISMO archivo que el original: borrarlo con una de las dos referencias
 * todavía viva dejaría la otra apuntando a un archivo inexistente.
 */
async function removeUnreferencedFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  // Corre DESPUÉS de que la BD ya guardó: si falla, se loguea y queda a lo sumo un archivo huérfano,
  // nunca se revierte (ni se informa como error) una operación que ya se hizo.
  try {
    const stillReferenced = await prisma.remito_documents.findMany({
      where: { document_path: { in: paths } },
      select: { document_path: true },
    });
    const keep = new Set(stillReferenced.map((document) => document.document_path));
    const orphan = [...new Set(paths)].filter((path) => !keep.has(path));
    if (orphan.length > 0) await storageRemove(REMIT_BUCKET, orphan);
  } catch (error) {
    logger.error('No se pudieron limpiar archivos de remitos sin uso', { data: { error, paths } });
  }
}

/** Extensión del archivo según su tipo (no según el nombre que manda el navegador). */
const EXTENSION_BY_TYPE: Record<(typeof ALLOWED_FILE_TYPES)[number], string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Valida en el servidor el archivo recibido: tipo y tamaño permitidos. */
function requireValidFile(formData: FormData): File {
  const file = formData.get('file');
  if (!(file instanceof File)) {
    throw new Error('No se recibió ningún archivo.');
  }
  if (!(ALLOWED_FILE_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Solo se permiten archivos PDF, JPG, PNG o WebP.');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('El archivo no puede ser mayor a 10MB.');
  }
  return file;
}

/** Carpeta segura a partir de un texto (el nombre del cliente): sin barras ni caracteres raros. */
function safeSegment(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'remitos'
  );
}

/**
 * Ruta del archivo en el bucket. La carpeta sale del cliente de la línea, resuelto en el servidor,
 * y la extensión del tipo de archivo validado.
 */
function remitStoragePath(remitNumber: string, customerName: string | null | undefined, file: File): string {
  const extension = EXTENSION_BY_TYPE[file.type as keyof typeof EXTENSION_BY_TYPE];
  const fileName = `remito-${safeSegment(remitNumber)}-${Date.now()}.${extension}`;
  return `${customerName ? safeSegment(customerName) : 'remitos'}/${fileName}`;
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
    select: {
      id: true,
      remit_number: true,
      daily_report_row_id: true,
      is_linked: true,
      dailyreportrows: { select: { customers: { select: { name: true } } } },
    },
  });
  if (!remito) throw new Error('El remito no existe o no pertenece a la empresa activa.');
  return remito;
}

// ============================================================================
// LECTURAS
// ============================================================================

/** Remitos de una línea con sus documentos. */
export async function getRemitosWithDocuments(dailyReportRowId: string) {
  const companyId = await getActiveCompanyId();

  return prisma.remitos.findMany({
    where: { daily_report_row_id: dailyReportRowId, ...rowScope(companyId) },
    include: { remito_documents: { orderBy: { created_at: 'asc' } } },
    orderBy: { created_at: 'asc' },
  });
}

/** Documentos de OTROS remitos de la misma línea, para poder vincularlos. */
export async function getAvailableDocumentsForLinking(dailyReportRowId: string, currentRemitId?: string) {
  const companyId = await getActiveCompanyId();

  return prisma.remito_documents.findMany({
    where: {
      remitos: {
        daily_report_row_id: dailyReportRowId,
        ...rowScope(companyId),
        ...(currentRemitId ? { id: { not: currentRemitId } } : {}),
      },
    },
    include: { remitos: { select: { id: true, remit_number: true, daily_report_row_id: true } } },
    orderBy: { created_at: 'desc' },
  });
}

/** Remitos de otras líneas que se pueden vincular a la actual (máximo 10). */
export async function getAvailableRemitosForLinking(currentDailyReportRowId: string, searchQuery?: string) {
  const companyId = await getActiveCompanyId();

  const currentRow = await prisma.dailyreportrows.findFirst({
    where: { id: currentDailyReportRowId, dailyreport: { company_id: companyId } },
    select: { customer_id: true },
  });
  if (!currentRow) throw new Error('La línea del parte diario no existe o no pertenece a la empresa activa.');

  const remitos = await prisma.remitos.findMany({
    where: {
      daily_report_row_id: { not: currentDailyReportRowId },
      // Solo remitos de líneas del MISMO cliente: el límite de 10 aplica sobre candidatos válidos
      dailyreportrows: { dailyreport: { company_id: companyId }, customer_id: currentRow.customer_id },
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
  await assertCanWriteRemitos({ allowCommercialCreate: true });
  const companyId = await getActiveCompanyId();
  await assertRowInCompany(dailyReportRowId, companyId);

  const number = remitNumber.trim();
  if (!number) throw new Error('El número de remito es obligatorio.');

  const existing = await prisma.remitos.findFirst({
    where: { daily_report_row_id: dailyReportRowId, remit_number: number },
    select: { id: true },
  });
  if (existing) {
    throw new Error(`Ya existe un remito con el número ${number}`);
  }

  return withSessionActor((tx) =>
    tx.remitos.create({
      data: { daily_report_row_id: dailyReportRowId, remit_number: number },
    })
  );
}

/**
 * Sube un archivo y lo asocia al remito. Si falla la fila, se borra el archivo subido
 * para no dejar basura en el storage.
 */
export async function uploadDocumentToRemito(remitId: string, formData: FormData) {
  await assertCanWriteRemitos();
  const companyId = await getActiveCompanyId();
  const remito = await requireRemitInCompany(remitId, companyId);

  const file = requireValidFile(formData);
  const storagePath = remitStoragePath(remito.remit_number, remito.dailyreportrows.customers?.name, file);

  const uploaded = await storageUpload(REMIT_BUCKET, storagePath, file, { upsert: true });
  if (!uploaded.ok) {
    throw new Error(uploaded.error);
  }

  try {
    return await withSessionActor((tx) =>
      tx.remito_documents.create({
        data: { remit_id: remitId, document_path: uploaded.data.path, document_name: file.name },
      })
    );
  } catch (error) {
    await storageRemove(REMIT_BUCKET, [uploaded.data.path]);
    logger.error('Error al registrar el documento del remito', { data: { error, remitId } });
    throw error;
  }
}

/** Vincula un archivo ya existente en el storage a otro remito (sin duplicarlo). */
export async function linkExistingDocument(remitId: string, documentPath: string, documentName: string) {
  await assertCanWriteRemitos();
  const companyId = await getActiveCompanyId();
  await requireRemitInCompany(remitId, companyId);

  // El archivo tiene que venir de un documento de la misma empresa.
  const source = await prisma.remito_documents.findFirst({
    where: { document_path: documentPath, remitos: rowScope(companyId) },
    select: { id: true },
  });
  if (!source) {
    throw new Error('El documento no existe o no pertenece a la empresa activa.');
  }

  return withSessionActor((tx) =>
    tx.remito_documents.create({
      data: { remit_id: remitId, document_path: documentPath, document_name: documentName },
    })
  );
}

/** Copia un remito (y las referencias a sus documentos) a otra línea, marcándolo vinculado. */
export async function linkExistingRemito(sourceRemitId: string, targetDailyReportRowId: string) {
  await assertCanWriteRemitos();
  const companyId = await getActiveCompanyId();
  await assertRowInCompany(targetDailyReportRowId, companyId);

  const sourceRemito = await prisma.remitos.findFirst({
    where: { id: sourceRemitId, ...rowScope(companyId) },
    include: { remito_documents: true, dailyreportrows: { select: { customer_id: true } } },
  });
  if (!sourceRemito) {
    throw new Error('El remito de origen no existe o no pertenece a la empresa activa.');
  }

  // Misma regla que muestra el diálogo: un remito solo se comparte entre líneas del mismo cliente
  const targetRow = await prisma.dailyreportrows.findFirst({
    where: { id: targetDailyReportRowId },
    select: { customer_id: true },
  });
  if (targetRow?.customer_id !== sourceRemito.dailyreportrows.customer_id) {
    throw new Error('Solo se pueden vincular remitos de líneas del mismo cliente.');
  }

  const existing = await prisma.remitos.findFirst({
    where: { daily_report_row_id: targetDailyReportRowId, remit_number: sourceRemito.remit_number },
    select: { id: true },
  });
  if (existing) {
    throw new Error(`Ya existe un remito con el número ${sourceRemito.remit_number} en esta línea`);
  }

  return withSessionActor(async (tx) => {
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
// ACTUALIZACIONES
// ============================================================================

/** Cambia el número de un remito. */
export async function updateRemitoNumber(remitId: string, newRemitNumber: string) {
  await assertCanWriteRemitos();
  const companyId = await getActiveCompanyId();
  const remito = await requireRemitInCompany(remitId, companyId);

  const number = newRemitNumber.trim();
  if (!number) throw new Error('El número de remito es obligatorio.');

  const duplicate = await prisma.remitos.findFirst({
    where: { daily_report_row_id: remito.daily_report_row_id, remit_number: number, id: { not: remitId } },
    select: { id: true },
  });
  if (duplicate) throw new Error(`Ya existe un remito con el número ${number}`);

  return withSessionActor((tx) =>
    tx.remitos.update({
      where: { id: remitId },
      data: { remit_number: number, updated_at: new Date() },
    })
  );
}

/** Reemplaza el archivo de un documento y borra el anterior del storage. */
export async function replaceDocument(documentId: string, formData: FormData) {
  await assertCanWriteRemitos();
  const companyId = await getActiveCompanyId();

  const currentDoc = await prisma.remito_documents.findFirst({
    where: { id: documentId, remitos: rowScope(companyId) },
    select: {
      id: true,
      document_path: true,
      remitos: {
        select: { remit_number: true, dailyreportrows: { select: { customers: { select: { name: true } } } } },
      },
    },
  });
  if (!currentDoc) {
    throw new Error('El documento no existe o no pertenece a la empresa activa.');
  }

  const file = requireValidFile(formData);
  const storagePath = remitStoragePath(
    currentDoc.remitos.remit_number,
    currentDoc.remitos.dailyreportrows.customers?.name,
    file
  );

  const uploaded = await storageUpload(REMIT_BUCKET, storagePath, file, { upsert: true });
  if (!uploaded.ok) {
    throw new Error(uploaded.error);
  }

  let updated;
  try {
    updated = await withSessionActor((tx) =>
      tx.remito_documents.update({
        where: { id: documentId },
        data: { document_path: uploaded.data.path, document_name: file.name, updated_at: new Date() },
      })
    );
  } catch (error) {
    await storageRemove(REMIT_BUCKET, [uploaded.data.path]);
    logger.error('Error al reemplazar el documento del remito', { data: { error, documentId } });
    throw error;
  }

  // El archivo anterior puede seguir en uso por un remito vinculado: solo se borra si quedó huérfano
  await removeUnreferencedFiles([currentDoc.document_path]);
  return updated;
}

// ============================================================================
// BAJAS
// ============================================================================

/** Borra un documento y su archivo del storage. */
export async function deleteRemitDocument(documentId: string) {
  await assertCanWriteRemitos();
  const companyId = await getActiveCompanyId();

  const document = await prisma.remito_documents.findFirst({
    where: { id: documentId, remitos: rowScope(companyId) },
    select: { id: true, document_path: true },
  });
  if (!document) {
    throw new Error('El documento no existe o no pertenece a la empresa activa.');
  }

  await withSessionActor((tx) => tx.remito_documents.delete({ where: { id: documentId } }));
  await removeUnreferencedFiles([document.document_path]);
  return true;
}

/** Borra un remito con todos sus documentos y archivos. */
export async function deleteRemito(remitId: string) {
  await assertCanWriteRemitos();
  const companyId = await getActiveCompanyId();
  await requireRemitInCompany(remitId, companyId);

  const documents = await prisma.remito_documents.findMany({
    where: { remit_id: remitId },
    select: { document_path: true },
  });

  await withSessionActor((tx) => tx.remitos.delete({ where: { id: remitId } }));

  // Los archivos que comparte con remitos vinculados en otras líneas se conservan
  await removeUnreferencedFiles(documents.map((document) => document.document_path));
  return true;
}

/** Desvincula un remito copiado: borra las referencias, nunca los archivos originales. */
export async function unlinkRemito(remitId: string) {
  await assertCanWriteRemitos();
  const companyId = await getActiveCompanyId();
  const remito = await requireRemitInCompany(remitId, companyId);

  if (!remito.is_linked) {
    throw new Error('Este remito no es vinculado y no puede ser desvinculado');
  }

  // `remito_documents` cae por cascada; los archivos del storage quedan intactos.
  await withSessionActor((tx) => tx.remitos.delete({ where: { id: remitId } }));
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
export type AvailableDocument = Awaited<ReturnType<typeof getAvailableDocumentsForLinking>>[number];
export type AvailableRemito = Awaited<ReturnType<typeof getAvailableRemitosForLinking>>[number];
export type Remito = Awaited<ReturnType<typeof createRemito>>;
