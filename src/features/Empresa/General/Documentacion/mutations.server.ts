'use server';

import { documentTypeReadScope } from '@/features/Documentacion/TiposDocumentos/lib/document-type-scope';
import { normalizePeriod } from '@/features/Documentacion/shared/compliance/dates';
import { assertDocumentUploadPermission } from '@/features/Documentacion/shared/lib/document-permissions';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { DOCUMENT_FILES_BUCKET, storageRemove, storageUpload } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { formatDocumentTypeName, formatPathSegment } from '@/shared/utils/legacy-mappers';
import moment from 'moment';

/**
 * Subida de un documento de EMPRESA (`documents_company`). Antes el navegador tocaba el storage
 * y la tabla por PostgREST; ahora el archivo viaja en un `FormData`, se sube en el servidor
 * y la fila se escribe con Prisma dentro de `withActor`.
 *
 * FormData: `file`, `documentTypeId`, `validity?` (YYYY-MM-DD), `period?` (YYYY-MM).
 * Perímetro: la fila es siempre la de la empresa activa (`applies`), el tipo tiene que aplicar a
 * Empresa y ser global o de la empresa, y el usuario sale de la sesión.
 */
const logger = new Logger('features/Empresa/General/company-documents');

export type UploadCompanyDocumentResult = { ok: true } | { ok: false; error: string };

function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value ? value : undefined;
}

export async function uploadCompanyDocument(formData: FormData): Promise<UploadCompanyDocumentResult> {
  const file = formData.get('file');
  const documentTypeId = formString(formData, 'documentTypeId');
  const validityRaw = formString(formData, 'validity');
  const periodRaw = formString(formData, 'period');

  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No se ha subido el archivo' };
  if (!documentTypeId) return { ok: false, error: 'Falta el tipo de documento' };

  const extension = file.name.split('.').pop();
  if (!extension || extension === file.name) return { ok: false, error: 'El archivo no tiene extensión' };

  // Acepta DD/MM/YYYY, YYYY-MM-DD o DD-MM-YYYY; siempre persiste como DD/MM/YYYY (validity es String en BD).
  const validityMoment = validityRaw ? moment(validityRaw, ['DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'], true) : null;
  if (validityMoment && !validityMoment.isValid()) return { ok: false, error: 'Fecha de vencimiento inválida' };

  // Período normalizado (`YYYY-MM`, acepta también `MM/YYYY`): es la clave de unicidad de los mensuales.
  const period = periodRaw ? normalizePeriod(periodRaw) : null;
  if (periodRaw && !period) return { ok: false, error: 'Período inválido' };

  try {
    const companyId = await getActiveCompanyId();
    const credentialId = await getSessionUserId();
    if (!credentialId) return { ok: false, error: 'Sesión requerida' };

    const [company, docType, profile, candidates] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { company_name: true, company_cuit: true } }),
      prisma.document_types.findFirst({
        where: { id: documentTypeId, applies: 'Empresa', is_active: true, AND: [documentTypeReadScope(companyId)] },
        select: { name: true, explired: true, is_it_montlhy: true, private: true },
      }),
      prisma.profile.findUnique({ where: { credential_id: credentialId }, select: { id: true } }),
      // Todas las filas de la empresa para este tipo: los mensuales tienen una por período.
      prisma.documents_company.findMany({
        where: { applies: companyId, id_document_types: documentTypeId },
        select: { id: true, document_path: true, period: true },
      }),
    ]);
    if (!company) return { ok: false, error: 'Empresa activa no encontrada' };
    if (!docType) return { ok: false, error: 'Tipo de documento no válido para la empresa' };
    if (!profile) return { ok: false, error: 'El usuario de sesión no tiene perfil' };

    // Permiso: quien administra la pantalla de Configuración (`configuracion:documentacion:create`) o quien
    // puede subir documentos de empresa desde Documentación. Los tipos privados exigen siempre `upload_private`.
    const canUploadFromConfig = docType.private
      ? false
      : await checkPermissionServer('configuracion', 'documentacion', 'create');
    if (!canUploadFromConfig) {
      try {
        await assertDocumentUploadPermission('company', {
          monthly: Boolean(docType.is_it_montlhy),
          isPrivate: Boolean(docType.private),
        });
      } catch {
        return { ok: false, error: 'No tenés permiso para subir este documento.' };
      }
    }
    if (docType.explired && !validityMoment)
      return { ok: false, error: 'Este documento requiere fecha de vencimiento' };
    if (docType.is_it_montlhy && !period) return { ok: false, error: 'Este documento requiere período' };

    // Un documento por (tipo) si es permanente y por (tipo, período) si es mensual. Una fila vacía
    // legacy (sin archivo) se reutiliza en lugar de crear otra.
    const hasFile = (row: { document_path: string | null }) => Boolean(row.document_path?.trim());
    const sameSlot = (row: { period: string | null }) =>
      !docType.is_it_montlhy || normalizePeriod(row.period) === period;
    if (candidates.some((row) => hasFile(row) && sameSlot(row))) {
      return { ok: false, error: 'Este documento ya se encuentra subido' };
    }
    const existing = candidates.find((row) => !hasFile(row) && (sameSlot(row) || row.period === null)) ?? null;

    // El nombre se normaliza: Storage rechaza tildes y ñ en la key con `InvalidKey`.
    const companyFolder = `${formatPathSegment(company.company_name)}-(${company.company_cuit})`;
    // `document_path` es único: en los mensuales la marca incluye el período, si no dos períodos chocarían.
    const validityMark = validityMoment ? validityMoment.format('YYYY-MM-DD') : null;
    const periodMark = docType.is_it_montlhy ? period : null;
    const validitySegment = [validityMark, periodMark].filter(Boolean).join('-') || 'v0';
    const path = `${companyFolder}/empresa/${formatDocumentTypeName(docType.name)}-(${validitySegment}).${extension}`;

    const uploaded = await storageUpload(DOCUMENT_FILES_BUCKET, path, file);
    if (!uploaded.ok) {
      return {
        ok: false,
        error: /exists|duplicate/i.test(uploaded.error) ? 'Este documento ya se encuentra subido' : uploaded.error,
      };
    }

    const data = {
      validity: validityMoment ? validityMoment.format('DD/MM/YYYY') : null,
      period: docType.is_it_montlhy ? period : null,
      user_id: profile.id,
      created_at: new Date(),
      state: 'presentado' as const,
      document_path: uploaded.data.path,
    };

    try {
      await withActor(credentialId, async (tx) => {
        if (existing) {
          await tx.documents_company.update({ where: { id: existing.id }, data });
        } else {
          await tx.documents_company.create({
            data: { ...data, applies: companyId, id_document_types: documentTypeId },
          });
        }
      });
    } catch (dbError) {
      await storageRemove(DOCUMENT_FILES_BUCKET, [uploaded.data.path]); // compensación
      throw dbError;
    }

    logger.info('Documento de empresa subido', { data: { companyId, documentTypeId } });
    return { ok: true };
  } catch (error) {
    logger.error('Error al subir documento de empresa', { data: { error, documentTypeId } });
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo subir el documento' };
  }
}
