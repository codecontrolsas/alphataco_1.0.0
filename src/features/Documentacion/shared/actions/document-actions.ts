'use server';

import { documentTypeCompanyScope } from '@/features/Documentacion/TiposDocumentos/lib/document-type-scope';
import { uploadCompanyDocument } from '@/features/Empresa/General/Documentacion/mutations.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { typeAppliesTo } from '../compliance';
import { loadComplianceDataset } from '../compliance/server/dataset.server';
import { validateDocumentFile } from '../lib/document-file-rules';
import {
  DocumentPermissionError,
  assertDocumentDetailView,
  assertDocumentUploadPermission,
  canAccessDocumentUpload,
  canSeePrivateDocumentTypes,
} from '../lib/document-permissions';
import { uploadMultiResourceDocument, type UploadMultiResourceDocumentResult } from './upload-multiresource-document';

const logger = new Logger('Documentacion/document-actions');

/**
 * Tipos de documento activos visibles para la empresa activa (globales + propios), por nombre.
 * Sólo para quien puede subir documentos; los tipos privados de un recurso se ofrecen únicamente a
 * quien tiene `view_private`/`upload_private` de ese recurso. Si falla, lanza (no devuelve `[]`).
 */
export const fetchAllDocumentTypes = async () => {
  const companyId = await getActiveCompanyId();
  const [employee, vehicle, company] = await Promise.all([
    canAccessDocumentUpload('employee'),
    canAccessDocumentUpload('vehicle'),
    canAccessDocumentUpload('company'),
  ]);
  if (!employee && !vehicle && !company) throw new DocumentPermissionError('No tenés permiso para subir documentos.');
  const [privateEmployee, privateVehicle, privateCompany] = await Promise.all([
    canSeePrivateDocumentTypes('employee'),
    canSeePrivateDocumentTypes('vehicle'),
    canSeePrivateDocumentTypes('company'),
  ]);
  try {
    const types = await prisma.document_types.findMany({
      where: { is_active: true, AND: [documentTypeCompanyScope(companyId)] },
      orderBy: { name: 'asc' },
    });
    return types.filter((type) => {
      if (type.private !== true) return true;
      return type.applies === 'Persona'
        ? privateEmployee
        : type.applies === 'Equipos'
          ? privateVehicle
          : privateCompany;
    });
  } catch (error) {
    logger.error('Error al obtener tipos de documento', { data: { error } });
    throw error;
  }
};

/** `company` con la provincia resuelta bajo `province_id`, como lo lee la página de detalle. */
const companySelect = {
  id: true,
  company_name: true,
  company_cuit: true,
  company_logo: true,
  address: true,
  country: true,
  contact_phone: true,
  contact_email: true,
  description: true,
  provinces: { select: { name: true } },
} as const;

/**
 * Genérico a propósito: el rest de un `Record<string, unknown>` pierde los campos y el detalle
 * de documento necesita leerlos tipados (`company_name`, `company_cuit`, `address`, …).
 */
function toLegacyCompany<T extends { provinces: { name: string } | null }>({ provinces, ...company }: T) {
  return { ...company, province_id: provinces };
}

/**
 * Documento de empleado por id, con el tipo y el empleado (ciudad, provincia, clientes y empresa)
 * resueltos. Devuelve un array de 0/1 elementos con las claves legacy (`applies`, `company_id`,
 * `city`, `province`) que consume `app/dashboard/document/[id]`. Acotado a la empresa activa.
 */
export const getDocumentEmployeesById = async (id: string) => {
  await assertDocumentDetailView();
  const companyId = await getActiveCompanyId();
  const doc = await prisma.documents_employees.findFirst({
    where: { id, employees: { company_id: companyId } },
    include: {
      document_types: true,
      // Sólo lo que muestran las tarjetas del detalle (Empresa y Empleado): nada de datos personales de más.
      employees: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          file: true,
          document_number: true,
          cuil: true,
          street: true,
          street_number: true,
          phone: true,
          email: true,
          picture: true,
          created_at: true,
          date_of_admission: true,
          cities: { select: { name: true } },
          provinces: { select: { name: true } },
          contractor_employee: { select: { customers: { select: { name: true } } } },
          company: { select: companySelect },
        },
      },
    },
  });
  if (!doc) return [];
  const { employees, ...rest } = doc;
  const applies = employees
    ? (() => {
        const { cities, provinces, company, ...employee } = employees;
        return {
          ...employee,
          city: cities,
          province: provinces,
          company_id: company ? toLegacyCompany(company) : null,
        };
      })()
    : null;
  return [{ ...rest, applies }];
};

/** Documento de equipo por id (marca, modelo, tipo y empresa resueltos). Mismo contrato que el de empleados. */
export const getDocumentEquipmentById = async (id: string) => {
  await assertDocumentDetailView();
  const companyId = await getActiveCompanyId();
  const doc = await prisma.documents_equipment.findFirst({
    where: { id, vehicles: { company_id: companyId } },
    include: {
      document_types: true,
      vehicles: {
        select: {
          id: true,
          domain: true,
          intern_number: true,
          picture: true,
          created_at: true,
          engine: true,
          chassis: true,
          brand_vehicles: { select: { name: true } },
          model_vehicles: { select: { name: true } },
          types_of_vehicles: { select: { name: true } },
          company: { select: companySelect },
        },
      },
    },
  });
  if (!doc) return [];
  const { vehicles, ...rest } = doc;
  const applies = vehicles
    ? (() => {
        const { brand_vehicles, model_vehicles, types_of_vehicles, company, ...vehicle } = vehicles;
        return {
          ...vehicle,
          brand: brand_vehicles,
          model: model_vehicles,
          type_of_vehicle: types_of_vehicles,
          company_id: company ? toLegacyCompany(company) : null,
        };
      })()
    : null;
  return [{ ...rest, applies }];
};

