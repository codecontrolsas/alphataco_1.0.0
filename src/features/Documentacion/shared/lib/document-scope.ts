import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';

/**
 * Perímetro de los documentos sin RLS: toda lectura/escritura por id o por `document_path`
 * se acota a la empresa activa a través del recurso (`employees.company_id`,
 * `vehicles.company_id`, `documents_company.applies`).
 */

/** Recurso al que pertenece un documento, tal como lo nombran las páginas de detalle. */
export type DocumentResourceKind = 'employee' | 'vehicle' | 'company';

export function isDocumentResourceKind(value: unknown): value is DocumentResourceKind {
  return value === 'employee' || value === 'vehicle' || value === 'company';
}

type Client = Prisma.TransactionClient | typeof prisma;

/** Fila mínima común a las tres tablas de documentos. */
export interface ScopedDocumentRow {
  id: string;
  document_path: string | null;
  id_document_types: string | null;
  state: 'presentado' | 'rechazado' | 'aprobado' | 'vencido' | 'pendiente' | null;
  /** Vencimiento como `Date` (empleados/equipos) o texto ISO (empresa); null si no vence. */
  validity: Date | string | null;
  /** El tipo de documento es privado (requiere `view_private` para verlo). */
  private: boolean;
}

/** Documento por id dentro de la empresa activa, o null. */
export async function findScopedDocument(
  client: Client,
  kind: DocumentResourceKind,
  id: string,
  companyId: string
): Promise<ScopedDocumentRow | null> {
  const select = {
    id: true,
    document_path: true,
    id_document_types: true,
    state: true,
    validity: true,
    document_types: { select: { private: true } },
  } as const;
  const row = await (async () => {
    switch (kind) {
      case 'employee':
        return client.documents_employees.findFirst({ where: { id, employees: { company_id: companyId } }, select });
      case 'vehicle':
        return client.documents_equipment.findFirst({ where: { id, vehicles: { company_id: companyId } }, select });
      case 'company':
        return client.documents_company.findFirst({ where: { id, applies: companyId }, select });
    }
  })();
  if (!row) return null;
  const { document_types, ...rest } = row;
  return { ...rest, private: document_types?.private === true };
}

/** `true` si la fila está aprobada y su vencimiento (si tiene) todavía no pasó: no se debe modificar. */
export function isApprovedAndCurrent(
  doc: Pick<ScopedDocumentRow, 'state' | 'validity'>,
  today: Date = new Date()
): boolean {
  if (doc.state !== 'aprobado') return false;
  if (!doc.validity) return true;
  const validity = doc.validity instanceof Date ? doc.validity : new Date(doc.validity);
  if (Number.isNaN(validity.getTime())) return true;
  return validity.getTime() >= today.getTime();
}

/**
 * Cantidad de filas (de las 3 tablas de documentos) que referencian `path`, sin contar los ids
 * indicados. Sirve para no borrar del storage un archivo compartido por documentos multirecurso.
 */
export async function countOtherPathReferences(
  client: Client,
  path: string,
  excludeIds: string[] = []
): Promise<number> {
  const where = { document_path: path, ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}) };
  const [employees, vehicles, company] = await Promise.all([
    client.documents_employees.count({ where }),
    client.documents_equipment.count({ where }),
    client.documents_company.count({ where }),
  ]);
  return employees + vehicles + company;
}

/**
 * Paths descargables por el usuario: pertenecen a la empresa activa y, si el tipo es privado, el
 * usuario tiene `view_private` del recurso correspondiente. Un path compartido entre varias filas
 * se sirve si alguna de ellas es accesible.
 */
export async function filterDownloadablePaths(
  client: Client,
  paths: string[],
  companyId: string,
  canViewPrivate: Record<DocumentResourceKind, boolean>
): Promise<Set<string>> {
  const unique = [...new Set(paths.filter((p) => p.length > 0))];
  if (unique.length === 0) return new Set();
  const where = { document_path: { in: unique } };
  const select = { document_path: true, document_types: { select: { private: true } } } as const;
  const [employees, vehicles, company] = await Promise.all([
    client.documents_employees.findMany({ where: { ...where, employees: { company_id: companyId } }, select }),
    client.documents_equipment.findMany({ where: { ...where, vehicles: { company_id: companyId } }, select }),
    client.documents_company.findMany({ where: { ...where, applies: companyId }, select }),
  ]);
  const allowed = new Set<string>();
  const collect = (rows: typeof employees, kind: DocumentResourceKind) => {
    for (const row of rows) {
      if (!row.document_path) continue;
      if (row.document_types?.private !== true || canViewPrivate[kind]) allowed.add(row.document_path);
    }
  };
  collect(employees, 'employee');
  collect(vehicles, 'vehicle');
  collect(company, 'company');
  return allowed;
}
