/**
 * Política de acceso a `document_types` sin RLS (módulo puro, testeado).
 *
 * Cada empresa tiene SUS tipos de documento (`company_id` obligatorio): no hay tipos globales ni compartidos.
 * - **Propios** (`company_id = empresa activa`): lectura y escritura completas.
 * - **De otra empresa**: no existen para la empresa activa (`not_found`, sin revelar que existen).
 */
export type DocumentTypeAccessMode = 'read' | 'write';
export type DocumentTypeAccess = 'ok' | 'not_found';

/** `where` de lectura: sólo propios. */
export function documentTypeReadScope(companyId: string): { company_id: string } {
  return { company_id: companyId };
}

/** `where` de escritura: sólo propios. */
export function documentTypeWriteScope(companyId: string): { company_id: string } {
  return { company_id: companyId };
}

/** Decide el acceso a una fila (o a su ausencia) según el modo. */
export function resolveDocumentTypeAccess(
  row: { company_id: string | null } | null,
  companyId: string,
  mode: DocumentTypeAccessMode
): DocumentTypeAccess {
  if (!row) return 'not_found';
  if (row.company_id === companyId) return 'ok';
  return 'not_found';
}
