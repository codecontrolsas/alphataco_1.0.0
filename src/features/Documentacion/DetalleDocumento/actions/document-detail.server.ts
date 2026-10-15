'use server';

import { hasDocTypePermission } from '@/features/Documentacion/TiposDocumentos/lib/document-type-permissions';
import {
  getDocumentCompanyById,
  getDocumentEmployeesById,
  getDocumentEquipmentById,
} from '@/features/Documentacion/shared/actions/document-actions';
import { DOCUMENT_FILES_BUCKET, storagePublicUrl } from '@/shared/lib/storage';
import type { ComplianceKind } from '../../shared/compliance/types';
import { getDocumentDerivedView, type DocumentDerivedView } from '../lib/document-derived-view.server';
import { resolveResourceKind } from '../lib/document-detail';

/**
 * Carga del detalle de un documento por id.
 *
 * Perímetro: las tres lecturas de `document-actions` ya acotan el documento a la empresa activa
 * (por `employees.company_id`, `vehicles.company_id` y `documents_company.applies`), así que un id
 * de otra empresa no devuelve nada. Acá sólo se decide en qué tabla buscar y se resuelve la URL
 * del archivo, que NO se expone como acción propia para que nadie pueda pedir la URL de un path
 * arbitrario.
 */

type EmployeeDocument = Awaited<ReturnType<typeof getDocumentEmployeesById>>[number];
type EquipmentDocument = Awaited<ReturnType<typeof getDocumentEquipmentById>>[number];
type CompanyDocument = Awaited<ReturnType<typeof getDocumentCompanyById>>[number];

/** Documento encontrado, discriminado por el recurso al que pertenece. */
export type DocumentDetail =
  | { resource: 'employee'; document: EmployeeDocument }
  | { resource: 'vehicle'; document: EquipmentDocument }
  | { resource: 'company'; document: CompanyDocument };

/** Empresa resuelta del documento (misma forma para la empresa dueña y la que solicita). */
export type DocumentCompanyInfo = CompanyDocument['company'];
/** Empleado al que aplica el documento, con ciudad, provincia, afectaciones y empresa resueltas. */
export type DocumentEmployee = NonNullable<EmployeeDocument['applies']>;
/** Equipo al que aplica el documento, con marca, modelo, tipo y empresa resueltos. */
export type DocumentVehicle = NonNullable<EquipmentDocument['applies']>;
/** Tipo de documento (`document_types`) tal como lo traen las tres lecturas. */
export type DocumentTypeInfo = NonNullable<CompanyDocument['document_types']>;

export type DocumentDetailResult = DocumentDetail & {
  /** URL pública del archivo en el bucket de documentos (cadena vacía si todavía no hay archivo). */
  fileUrl: string;
  /** Estado derivado por el motor ("vencido" por fecha) y "Ya no aplica" según la aplicabilidad actual. */
  derived: DocumentDerivedView;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Recurso del motor y su id: el empleado, el equipo o, para la empresa, la empresa activa. */
function derivedTarget(detail: DocumentDetail): { kind: ComplianceKind; resourceId: string | null } {
  if (detail.resource === 'employee') return { kind: 'Persona', resourceId: detail.document.applies?.id ?? null };
  if (detail.resource === 'vehicle') return { kind: 'Equipos', resourceId: detail.document.applies?.id ?? null };
  return { kind: 'Empresa', resourceId: detail.document.applies };
}

/**
 * Detalle del documento `id`. `resourceParam` es el `?resource=` de la URL; si falta o no se
 * reconoce, se busca en las tres tablas y gana la primera que devuelva una fila (mismo orden que
 * tenía la página: empleado → equipo → empresa).
 */
export async function getDocumentDetail(id: string, resourceParam?: string): Promise<DocumentDetailResult | null> {
  // Un id de fila faltante (`missing:...`) o cualquier id que no sea un UUID no es un documento real.
  if (!UUID_PATTERN.test(id)) return null;
  const kind = resolveResourceKind(resourceParam);

  let detail: DocumentDetail | null = null;

  if (kind === 'employee') {
    const [document] = await getDocumentEmployeesById(id);
    detail = document ? { resource: 'employee', document } : null;
  } else if (kind === 'vehicle') {
    const [document] = await getDocumentEquipmentById(id);
    detail = document ? { resource: 'vehicle', document } : null;
  } else if (kind === 'company') {
    const [document] = await getDocumentCompanyById(id);
    detail = document ? { resource: 'company', document } : null;
  } else {
    const [employeeRows, equipmentRows, companyRows] = await Promise.all([
      getDocumentEmployeesById(id),
      getDocumentEquipmentById(id),
      getDocumentCompanyById(id),
    ]);
    if (employeeRows[0]) detail = { resource: 'employee', document: employeeRows[0] };
    else if (equipmentRows[0]) detail = { resource: 'vehicle', document: equipmentRows[0] };
    else if (companyRows[0]) detail = { resource: 'company', document: companyRows[0] };
  }

  if (!detail) return null;

  // Una fila vacía legacy (sin archivo) no es un documento: para el motor el recurso tiene un faltante.
  const documentPath = detail.document.document_path ?? '';
  if (!documentPath.trim()) return null;

  // Tipo privado: solo lo ve quien tiene `view_private` en la tab de tipos de su alcance (se responde como "no existe").
  const docType = detail.document.document_types;
  if (docType?.private && !(await hasDocTypePermission(docType.applies, 'view_private'))) return null;

  const { kind: derivedKind, resourceId } = derivedTarget(detail);
  const [fileUrl, derived] = await Promise.all([
    storagePublicUrl(DOCUMENT_FILES_BUCKET, documentPath),
    resourceId ? getDocumentDerivedView(derivedKind, resourceId, id) : Promise.resolve(null),
  ]);
  if (!derived) return null;
  return { ...detail, fileUrl, derived };
}
