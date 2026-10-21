/**
 * Perímetro por empresa del árbol CCT sin RLS (módulo puro, testeado).
 *
 * - `guild.company_id` es **nullable**: los sindicatos globales (`company_id IS NULL`) los ven
 *   todas las empresas y cada una puede colgarles convenios **propios**, pero ninguna edita el
 *   sindicato en sí. Lectura = propios + globales; escritura del sindicato = sólo propios.
 * - `covenant.company_id` es **NOT NULL**: un convenio siempre pertenece a una empresa. Como un
 *   sindicato global es compartido, **toda lectura que baje por la relación `guild.covenant`
 *   tiene que filtrarla con `covenantScope`**: si no, de un sindicato global cuelgan los
 *   convenios de las demás empresas.
 * - `category` **no tiene** `company_id`: su pertenencia se deriva del convenio padre, así que
 *   toda lectura/escritura de categorías pasa primero por acotar el convenio.
 *
 * Mismo criterio que `Documentacion/TiposDocumentos/lib/document-type-policy.ts`.
 */
/** `where` de lectura de sindicatos: sólo propios (cada empresa tiene los suyos). */
export function guildReadScope(companyId: string): { company_id: string } {
  return { company_id: companyId };
}

/** `where`/`data` de escritura de sindicatos: sólo propios. */
export function guildWriteScope(companyId: string): { company_id: string } {
  return { company_id: companyId };
}

/**
 * `where` de convenios: `covenant.company_id` es NOT NULL, no hay convenios globales.
 * Se usa tanto en la query raíz como en el `where` de la relación `guild.covenant`.
 */
export function covenantScope(companyId: string): { company_id: string } {
  return { company_id: companyId };
}
