/**
 * Reglas puras del organigrama: sin Prisma ni directivas, para poder usarlas en el servidor
 * (validación de las mutaciones) y en el cliente (opciones de los combos y avisos).
 */

/**
 * `true` si colgar `nodeId` de `newParentId` crearía un ciclo: el padre propuesto es el mismo nodo
 * o uno de sus descendientes. Sirve igual para "sector depende de" y para "cargo reporta a".
 *
 * @param parentOf padre actual de cada nodo (los que no figuran son raíz)
 */
export function wouldCreateCycle(
  parentOf: ReadonlyMap<string, string | null>,
  nodeId: string,
  newParentId: string | null
): boolean {
  const seen = new Set<string>();
  let current = newParentId;
  while (current) {
    if (current === nodeId) return true;
    // Un ciclo que ya existiera en los datos no debe colgar el recorrido.
    if (seen.has(current)) return true;
    seen.add(current);
    current = parentOf.get(current) ?? null;
  }
  return false;
}

/** Ids de `nodeId` y de todos sus descendientes (para excluirlos de las opciones de padre). */
export function descendantsOf(parentOf: ReadonlyMap<string, string | null>, nodeId: string): Set<string> {
  const result = new Set<string>([nodeId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [id, parent] of parentOf) {
      if (parent && result.has(parent) && !result.has(id)) {
        result.add(id);
        grew = true;
      }
    }
  }
  return result;
}

export type OrgChartIssue =
  | 'sector_inactive'
  | 'position_inactive'
  | 'position_not_in_sector'
  | 'titular_inactive'
  | 'titular_mismatch';

export const ORG_CHART_ISSUE_LABELS: Record<OrgChartIssue, string> = {
  sector_inactive: 'El sector está inactivo',
  position_inactive: 'El puesto está inactivo',
  position_not_in_sector: 'El puesto ya no pertenece a este sector',
  titular_inactive: 'El titular está dado de baja',
  titular_mismatch: 'El titular ya no tiene este sector y puesto en su legajo',
};

interface CargoForIssues {
  sector_id: string;
  position_id: string;
  sector: { is_active: boolean | null };
  position: { is_active: boolean | null; hierarchical_position_id: string[] };
  employee: {
    is_active: boolean | null;
    hierarchical_position: string | null;
    company_position: string | null;
  } | null;
}

/**
 * Problemas de un cargo que se detectan al leerlo. No se corrigen solos: el organigrama solo lee el
 * legajo y la configuración de puestos, y estos avisos muestran lo que quedó desfasado (baja del
 * titular, cambio de puesto, sector o puesto desactivado, puesto quitado del sector).
 */
export function issuesOfCargo(cargo: CargoForIssues): OrgChartIssue[] {
  const issues: OrgChartIssue[] = [];
  if (cargo.sector.is_active === false) issues.push('sector_inactive');
  if (cargo.position.is_active === false) issues.push('position_inactive');
  if (!cargo.position.hierarchical_position_id.includes(cargo.sector_id)) issues.push('position_not_in_sector');
  if (cargo.employee) {
    if (cargo.employee.is_active === false) issues.push('titular_inactive');
    else if (
      cargo.employee.hierarchical_position !== cargo.sector_id ||
      cargo.employee.company_position !== cargo.position_id
    ) {
      issues.push('titular_mismatch');
    }
  }
  return issues;
}
