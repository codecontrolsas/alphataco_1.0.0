import 'server-only';

import { Logger } from '@/lib/logger';
import { loadCompanyLogo, loadReactPdf, toPdfDownload } from '@/shared/lib/pdf/react-pdf.server';
import type { PdfDownload } from '@/shared/lib/pdf/types';
import { prisma } from '@/shared/lib/prisma';
import { storageDownload, storageRemove, storageUpload } from '@/shared/lib/storage';
import { buildStorageDownloadUrl } from '@/shared/lib/storage-url';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HSE_FILES_BUCKET } from '../lib/constants';
import { certificateContentSchema, recordContentSchema } from '../lib/pdf-content';
import { CertificatePdfDocument, RecordPdfDocument } from './HsePdfDocuments';

/**
 * PDF de constancias y actas: se generan en el SERVIDOR desde el contenido congelado, se guardan UNA vez en `hse-files`
 * (sin URL pública: se sirven por `/api/files` con el perímetro de la fila bajo RLS) con su huella, y cada descarga
 * verifica esa huella contra el archivo guardado (si alguien lo cambia en el storage, no se entrega).
 *
 * Generación bajo demanda: si el PDF todavía no existe (falló la subida al firmar, datos de la demo) se genera en la
 * primera descarga. Las escrituras en la base pasan por funciones SQL que validan dueño o permiso
 * (`hse_attach_certificate_pdf`, `hse_attach_record_pdf`) y corren con el contexto del request (`prisma`).
 *
 * Módulo server-only (NO son Server Actions): lo usan las acciones del portal y del dashboard, que ya controlaron
 * sesión y permisos.
 */

const logger = new Logger('features/Hse/pdf');

const DOCUMENT_FILES_BUCKET = 'document-files';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
/** Sufijo único por generación: dos descargas simultáneas no se pisan el archivo (la que pierde borra el suyo). */
const generation = () => randomUUID().slice(0, 8);

/**
 * `url`: el archivo guardado, por el proxy con perímetro. `file`: un anulado, generado en el momento CON la marca
 * "ANULADA" (el original guardado no se toca y queda para auditoría; nunca se entrega limpio un documento anulado).
 */
export type HsePdfResult = { ok: true; url: string } | { ok: true; file: PdfDownload } | { ok: false; error: string };

const ALTERED = 'El PDF guardado no coincide con su huella: no se entrega. Avisá al área de HSE.';
const NOT_GENERATED = 'No se pudo generar el PDF. Intentá de nuevo en unos minutos.';

const attachCertificateSchema = z.object({
  pdfPath: z.string().nullable(),
  pdfSha256: z.string().nullable(),
  employeeDocumentId: z.string().nullable(),
  registered: z.boolean(),
});
const attachRecordSchema = z.object({ pdfPath: z.string().nullable(), pdfSha256: z.string().nullable() });

/** Lee el archivo guardado y confirma que su SHA-256 sea el registrado al generarlo. */
async function verifyStored(path: string, expected: string | null): Promise<boolean> {
  const downloaded = await storageDownload(HSE_FILES_BUCKET, path);
  if (!downloaded.ok) return false;
  const actual = sha256(new Uint8Array(await downloaded.data.arrayBuffer()));
  return expected !== null && actual === expected;
}

async function companyLogo(companyId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { company_logo: true } });
  return loadCompanyLogo(company?.company_logo ?? null);
}

async function renderCertificate(certificate: CertificateRow): Promise<Uint8Array> {
  const content = certificateContentSchema.parse(certificate.content);
  const [rp, logo] = await Promise.all([loadReactPdf(), companyLogo(certificate.company_id)]);
  const voided =
    certificate.voided_at && certificate.void_reason
      ? { at: certificate.voided_at.toISOString(), reason: certificate.void_reason }
      : null;
  const buffer = await rp.renderToBuffer(
    CertificatePdfDocument(rp, content, { sha256: certificate.content_sha256, voided }, logo)
  );
  return new Uint8Array(buffer);
}

const CERTIFICATE_SELECT = {
  id: true,
  company_id: true,
  employee_id: true,
  content: true,
  content_sha256: true,
  pdf_path: true,
  pdf_sha256: true,
  employee_document_id: true,
  voided_at: true,
  void_reason: true,
} as const;
type CertificateRow = NonNullable<Awaited<ReturnType<typeof findCertificate>>>;

/** La constancia, leída con el cliente contextual: la RLS deja verla solo al empleado dueño o con permiso de HSE. */
function findCertificate(certificateId: string, employeeId?: string) {
  return prisma.hse_training_certificates.findFirst({
    where: { id: certificateId, ...(employeeId ? { employee_id: employeeId } : {}) },
    select: CERTIFICATE_SELECT,
  });
}