/** Documento de empresa por id (sólo los de la empresa activa), con la empresa resuelta bajo `company`. */
export const getDocumentCompanyById = async (id: string) => {
  await assertDocumentDetailView();
  const companyId = await getActiveCompanyId();
  const doc = await prisma.documents_company.findFirst({
    where: { id, applies: companyId },
    include: { document_types: true, company: { select: companySelect } },
  });
  if (!doc) return [];
  const { company, ...rest } = doc;
  return [{ ...rest, company: toLegacyCompany(company) }];
};

// ============================================================================
// ALTA INDIVIDUAL DESDE UNA EXIGENCIA FALTANTE
// ============================================================================

export type UploadForRequirementInput = {
  kind: 'employee' | 'vehicle' | 'company';
  /** Id del empleado / equipo; para `company`, el id de la empresa activa. */
  resourceId: string;
  documentTypeId: string;
  file: File;
  /** Vencimiento, si el tipo lo tiene. */
  validity?: Date | null;
  /** Período `YYYY-MM`, sólo para tipos mensuales. */
  period?: string;
  /** Sólo equipos. */
  policyNumber?: string;
};

export type UploadForRequirementResult =
  | UploadMultiResourceDocumentResult
  | { ok: false; error: string }
  | { ok: true };

/**
 * Sube el documento de una exigencia que todavía no tiene fila (modelo derivado: un faltante no es
 * una fila `pendiente`). Valida sesión y perímetro de empresa, y que el tipo le aplique al recurso
 * según el motor de cumplimiento (o que sea un tipo no obligatorio). Después reutiliza la vía única de
 * subida: arma el nombre del archivo, inserta la fila `presentado` (o renueva la vencida / reutiliza
 * la fila vacía legacy equivalente), compensa el storage si la transacción falla y refresca el status.
 */
export async function uploadDocumentForRequirement(
  input: UploadForRequirementInput
): Promise<UploadForRequirementResult> {
  try {
    const { kind, resourceId, documentTypeId, file, validity, period, policyNumber } = input;
    const userId = await getSessionUserId();
    if (!userId) return { ok: false, error: 'Sesión requerida' };
    const companyId = await getActiveCompanyId();

    if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'El documento es requerido' };
    const fileError = validateDocumentFile(file);
    if (fileError) return { ok: false, error: fileError };
    if (validity && Number.isNaN(validity.getTime())) return { ok: false, error: 'Fecha de vencimiento inválida' };

    const fd = new FormData();
    fd.append('file', file);
    fd.append('documentTypeId', documentTypeId);
    if (validity) fd.append('validity', validity.toISOString());
    if (period) fd.append('period', period);

    if (kind === 'company') {
      // `uploadCompanyDocument` valida el perímetro y el tipo; el permiso de rol se exige acá.
      const companyType = await prisma.document_types.findFirst({
        where: { id: documentTypeId, is_active: true, AND: [documentTypeCompanyScope(companyId)] },
        select: { private: true, is_it_montlhy: true },
      });
      if (!companyType) return { ok: false, error: 'Tipo de documento no válido para este recurso' };
      await assertDocumentUploadPermission('company', {
        monthly: companyType.is_it_montlhy === true,
        isPrivate: companyType.private === true,
      });
      if (resourceId !== companyId) return { ok: false, error: 'El recurso no pertenece a la empresa activa' };
      return await uploadCompanyDocument(fd);
    }

    const applies = kind === 'employee' ? 'Persona' : 'Equipos';
    const dataset = await loadComplianceDataset(prisma, {
      companyId,
      kind: applies,
      resourceIds: [resourceId],
      includeDocs: false,
    });
    const resource = dataset.resources.find((r) => r.id === resourceId);
    if (!resource) return { ok: false, error: 'El recurso no pertenece a la empresa activa' };
    const type = dataset.types.find((t) => t.id === documentTypeId);
    if (!type || !type.isActive) return { ok: false, error: 'Tipo de documento no válido para este recurso' };
    if (type.mandatory && !typeAppliesTo(type, resource)) {
      logger.warn('Subida para una exigencia que no aplica al recurso', { data: { kind, resourceId, documentTypeId } });
      return { ok: false, error: 'Este documento no se le exige al recurso' };
    }

    fd.append('resource', kind === 'employee' ? 'empleado' : 'equipo');
    fd.append('appliesIds', JSON.stringify([resourceId]));
    if (policyNumber && kind === 'vehicle') fd.append('policyNumber', policyNumber);
    return await uploadMultiResourceDocument(fd);
  } catch (error) {
    if (error instanceof DocumentPermissionError) return { ok: false, error: error.message };
    logger.error('Error al subir el documento de una exigencia', {
      data: { error, input: { ...input, file: undefined } },
    });
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo subir el documento' };
  }
}
