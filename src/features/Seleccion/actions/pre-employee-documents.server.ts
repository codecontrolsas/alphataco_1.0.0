'use server';

import { toPathExtension, toPathIdentifier } from '@/shared/lib/storage-file-name';
import { formatPathSegment } from '@/shared/utils/legacy-mappers';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { DOCUMENT_FILES_BUCKET, storageFileUrls, storageRemove, storageUpload } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { validateDocumentFile } from '@/features/Documentacion/shared/lib/document-file-rules';
import { revalidatePath } from 'next/cache';

const logger = new Logger('features/PreLegajos/documents');

type UploadResult = { ok: true; documentPath: string } | { ok: false; error: string };

/**
 * Checklist de documentos de un candidato: los tipos habilitados para candidato
 * (`available_for_pre_file`) cruzados con lo que el postulante ya subio.
 *
 * No hay motor de alertas: solo existen filas para documentos efectivamente cargados,
 * y nada de esto entra en el status documental ni en las estadisticas de empleados.
 */
export async function getPreEmployeeDocumentChecklist(preEmployeeId: string) {
  logger.debug('Obteniendo checklist de documentos', { data: { preEmployeeId } });
  if (!(await checkPermissionServer('seleccion', 'candidatos', 'view'))) {
    throw new Error('No tenés permiso para ver los documentos de candidatos');
  }
  const companyId = await getActiveCompanyId();

  try {
    const [documentTypes, uploaded] = await Promise.all([
      prisma.document_types.findMany({
        // Tipos globales (company_id NULL) o de la empresa activa
        where: {
          available_for_pre_file: true,
          is_active: true,
          applies: 'Persona',
          company_id: companyId,
        },
        select: { id: true, name: true, mandatory: true, explired: true, description: true },
        orderBy: [{ mandatory: 'desc' }, { name: 'asc' }],
      }),
      prisma.documents_pre_employees.findMany({
        where: withCompany({ pre_employee_id: preEmployeeId }, companyId),
        select: { id: true, document_type_id: true, document_path: true, validity: true, uploaded_at: true },
      }),
    ]);

    const uploadedByType = new Map(uploaded.map((document) => [document.document_type_id, document]));

    return documentTypes.map((documentType) => ({
      documentType,
      document: uploadedByType.get(documentType.id) ?? null,
    }));
  } catch (error) {
    logger.error('Error al obtener el checklist de documentos', { data: { error, preEmployeeId } });
    throw error;
  }
}

export type PreEmployeeChecklistItem = Awaited<ReturnType<typeof getPreEmployeeDocumentChecklist>>[number];

/**
 * Arma la ruta del archivo dentro del bucket, con el mismo esquema que el resto del sistema.
 *
 * OJO con el segmento `pre-legajo/`: es la ubicacion FISICA de los archivos ya subidos, no un
 * texto de interfaz. Renombrarlo al vocabulario nuevo ("candidato") dejaria huerfano todo lo
 * que ya esta en el storage, porque la ruta guardada en la base seguiria apuntando a la vieja.
 * Si alguna vez se quiere cambiar, hay que migrar los objetos del bucket y las rutas juntos.
 */
function buildStoragePath(params: {
  companyName: string;
  companyCuit: string;
  preFileNumber: string;
  fullName: string;
  documentTypeName: string;
  fileExtension: string;
}) {
  const slug = formatPathSegment;

  return `${slug(params.companyName)}-(${toPathIdentifier(params.companyCuit)})/pre-legajo/${params.preFileNumber}-${slug(
    params.fullName
  )}/${slug(params.documentTypeName)}.${toPathExtension(params.fileExtension)}`;
}

/**
 * Sube (o reemplaza) un documento del checklist del candidato.
 * Si la persistencia falla, borra el archivo para no dejarlo huerfano en el storage.
 */
