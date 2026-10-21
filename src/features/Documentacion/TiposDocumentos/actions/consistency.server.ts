'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { arCurrentPeriod, arToday } from '../../shared/compliance';
import { loadComplianceDataset } from '../../shared/compliance/server/dataset.server';
import { assertDocTypeIdPermission } from '../lib/document-type-permissions';
import { findScopedDocumentType } from '../lib/document-type-scope';
import { computeTypeCoverage } from '../lib/type-coverage';

const logger = new Logger('features/TiposDocumentos/consistency');

// ============================================================================
// DIAGNÓSTICO DE UN TIPO DE DOCUMENTO (sólo lectura)
// ============================================================================

/** Máximo de recursos que se listan por grupo (el total real viaja en `stats`). */
const MAX_LISTED_RESOURCES = 200;

export interface TypeDiagnosticStats {
  /** Recursos evaluados (todos los de la empresa para ese tipo de recurso, activos y de baja). */
  totalResources: number;
  /** Recursos a los que el tipo les aplica hoy. */
  applicable: number;
  /** De los que aplica, los que ya tienen el documento cargado. */
  withDocument: number;
  /** De los que aplica, los que no tienen documento (sólo cuenta si el tipo es obligatorio). */
  missing: number;
  /** Recursos que conservan un documento de este tipo pero a los que ya no les aplica. */
  notApplicableWithDocument: number;
}

export interface EmployeeDiagnosticResource {
  id: string;
  firstname: string;
  lastname: string;
  file_number: string | null;
}

export interface EquipmentDiagnosticResource {
  id: string;
  domain: string | null;
  intern_number: string | null;
  brand: string | null;
  type: string | null;
}

export type TypeDiagnostic =
  | {
      applies: 'Persona';
      mandatory: boolean;
      stats: TypeDiagnosticStats;
      missing: EmployeeDiagnosticResource[];
      notApplicable: EmployeeDiagnosticResource[];
    }
  | {
      applies: 'Equipos';
      mandatory: boolean;
      stats: TypeDiagnosticStats;
      missing: EquipmentDiagnosticResource[];
      notApplicable: EquipmentDiagnosticResource[];
    };

async function loadEmployees(ids: string[], companyId: string): Promise<EmployeeDiagnosticResource[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.employees.findMany({
    where: { id: { in: ids }, company_id: companyId },
    select: { id: true, firstname: true, lastname: true, file: true },
    orderBy: { lastname: 'asc' },
  });
  return rows.map((e) => ({
    id: e.id,
    firstname: e.firstname ?? '',
    lastname: e.lastname ?? '',
    file_number: e.file ?? null,
  }));
}

async function loadVehicles(ids: string[], companyId: string): Promise<EquipmentDiagnosticResource[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.vehicles.findMany({
    where: { id: { in: ids }, company_id: companyId },
    select: {
      id: true,
      domain: true,
      intern_number: true,
      brand_vehicles: { select: { name: true } },
      types_of_vehicles: { select: { name: true } },
    },
    orderBy: { domain: 'asc' },
  });
  return rows.map((v) => ({
    id: v.id,
    domain: v.domain ?? null,
    intern_number: v.intern_number ?? null,
    brand: v.brand_vehicles?.name ?? null,
    type: v.types_of_vehicles?.name ?? null,
  }));
}

/**
 * Diagnóstico de un tipo, calculado con el motor de cumplimiento y SIN escribir nada: a cuántos
 * recursos aplica, cuántos ya tienen el documento, cuántos faltan y cuántos documentos "ya no
 * aplican". Ya no existen filas pendientes que corregir; lo que falta se resuelve subiendo el documento.
 */
