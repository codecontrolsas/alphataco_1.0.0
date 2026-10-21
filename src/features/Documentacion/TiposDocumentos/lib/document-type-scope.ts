import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import {
  documentTypeReadScope,
  documentTypeWriteScope,
  resolveDocumentTypeAccess,
  type DocumentTypeAccessMode,
} from './document-type-policy';

/**
 * Perímetro de `document_types` sin RLS (política en `document-type-policy.ts`).
 *
 * - `documentTypeReadScope` (sólo propios): listados, facets, edición en lectura, subida.
 * - `documentTypeWriteScope` (sólo propios): create/update/deactivate/reactivate/hardDelete e
 *   `analyzeDocumentTypeImpact`. Cada empresa tiene sus tipos: no hay tipos globales.
 * - Además, todo `documents_employees`/`documents_equipment` que una mutación toque se acota por
 *   relación (`employees`/`vehicles.company_id`), aunque el tipo sea propio (defensa en profundidad).
 */
export { documentTypeReadScope, documentTypeWriteScope };

/** Compatibilidad: alias del scope de LECTURA. */
export const documentTypeCompanyScope = documentTypeReadScope;

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * Busca un tipo de documento por id según el modo:
 * - `read` (default): globales + propios;
 * - `write`: sólo propios.
 * Lanza `Tipo de documento no encontrado` si no existe, es de otra empresa o no cumple `extraWhere`.
 */
export async function findScopedDocumentType<S extends Prisma.document_typesSelect>(
  client: Client,
  id: string,
  companyId: string,
  select: S,
  extraWhere: Prisma.document_typesWhereInput = {},
  mode: DocumentTypeAccessMode = 'read'
) {
  const where = { id, AND: [documentTypeReadScope(companyId), extraWhere] };
  // Primero la política (sólo `company_id`), después el select pedido: así el genérico `S` no se mezcla.
  const owner = await client.document_types.findFirst({ where, select: { company_id: true } });
  const access = resolveDocumentTypeAccess(owner, companyId, mode);
  if (access === 'not_found') throw new Error('Tipo de documento no encontrado');
  const row = await client.document_types.findFirst({ where, select });
  if (!row) throw new Error('Tipo de documento no encontrado');
  return row;
}