async function attachCertificate(
  certificateId: string,
  pdfPath: string | null,
  pdfSha: string | null,
  docPath: string | null
) {
  const rows = await prisma.$transaction(
    (tx) => tx.$queryRaw<{ r: unknown }[]>`
      SELECT public.hse_attach_certificate_pdf(${certificateId}::uuid, ${pdfPath}, ${pdfSha}, ${docPath}) AS r`
  );
  return attachCertificateSchema.parse(rows[0]?.r);
}

/**
 * Deja el PDF de la constancia guardado (si no estaba) y registrado en el legajo (si corresponde), y devuelve la URL
 * de descarga. La llaman la firma (justo después de firmar) y las descargas. `null` si la constancia no se ve.
 */
export async function ensureCertificatePdf(
  certificateId: string,
  options: { employeeId?: string } = {}
): Promise<HsePdfResult | null> {
  // `employeeId`: el portal acota a las constancias del legajo de la sesión además de la RLS (un empleado que también
  // es miembro del dashboard corre como `user` y la RLS sola no lo limitaría a las suyas).
  const certificate = await findCertificate(certificateId, options.employeeId);
  if (!certificate) return null;

  if (certificate.voided_at) {
    try {
      const bytes = await renderCertificate(certificate);
      return {
        ok: true,
        file: toPdfDownload({ filename: `constancia-anulada-${certificate.id.slice(0, 8)}.pdf`, content: bytes }),
      };
    } catch (error) {
      logger.error('No se pudo generar el PDF de la constancia anulada', { data: { error, certificateId } });
      return { ok: false, error: NOT_GENERATED };
    }
  }
  const needsFile = !certificate.employee_document_id;

  if (certificate.pdf_path) {
    if (!(await verifyStored(certificate.pdf_path, certificate.pdf_sha256))) {
      logger.error('Huella del PDF de la constancia distinta a la registrada', {
        data: { certificateId, path: certificate.pdf_path },
      });
      return { ok: false, error: ALTERED };
    }
    if (needsFile) await registerInEmployeeFile(certificate, null);
    return { ok: true, url: buildStorageDownloadUrl(HSE_FILES_BUCKET, certificate.pdf_path) };
  }

  let bytes: Uint8Array;
  try {
    bytes = await renderCertificate(certificate);
  } catch (error) {
    logger.error('No se pudo generar el PDF de la constancia', { data: { error, certificateId } });
    return { ok: false, error: NOT_GENERATED };
  }
  const path = `${certificate.company_id}/certificates/${certificate.employee_id}/${certificate.id}-${generation()}.pdf`;
  const hash = sha256(bytes);
  const uploaded = await storageUpload(HSE_FILES_BUCKET, path, new Blob([bytes], { type: 'application/pdf' }), {
    upsert: true,
  });
  if (!uploaded.ok) return { ok: false, error: NOT_GENERATED };

  const attached = needsFile
    ? await registerInEmployeeFile(certificate, { path, sha256: hash, bytes })
    : await attachCertificate(certificate.id, path, hash, null).catch((error: unknown) => {
        logger.error('No se pudo adjuntar el PDF de la constancia', { data: { error, certificateId } });
        return null;
      });
  if (!attached || !attached.pdfPath) {
    await storageRemove(HSE_FILES_BUCKET, [path]);
    return { ok: false, error: NOT_GENERATED };
  }
  // Otra descarga simultánea ganó: se usa su archivo y se borra el nuestro si quedó con otro nombre.
  if (attached.pdfPath !== path) await storageRemove(HSE_FILES_BUCKET, [path]);
  return { ok: true, url: buildStorageDownloadUrl(HSE_FILES_BUCKET, attached.pdfPath) };
}

/**
 * Registra la constancia en el legajo: copia el PDF a `document-files` (el bucket de la documentación del empleado) y
 * crea el documento `aprobado` con su vencimiento (`hse_attach_certificate_pdf`). Si la base no lo registró (ya estaba
 * o se anuló en el medio), se borra la copia. Nunca rompe la descarga: un fallo queda en el log y se reintenta en la
 * próxima descarga.
 */