export async function uploadPreEmployeeDocument(formData: FormData): Promise<UploadResult> {
  const file = formData.get('file') as File | null;
  const preEmployeeId = formData.get('preEmployeeId') as string | null;
  const documentTypeId = formData.get('documentTypeId') as string | null;
  const validityRaw = (formData.get('validity') as string | null) || undefined;

  if (!file || !preEmployeeId || !documentTypeId) {
    return { ok: false, error: 'Faltan datos para subir el documento' };
  }

  const hasPermission = await checkPermissionServer('seleccion', 'candidatos', 'update');
  if (!hasPermission) return { ok: false, error: 'No tenés permiso para cargar documentos del candidato' };

  // Tamaño y extensión validados en el servidor (el `accept` del input no frena una llamada directa)
  const fileError = validateDocumentFile(file);
  if (fileError) return { ok: false, error: fileError };

  let validity: Date | null = null;
  if (validityRaw) {
    validity = new Date(validityRaw);
    if (Number.isNaN(validity.getTime())) return { ok: false, error: 'La fecha de vencimiento no es válida' };
  }

  const [profile, companyId] = await Promise.all([requireServerAuthProfile(), getActiveCompanyId()]);

  const [preEmployee, documentType] = await Promise.all([
    prisma.pre_employees.findFirst({
      where: withCompany({ id: preEmployeeId }, companyId),
      select: {
        id: true,
        status: true,
        pre_file_number: true,
        firstname: true,
        lastname: true,
        company: { select: { company_name: true, company_cuit: true } },
      },
    }),
    prisma.document_types.findFirst({
      where: { id: documentTypeId, company_id: companyId },
      select: { id: true, name: true, available_for_pre_file: true },
    }),
  ]);

  if (!preEmployee) return { ok: false, error: 'El candidato no existe' };
  if (!documentType?.available_for_pre_file) {
    return { ok: false, error: 'Ese tipo de documento no está habilitado para candidatos' };
  }
  if (preEmployee.status === 'legajo') {
    return { ok: false, error: 'El candidato ya fue convertido: los documentos se cargan desde el legajo' };
  }
  if (preEmployee.status === 'rechazado') {
    return { ok: false, error: 'El candidato está rechazado: hay que reabrirlo para cargar documentos' };
  }

  const fileExtension = file.name.split('.').pop() ?? 'pdf';
  const documentPath = buildStoragePath({
    companyName: preEmployee.company.company_name,
    companyCuit: preEmployee.company.company_cuit,
    preFileNumber: preEmployee.pre_file_number,
    fullName: `${preEmployee.lastname} ${preEmployee.firstname}`,
    documentTypeName: documentType.name,
    fileExtension,
  });

  const previous = await prisma.documents_pre_employees.findUnique({
    where: { pre_employee_id_document_type_id: { pre_employee_id: preEmployeeId, document_type_id: documentTypeId } },
    select: { document_path: true },
  });

  const uploaded = await storageUpload(DOCUMENT_FILES_BUCKET, documentPath, file, { cacheControl: '0', upsert: true });
  if (!uploaded.ok) {
    logger.error('Error al subir el documento del candidato al storage', { data: { error: uploaded.error, documentPath } });
    return { ok: false, error: 'No se pudo subir el archivo' };
  }

  try {
    await prisma.documents_pre_employees.upsert({
      where: {
        pre_employee_id_document_type_id: { pre_employee_id: preEmployeeId, document_type_id: documentTypeId },
      },
      create: {
        pre_employee_id: preEmployeeId,
        document_type_id: documentTypeId,
        document_path: documentPath,
        validity,
        user_id: profile.id,
        company_id: companyId,
      },
      update: {
        document_path: documentPath,
        validity,
        user_id: profile.id,
        uploaded_at: new Date(),
      },
    });

    // La ruta se saneó distinto antes (tildes, espacios): si cambió, el archivo viejo quedaría huérfano.
    if (previous?.document_path && previous.document_path !== documentPath) {
      await storageRemove(DOCUMENT_FILES_BUCKET, [previous.document_path]);
    }
    logger.info('Documento de candidato cargado', { data: { preEmployeeId, documentTypeId } });
    revalidatePath('/dashboard/recruitment/detail');
    return { ok: true, documentPath };
  } catch (error) {
    // Compensacion: la BD fallo, no dejamos el archivo huerfano
    logger.error('Error al persistir el documento; revirtiendo storage', { data: { error, documentPath } });
    await storageRemove(DOCUMENT_FILES_BUCKET, [documentPath]);
    return { ok: false, error: 'No se pudo guardar el documento. Se revirtió la subida.' };
  }
}

