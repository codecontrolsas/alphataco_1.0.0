/**
 * Política de acceso a los catálogos de Equipos sin RLS (módulo puro, testeado).
 *
 * `type`, `sub_type`, `brand_vehicles` y `equipment_owners` son catálogos POR EMPRESA (`company_id`
 * obligatorio): cada empresa tiene los suyos, no hay filas globales ni compartidas.
 *
 * - Lectura y escritura: sólo propias.
 * - De otra empresa: no existen (`not_found`, sin revelar que existen).
 *
 * Mismo criterio que `Documentacion/TiposDocumentos/lib/document-type-policy.ts`.
 *
 * Los catálogos con `company_id` NOT NULL (`model_vehicles`, `type_hitch_types`) NO usan este
 * módulo: van con `withCompany` a secas.
 */
export type CatalogAccessMode = 'read' | 'write';
export type CatalogAccess = 'ok' | 'not_found';

/** `where` de lectura: sólo propios. */
export function catalogReadScope(companyId: string): { company_id: string } {
  return { company_id: companyId };
}

/** `where` de escritura: sólo propios. */
export function catalogWriteScope(companyId: string): { company_id: string } {
  return { company_id: companyId };
}

/** Decide el acceso a una fila (o a su ausencia) según el modo. */
export function resolveCatalogAccess(
  row: { company_id: string | null } | null | undefined,
  companyId: string,
  mode: CatalogAccessMode
): CatalogAccess {
  if (!row) return 'not_found';
  if (row.company_id === companyId) return 'ok';
  return 'not_found';
}

/** Traduce el resultado de `resolveCatalogAccess` al mensaje de error del usuario. */
export function catalogAccessError(access: CatalogAccess, notFoundMessage: string): string | null {
  if (access === 'ok') return null;
  return notFoundMessage;
}