export async function verifyDocumentTypeConsistency(documentTypeId: string): Promise<TypeDiagnostic> {
  const companyId = await getActiveCompanyId();

  logger.debug('Diagnosticando tipo de documento', { data: { documentTypeId } });

  try {
    await assertDocTypeIdPermission(documentTypeId, companyId, 'view');
    // Perímetro: tipo global o de la empresa activa.
    const docType = await findScopedDocumentType(prisma, documentTypeId, companyId, { id: true, applies: true });
    if (docType.applies !== 'Persona' && docType.applies !== 'Equipos') {
      throw new Error('Los tipos de documento de empresa no se diagnostican');
    }
    const kind = docType.applies;

    const dataset = await loadComplianceDataset(prisma, { companyId, kind });
    const type = dataset.types.find((t) => t.id === documentTypeId);
    if (!type) throw new Error('Tipo de documento no encontrado');

    const now = new Date();
    const coverage = computeTypeCoverage(type, dataset.resources, dataset.docsByResource, {
      today: arToday(now),
      period: arCurrentPeriod(now),
    });

    const stats: TypeDiagnosticStats = {
      totalResources: coverage.totalResources,
      applicable: coverage.applicableIds.length,
      withDocument: coverage.withDocumentIds.length,
      missing: coverage.missingIds.length,
      notApplicableWithDocument: coverage.notApplicableWithDocumentIds.length,
    };
    const missingIds = coverage.missingIds.slice(0, MAX_LISTED_RESOURCES);
    const notApplicableIds = coverage.notApplicableWithDocumentIds.slice(0, MAX_LISTED_RESOURCES);

    if (kind === 'Persona') {
      const [missing, notApplicable] = await Promise.all([
        loadEmployees(missingIds, companyId),
        loadEmployees(notApplicableIds, companyId),
      ]);
      return { applies: 'Persona', mandatory: type.mandatory, stats, missing, notApplicable };
    }
    const [missing, notApplicable] = await Promise.all([
      loadVehicles(missingIds, companyId),
      loadVehicles(notApplicableIds, companyId),
    ]);
    return { applies: 'Equipos', mandatory: type.mandatory, stats, missing, notApplicable };
  } catch (error) {
    logger.error('Error al diagnosticar tipo de documento', { data: { error, documentTypeId } });
    throw error;
  }
}

// ============================================================================
// IMPACTO (activar / desactivar / eliminar)
// ============================================================================

/**
 * Analiza el impacto de activar/desactivar/eliminar un tipo de documento.
 * Modelo derivado: sólo existen filas con archivo, así que alcanza con contar los documentos
 * cargados. Borrar el tipo cascadea esos documentos, por eso sólo se permite sin ninguno.
 */
export async function analyzeDocumentTypeImpact(docTypeId: string) {
  const companyId = await getActiveCompanyId();

  logger.debug('Analizando impacto de tipo de documento', { data: { docTypeId } });

  try {
    await assertDocTypeIdPermission(docTypeId, companyId, 'view');
    // Perímetro de escritura: el impacto se analiza para mutar.
    const docType = await findScopedDocumentType(
      prisma,
      docTypeId,
      companyId,
      { id: true, name: true, applies: true, is_active: true, mandatory: true, special: true },
      {},
      'write'
    );

    // Conteo acotado a recursos de la empresa activa (relación employees/vehicles).
    const withFile = { id_document_types: docTypeId, document_path: { not: null } };
    let uploadedCount = 0;
    if (docType.applies === 'Persona') {
      uploadedCount = await prisma.documents_employees.count({
        where: { ...withFile, employees: { company_id: companyId } },
      });
    } else if (docType.applies === 'Equipos') {
      uploadedCount = await prisma.documents_equipment.count({
        where: { ...withFile, vehicles: { company_id: companyId } },
      });
    } else {
      uploadedCount = await prisma.documents_company.count({ where: { ...withFile, applies: companyId } });
    }

    return {
      docType: {
        id: docType.id,
        name: docType.name,
        applies: docType.applies,
        is_active: docType.is_active,
        mandatory: docType.mandatory,
        special: docType.special,
      },
      uploadedCount,
      canHardDelete: uploadedCount === 0,
    };
  } catch (error) {
    logger.error('Error al analizar impacto de tipo de documento', { data: { error, docTypeId } });
    throw error;
  }
}