/** Quita un documento del checklist (borra la fila y el archivo). */
export async function deletePreEmployeeDocument(documentId: string) {
  logger.debug('Eliminando documento de candidato', { data: { documentId } });

  const hasPermission = await checkPermissionServer('seleccion', 'candidatos', 'update');
  if (!hasPermission) throw new Error('No tenés permiso para eliminar documentos del candidato');

  const companyId = await getActiveCompanyId();
  const document = await prisma.documents_pre_employees.findFirstOrThrow({
    where: withCompany({ id: documentId }, companyId),
    select: { id: true, document_path: true, pre_employees: { select: { status: true } } },
  });

  if (document.pre_employees.status === 'legajo') {
    throw new Error('El candidato ya fue convertido: no se pueden borrar sus documentos');
  }
  // Mismo criterio que la subida: un candidato rechazado no se modifica hasta reabrirlo
  if (document.pre_employees.status === 'rechazado') {
    throw new Error('El candidato está rechazado: hay que reabrirlo para modificar sus documentos');
  }

  try {
    await prisma.documents_pre_employees.delete({ where: { id: documentId, company_id: companyId } });

    // El archivo se borra DESPUÉS de la BD y solo si nadie más referencia el path (un legajo aprobado
    // comparte el mismo `document_path`). Si el borrado del storage falla, queda un archivo huérfano:
    // se loguea, pero la operación del usuario ya está hecha.
    const [stillInPreEmployees, stillInEmployees] = await Promise.all([
      prisma.documents_pre_employees.count({ where: { document_path: document.document_path } }),
      prisma.documents_employees.count({ where: { document_path: document.document_path } }),
    ]);
    if (stillInPreEmployees + stillInEmployees === 0) {
      const removed = await storageRemove(DOCUMENT_FILES_BUCKET, [document.document_path]);
      if (!removed.ok) {
        logger.error('No se pudo borrar el archivo del storage; queda huérfano', {
          data: { error: removed.error, documentPath: document.document_path },
        });
      }
    }

    revalidatePath('/dashboard/recruitment/detail');
  } catch (error) {
    logger.error('Error al eliminar el documento del candidato', { data: { error, documentId } });
    throw error;
  }
}

/**
 * URL para VER un documento del candidato (el botón "Ver" lo abre en una pestaña).
 *
 * Sin `?download=1` a propósito: con `Content-Disposition: attachment` el navegador lo baja
 * en vez de mostrarlo. Sólo se resuelven paths de documentos de la empresa activa, y la
 * ruta que sirve el archivo lo vuelve a verificar.
 */
export async function getPreEmployeeDocumentUrl(documentPath: string) {
  if (!(await checkPermissionServer('seleccion', 'candidatos', 'view'))) {
    throw new Error('No tenés permiso para ver los documentos de candidatos');
  }
  const companyId = await getActiveCompanyId();
  const owned = await prisma.documents_pre_employees.findFirst({
    where: withCompany({ document_path: documentPath }, companyId),
    select: { id: true },
  });
  if (!owned) {
    logger.warn('Se pidió la URL de un documento ajeno a la empresa activa', { data: { documentPath } });
    throw new Error('Documento no encontrado');
  }

  const links = await storageFileUrls(DOCUMENT_FILES_BUCKET, [documentPath]);
  if (!links.ok || !links.data[0]) {
    logger.error('Error al generar la URL del documento', { data: { documentPath } });
    throw new Error('No se pudo generar el enlace del documento');
  }

  return links.data[0].url;
}
