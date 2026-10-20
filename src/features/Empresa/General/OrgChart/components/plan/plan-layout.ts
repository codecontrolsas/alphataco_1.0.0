import type { Plan, Plane, Point3 } from '@/shared/components/iso/iso-kit';
import type { OrgChartCargo } from '../../actions.server';
import type { CargoNode, SectorNode } from '../../lib/org-chart-tree';

/**
 * Layout del plano: el organigrama como una maqueta sobre un banco escalonado.
 *
 * - Cada nivel de dependencia de sectores es un escalón; el sector raíz queda atrás y más alto.
 * - Cada sector es una bandeja sobre su escalón, con un encastre por cargo y una placa con el nombre.
 * - Los hermanos se reparten a lo ancho de la pantalla y los niveles bajan hacia el observador.
 *
 * Unidades de mundo (x, y en el piso, z arriba). El layout se piensa en (s, v): s a lo largo del
 * banco (eje x, que con azimut ~58° corre casi horizontal) y v hacia el observador (eje y, hacia
 * abajo a la izquierda). Banco y bandejas quedan alineados a los ejes, como cualquier pieza del kit.
 */

export const SOCKET = 34;
const TRAY_PAD = 10;
export const LABEL_D = 17;
const SIBLING_GAP = 18;
const LEVEL_GAP = 30;
export const STEP_H = 22;
const BENCH_MARGIN = 16;
export const TRAY_LIFT = 2.4;
export const TRAY_H = 6;

/** (s, v) → (x, y): s a lo largo del banco, v hacia el observador. */
export const worldOf = (s: number, v: number): Plane => [s, v];

export interface PlannedSocket {
  center: Plane;
  cargo: OrgChartCargo;
}

export interface PlannedTray {
  sectorId: string;
  name: string;
  inactive: boolean;
  level: number;
  /** Altura del escalón sobre el que apoya. */
  floorZ: number;
  plan: Plan;
  /** Placa del nombre, sobre el borde delantero (y máximo). */
  label: Plan;
  sockets: PlannedSocket[];
  /** Centro en (s, v), para las canaletas. */
  s: number;
  v: number;
  /** Media medida de la bandeja a lo largo de s (x) y de v (y). */
  halfS: number;
  halfV: number;
}

export interface PlannedStep {
  level: number;
  top: number;
  /** Rectángulo del escalón en (s, v) → anillo en (x, y). */
  ring: Plane[];
  vFrom: number;
  vTo: number;
}

export interface PlannedConduit {
  parentId: string;
  childIds: string[];
  /** Tramo del padre: del frente de su bandeja al canto de su escalón y riser abajo. */
  trunk: Point3[];
  /** Bus sobre el escalón de abajo, de punta a punta de los hijos. */
  bus: Point3[];
  /** Bajada a cada hijo, del bus a la esquina trasera de su bandeja. */
  drops: Array<{ childId: string; points: Point3[] }>;
}

export interface PlannedBench {
  trays: PlannedTray[];
  steps: PlannedStep[];
  conduits: PlannedConduit[];
  base: Plane[];
  sMin: number;
  sMax: number;
  vMin: number;
  vMax: number;
  topZ: number;
}