async function registerInEmployeeFile(
  certificate: CertificateRow,
  pdf: { path: string; sha256: string; bytes: Uint8Array } | null
) {
  const docPath = `constancias-hse/${certificate.company_id}/${certificate.id}-${generation()}.pdf`;
  let bytes = pdf?.bytes ?? null;
  if (!bytes && certificate.pdf_path) {
    const downloaded = await storageDownload(HSE_FILES_BUCKET, certificate.pdf_path);
    bytes = downloaded.ok ? new Uint8Array(await downloaded.data.arrayBuffer()) : null;
  }
  const copied = bytes
    ? await storageUpload(DOCUMENT_FILES_BUCKET, docPath, new Blob([bytes], { type: 'application/pdf' }), {
        upsert: true,
      })
    : null;
  try {
    const attached = await attachCertificate(
      certificate.id,
      pdf?.path ?? null,
      pdf?.sha256 ?? null,
      copied?.ok ? docPath : null
    );
    if (copied?.ok && !attached.registered) await storageRemove(DOCUMENT_FILES_BUCKET, [docPath]);
    if (attached.registered) {
      logger.info('Constancia HSE registrada en el legajo', {
        data: { certificateId: certificate.id, documentId: attached.employeeDocumentId },
      });
    }
    return attached;
  } catch (error) {
    logger.error('No se pudo registrar la constancia en el legajo', { data: { error, certificateId: certificate.id } });
    if (copied?.ok) await storageRemove(DOCUMENT_FILES_BUCKET, [docPath]);
    return null;
  }
}

async function renderRecord(record: {
  company_id: string;
  content: unknown;
  content_sha256: string | null;
  voided_at: Date | null;
  void_reason: string | null;
}): Promise<Uint8Array> {
  const content = recordContentSchema.parse(record.content);
  const [rp, logo] = await Promise.all([loadReactPdf(), companyLogo(record.company_id)]);
  const voided =
    record.voided_at && record.void_reason ? { at: record.voided_at.toISOString(), reason: record.void_reason } : null;
  return new Uint8Array(
    await rp.renderToBuffer(RecordPdfDocument(rp, content, { sha256: record.content_sha256 ?? '', voided }, logo))
  );
}

/** PDF del acta cerrada o anulada (solo dashboard con permiso de actas). `null` si no se ve o es un borrador. */
export async function ensureRecordPdf(recordId: string): Promise<HsePdfResult | null> {
  const record = await prisma.hse_training_records.findFirst({
    where: { id: recordId, status: { not: 'draft' } },
    select: {
      id: true,
      company_id: true,
      content: true,
      content_sha256: true,
      pdf_path: true,
      pdf_sha256: true,
      voided_at: true,
      void_reason: true,
    },
  });
  if (!record || !record.content || !record.content_sha256) return null;

  if (record.voided_at) {
    try {
      const bytes = await renderRecord(record);
      return {
        ok: true,
        file: toPdfDownload({ filename: `acta-anulada-${record.id.slice(0, 8)}.pdf`, content: bytes }),
      };
    } catch (error) {
      logger.error('No se pudo generar el PDF del acta anulada', { data: { error, recordId } });
      return { ok: false, error: NOT_GENERATED };
    }
  }

  if (record.pdf_path) {
    if (!(await verifyStored(record.pdf_path, record.pdf_sha256))) {
      logger.error('Huella del PDF del acta distinta a la registrada', { data: { recordId, path: record.pdf_path } });
      return { ok: false, error: ALTERED };
    }
    return { ok: true, url: buildStorageDownloadUrl(HSE_FILES_BUCKET, record.pdf_path) };
  }

  let bytes: Uint8Array;
  try {
    bytes = await renderRecord(record);
  } catch (error) {
    logger.error('No se pudo generar el PDF del acta', { data: { error, recordId } });
    return { ok: false, error: NOT_GENERATED };
  }
  const path = `${record.company_id}/records/${record.id}-${generation()}.pdf`;
  const hash = sha256(bytes);
  const uploaded = await storageUpload(HSE_FILES_BUCKET, path, new Blob([bytes], { type: 'application/pdf' }), {
    upsert: true,
  });
  if (!uploaded.ok) return { ok: false, error: NOT_GENERATED };
  const rows = await prisma.$transaction(
    (tx) =>
      tx.$queryRaw<{ r: unknown }[]>`SELECT public.hse_attach_record_pdf(${record.id}::uuid, ${path}, ${hash}) AS r`
  );
  const attached = attachRecordSchema.parse(rows[0]?.r);
  if (!attached.pdfPath) return { ok: false, error: NOT_GENERATED };
  if (attached.pdfPath !== path) await storageRemove(HSE_FILES_BUCKET, [path]);
  return { ok: true, url: buildStorageDownloadUrl(HSE_FILES_BUCKET, attached.pdfPath) };
}
