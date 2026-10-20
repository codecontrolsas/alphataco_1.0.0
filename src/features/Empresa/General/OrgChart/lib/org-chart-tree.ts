import type { OrgChartCargo, OrgChartData, OrgChartSector } from '../actions.server';

/** Etiqueta de un legajo: los usuarios identifican al empleado por su legajo, no por el nombre. */
export function employeeLabel(employee: { file: string; lastname: string; firstname: string }): string {
  return `[${employee.file}] ${employee.lastname} ${employee.firstname}`;
}

export interface CargoNode {
  cargo: OrgChartCargo;
  /** Cargos del MISMO sector que le reportan. */
  children: CargoNode[];
  /** Superior que está en OTRO sector (se muestra como referencia, no como hijo). */
  outsideBoss: OrgChartCargo | null;
}

export interface SectorNode {
  sector: OrgChartSector;
  depth: number;
  children: SectorNode[];
  /** Cargos raíz del sector (sin superior, o con el superior en otro sector). */
  cargos: CargoNode[];
  cargoCount: number;
}

/**
 * Arma el árbol del organigrama. Un sector cuyo padre no está visible (inactivo y sin cargos) queda
 * como raíz. Los ciclos que pudieran existir en datos viejos se cortan: cada nodo se visita una vez.
 */
export function buildOrgChartTree({ sectors, cargos }: OrgChartData): SectorNode[] {
  const sectorIds = new Set(sectors.map((sector) => sector.id));
  const cargoById = new Map(cargos.map((cargo) => [cargo.id, cargo]));

  const cargosBySector = new Map<string, OrgChartCargo[]>();
  for (const cargo of cargos) {
    const list = cargosBySector.get(cargo.sector_id) ?? [];
    list.push(cargo);
    cargosBySector.set(cargo.sector_id, list);
  }

  function cargoTree(sectorId: string): CargoNode[] {
    const list = cargosBySector.get(sectorId) ?? [];
    const visited = new Set<string>();
    const build = (cargo: OrgChartCargo): CargoNode => {
      visited.add(cargo.id);
      const children = list
        .filter((child) => child.reports_to_id === cargo.id && !visited.has(child.id))
        .map(build);
      const boss = cargo.reports_to_id ? (cargoById.get(cargo.reports_to_id) ?? null) : null;
      return { cargo, children, outsideBoss: boss && boss.sector_id !== sectorId ? boss : null };
    };
    const isLocalRoot = (cargo: OrgChartCargo) => {
      const boss = cargo.reports_to_id ? cargoById.get(cargo.reports_to_id) : undefined;
      return !boss || boss.sector_id !== sectorId;
    };
    const roots = list.filter(isLocalRoot).map(build);
    // Lo que quedó sin visitar es un ciclo dentro del sector: se muestra como raíz para no perderlo.
    for (const cargo of list) if (!visited.has(cargo.id)) roots.push(build(cargo));
    return roots;
  }

  const visitedSectors = new Set<string>();
  function sectorTree(sector: OrgChartSector, depth: number): SectorNode {
    visitedSectors.add(sector.id);
    const children = sectors
      .filter((child) => child.parent_id === sector.id && !visitedSectors.has(child.id))
      .map((child) => sectorTree(child, depth + 1));
    return {
      sector,
      depth,
      children,
      cargos: cargoTree(sector.id),
      cargoCount: cargosBySector.get(sector.id)?.length ?? 0,
    };
  }

  const roots = sectors
    .filter((sector) => !sector.parent_id || !sectorIds.has(sector.parent_id))
    .map((sector) => sectorTree(sector, 0));
  for (const sector of sectors) if (!visitedSectors.has(sector.id)) roots.push(sectorTree(sector, 0));
  return roots;
}

/** Etiqueta de un cargo para combos y lecturas: "Sector · Puesto · titular". */
export function cargoLabel(cargo: OrgChartCargo, sectorName: string): string {
  const titular = cargo.employee ? employeeLabel(cargo.employee) : 'Vacante';
  return `${sectorName} · ${cargo.position.name} · ${titular}`;
}