/** Cargos del sector en recorrido en profundidad: el superior primero, sus subordinados después. */
function cargosInOrder(nodes: CargoNode[]): OrgChartCargo[] {
  const out: OrgChartCargo[] = [];
  const walk = (node: CargoNode) => {
    out.push(node.cargo);
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

function traySize(count: number) {
  const side = Math.max(1, Math.ceil(Math.sqrt(count)));
  const w = Math.max(side * SOCKET + TRAY_PAD * 2, 92);
  const d = side * SOCKET + TRAY_PAD + LABEL_D + 4;
  return { side, w, d, halfS: w / 2, halfV: d / 2 };
}

export function planBench(roots: SectorNode[]): PlannedBench {
  // 1. Ancho de cada subárbol a lo largo de s.
  const widthOf = new Map<string, number>();
  const measure = (node: SectorNode): number => {
    const own = traySize(node.cargoCount).halfS * 2;
    const kids = node.children.reduce((sum, child) => sum + measure(child), 0) + SIBLING_GAP * Math.max(0, node.children.length - 1);
    const width = Math.max(own, kids);
    widthOf.set(node.sector.id, width);
    return width;
  };
  const total = roots.reduce((sum, root) => sum + measure(root), 0) + SIBLING_GAP * Math.max(0, roots.length - 1);

  // 2. Profundidad de cada nivel a lo largo de v (la bandeja más grande del nivel manda).
  const levelDepth: number[] = [];
  const collect = (node: SectorNode) => {
    const size = traySize(node.cargoCount).halfV * 2;
    levelDepth[node.depth] = Math.max(levelDepth[node.depth] ?? 0, size);
    node.children.forEach(collect);
  };
  roots.forEach(collect);
  const levels = levelDepth.length;
  const levelStart: number[] = [];
  let cursor = 0;
  for (let level = 0; level < levels; level += 1) {
    levelStart[level] = cursor;
    cursor += levelDepth[level] + LEVEL_GAP;
  }
  const vMax = cursor - LEVEL_GAP + BENCH_MARGIN / 2;
  const stepTop = (level: number) => (levels - level) * STEP_H;

  // 3. Bandejas: el padre centrado sobre el tramo de sus hijos.
  const trays: PlannedTray[] = [];
  const trayById = new Map<string, PlannedTray>();
  const place = (node: SectorNode, sFrom: number) => {
    const width = widthOf.get(node.sector.id) ?? 0;
    let childCursor = sFrom + (width - (node.children.reduce((sum, c) => sum + (widthOf.get(c.sector.id) ?? 0), 0) + SIBLING_GAP * Math.max(0, node.children.length - 1))) / 2;
    for (const child of node.children) {
      place(child, childCursor);
      childCursor += (widthOf.get(child.sector.id) ?? 0) + SIBLING_GAP;
    }

    const { side, w, d, halfS, halfV } = traySize(node.cargoCount);
    const s = sFrom + width / 2;
    const v = levelStart[node.depth] + levelDepth[node.depth] / 2;
    const [cx, cy] = worldOf(s, v);
    const plan: Plan = { x: cx - w / 2, y: cy - d / 2, w, d, r: 3 };
    const cargos = cargosInOrder(node.cargos);
    const sockets = cargos.map((cargo, index) => {
      const column = index % side;
      const row = Math.floor(index / side);
      const gridLeft = plan.x + (w - side * SOCKET) / 2;
      return {
        cargo,
        center: [gridLeft + SOCKET * (column + 0.5), plan.y + TRAY_PAD + SOCKET * (row + 0.5)] as Plane,
      };
    });
    const tray: PlannedTray = {
      sectorId: node.sector.id,
      name: node.sector.name,
      inactive: node.sector.is_active === false,
      level: node.depth,
      floorZ: stepTop(node.depth),
      plan,
      label: { x: plan.x + 5, y: plan.y + d - LABEL_D - 2, w: w - 10, d: LABEL_D - 3, r: 1 },
      sockets,
      s,
      v,
      halfS,
      halfV,
    };
    trays.push(tray);
    trayById.set(node.sector.id, tray);
  };
  let rootCursor = -total / 2;
  for (const root of roots) {
    place(root, rootCursor);
    rootCursor += (widthOf.get(root.sector.id) ?? 0) + SIBLING_GAP;
  }

  const sMin = -total / 2 - BENCH_MARGIN;
  const sMax = total / 2 + BENCH_MARGIN;
  const vMin = -BENCH_MARGIN / 2;
  const rect = (s0: number, s1: number, v0: number, v1: number): Plane[] => [
    worldOf(s0, v0),
    worldOf(s1, v0),
    worldOf(s1, v1),
    worldOf(s0, v1),
  ];

  // 4. Escalones: cada uno cubre su nivel; el de atrás es el más alto.
  const steps: PlannedStep[] = [];
  for (let level = 0; level < levels; level += 1) {
    const vFrom = level === 0 ? vMin : levelStart[level] - LEVEL_GAP / 2;
    const vTo = level === levels - 1 ? vMax : levelStart[level + 1] - LEVEL_GAP / 2;
    steps.push({ level, top: stepTop(level), ring: rect(sMin, sMax, vFrom, vTo), vFrom, vTo });
  }

  // 5. Canaletas de dependencia: frente del padre → canto del escalón → riser → bus → hijos.
  const conduits: PlannedConduit[] = [];
  const wire = (node: SectorNode) => {
    const parent = trayById.get(node.sector.id);
    const children = node.children.map((child) => trayById.get(child.sector.id)).filter((t): t is PlannedTray => !!t);
    if (parent && children.length > 0) {
      const edge = steps[parent.level].vTo;
      const upper = parent.floorZ;
      const lower = steps[parent.level + 1]?.top ?? 0;
      const busV = edge + 6;
      const trunk: Point3[] = [
        [...worldOf(parent.s, parent.v + parent.halfV), upper] as Point3,
        [...worldOf(parent.s, edge), upper] as Point3,
        [...worldOf(parent.s, edge), lower] as Point3,
        [...worldOf(parent.s, busV), lower] as Point3,
      ];
      const sValues = [parent.s, ...children.map((child) => child.s)];
      const bus: Point3[] = [
        [...worldOf(Math.min(...sValues), busV), lower] as Point3,
        [...worldOf(Math.max(...sValues), busV), lower] as Point3,
      ];
      const drops = children.map((child) => ({
        childId: child.sectorId,
        points: [
          [...worldOf(child.s, busV), lower] as Point3,
          [...worldOf(child.s, child.v - child.halfV), lower] as Point3,
        ],
      }));
      conduits.push({ parentId: parent.sectorId, childIds: children.map((c) => c.sectorId), trunk, bus, drops });
    }
    node.children.forEach(wire);
  };
  roots.forEach(wire);

  return {
    trays,
    steps,
    conduits,
    base: rect(sMin - 8, sMax + 8, vMin - 8, vMax + 8),
    sMin,
    sMax,
    vMin,
    vMax,
    topZ: stepTop(0),
  };
}
