import * as k from '@/shared/components/iso/iso-kit.ts';

/**
 * Plano isométrico del taller: geometría pura (datos → string SVG), sin React.
 *
 * Una bahía por sector. Dentro de cada bahía hay una pieza por orden de trabajo (OT) abierta:
 *  - en curso    → vehículo con tapa verde  (OT `in_progress`)
 *  - pausada     → vehículo con tapa roja   (OT `paused`, trabada)
 *  - pendiente   → vehículo con tapa ámbar  (OT `pending`, todavía no entró al taller)
 *  - sin OT      → silueta punteada         (tarea asignada al sector que aún no tiene OT: "queda en la nada")
 * El poste de la bahía lleva un semáforo de cupo (verde / ámbar / rojo; apagado si no hay cupo configurado).
 *
 * Coordenadas de mundo: x, y en el suelo, z hacia arriba. El espectador mira desde +x +y.
 */

export interface WorkshopPlanSector {
  id: string;
  name: string;
  maxCapacity: number | null;
  occupiedSlots: number;
  isOverCapacity: boolean;
  /** OT abiertas por estado (`pending` | `in_progress` | `paused`). */
  statusCounts: Record<string, number>;
  /** Tareas asignadas al sector que todavía no tienen OT. */
  unassignedTaskCount: number;
}

export type PlanPieceKind = 'active' | 'paused' | 'pending' | 'unassigned';

export interface PlanCounts {
  active: number;
  paused: number;
  pending: number;
  unassigned: number;
}

export function countsOf(sector: WorkshopPlanSector): PlanCounts {
  return {
    active: sector.statusCounts.in_progress ?? 0,
    paused: sector.statusCounts.paused ?? 0,
    pending: sector.statusCounts.pending ?? 0,
    unassigned: sector.unassignedTaskCount,
  };
}

/** Texto accesible de una bahía (lo usa también la leyenda y la lista). */
export function describePlanSector(sector: WorkshopPlanSector): string {
  const c = countsOf(sector);
  const parts = [`${c.active} en curso`, `${c.pending} pendientes de ingreso`];
  if (c.paused > 0) parts.push(`${c.paused} pausadas`);
  if (c.unassigned > 0) parts.push(`${c.unassigned} sin OT`);
  return `Sector ${sector.name}: ${parts.join(', ')}`;
}

/** Variable de tema de cada tipo de pieza (nunca hex). */
export const PIECE_COLOR: Record<PlanPieceKind, string> = {
  active: 'var(--status-ok)',
  paused: 'var(--status-danger)',
  pending: 'var(--status-warn)',
  unassigned: 'var(--status-warn)',
};

const BAY_W = 150;
const BAY_D = 116;
const GAP = 26;
const WIDTH = 760;
const PAD = 26;
const MAX_SLOTS = 6;
const NAME_MAX = 18;

type Plane = [number, number];
type Equipment = 'lift' | 'pit' | 'bench';

function columnsFor(count: number): number {
  if (count <= 2) return Math.max(count, 1);
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

function equipmentFor(name: string, index: number): Equipment {
  const n = name.toLowerCase();
  if (/foso|lubric|engras|aceite/.test(n)) return 'pit';
  if (/mec[aá]n|freno|motor|suspens|direcci/.test(n)) return 'lift';
  if (/electr|soldad|chapa|pintur|carroc|tornel|taller general/.test(n)) return 'bench';
  return (['lift', 'bench', 'pit'] as const)[index % 3];
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const escapeText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Orden de prioridad: lo trabado primero, así el "+N" nunca esconde un problema. */
function pieceList(c: PlanCounts): PlanPieceKind[] {
  return [
    ...Array<PlanPieceKind>(c.paused).fill('paused'),
    ...Array<PlanPieceKind>(c.unassigned).fill('unassigned'),
    ...Array<PlanPieceKind>(c.pending).fill('pending'),
    ...Array<PlanPieceKind>(c.active).fill('active'),
  ];
}

function lampTone(sector: WorkshopPlanSector): 'ok' | 'warn' | 'danger' | null {
  const { maxCapacity, occupiedSlots, isOverCapacity } = sector;
  if (maxCapacity == null || maxCapacity <= 0) return null;
  const ratio = occupiedSlots / maxCapacity;
  if (isOverCapacity || ratio >= 1) return 'danger';
  if (ratio >= 0.75) return 'warn';
  return 'ok';
}

export function buildWorkshopPlanSvg({
  sectors,
  selectedSectorId,
  standalone = false,
}: {
  sectors: WorkshopPlanSector[];
  selectedSectorId?: string | null;
  /** Solo para capturas fuera de la app: incrusta el CSS del kit. */
  standalone?: k.Theme | false;
}): { svg: string; width: number; height: number } {
  const count = Math.max(sectors.length, 1);
  const cols = columnsFor(count);
  const rows = Math.ceil(count / cols);
  const spanX = cols * BAY_W + (cols - 1) * GAP;
  const spanY = rows * BAY_D + (rows - 1) * GAP;

  // Puntos que tienen que entrar: suelo completo + la altura de los postes.
  const margin = 14;
  const fitPoints: Array<[number, number, number]> = [
    ...k.boxCorners({ x: -margin, y: -margin, w: spanX + margin * 2, d: spanY + margin * 2, r: 0 }, -4, 0),
    [-margin, spanY + margin, 52],
    [spanX + margin, -margin, 40],
  ];
  // Alto según la proporción real: sin franjas vacías con pocos sectores.
  const unit: k.Projection = { origin: [0, 0], scale: 1 };
  const flat = fitPoints.map((p) => k.iso(p, unit));
  const xs = flat.map((p) => p[0]);
  const ys = flat.map((p) => p[1]);
  const s = (WIDTH - PAD * 2) / (Math.max(...xs) - Math.min(...xs));
  const height = Math.round((Math.max(...ys) - Math.min(...ys)) * s + PAD * 2);
  const P = k.fitProjection(fitPoints, WIDTH, height, { pad: PAD });

  const body: string[] = [];
  body.push(
    `<path class="iso-halo" d="${k.haloOf({ x: -margin, y: -margin, w: spanX + margin * 2, d: spanY + margin * 2, r: 8 }, -4, 4, P)}"/>`,
    k.solidSvg(k.slabOf({ x: -margin, y: -margin, w: spanX + margin * 2, d: spanY + margin * 2, r: 8 }, -4, 4, P, 6), {
      tone: 'lo',
      crease: 'faint',
    })
  );

  // Orden de pintado: de lejos a cerca por el centro de la bahía.
  const placed = sectors.map((sector, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = col * (BAY_W + GAP);
    const y = row * (BAY_D + GAP);
    return { sector, index, x, y, depth: k.depthOf([x + BAY_W / 2, y + BAY_D / 2, 0], P) };
  });
  placed.sort((a, b) => a.depth - b.depth);

  for (const bay of placed)
    body.push(bayBody(bay.sector, bay.index, bay.x, bay.y, bay.sector.id === selectedSectorId, P));

  const label = `Plano isométrico del taller con ${sectors.length} ${sectors.length === 1 ? 'sector' : 'sectores'}. Cada bahía muestra sus órdenes de trabajo abiertas y un semáforo de cupo.`;
  return { svg: k.figureSvg({ width: WIDTH, height, label, body, standalone }), width: WIDTH, height };
}

function bayBody(
  sector: WorkshopPlanSector,
  index: number,
  x: number,
  y: number,
  selected: boolean,
  P: k.Projection
): string {
  const c = countsOf(sector);
  const out: string[] = [];

  // Suelo de la bahía
  const floor = { x, y, w: BAY_W, d: BAY_D, r: 3 };
  out.push(
    k.solidSvg(k.slabOf(floor, 0, 2.5, P, 5), { tone: selected ? 'hi' : 'mid', crease: 'faint', lit: selected })
  );
  out.push(k.lineSvg(k.planOutline(k.insetPlan(floor, 5), 2.5, P, 5), { tone: 'faint', dashed: true }));
  if (selected) {
    out.push(
      `<path class="iso-line" data-tone="blue" style="stroke-width:2.2" d="${k.planOutline(floor, 2.5, P, 5)}"/>`
    );
  }

  // Elementos de pintado a ordenar de lejos a cerca
  const items: Array<{ depth: number; svg: string }> = [];
  const add = (cx: number, cy: number, svg: string) => items.push({ depth: k.depthOf([cx, cy, 0], P), svg });

  // Equipo del sector en la franja de fondo (x chico)
  const eq = equipmentFor(sector.name, index);
  const ex = x + 8;
  if (eq === 'lift') {
    const posts: string[] = [];
    for (const py of [y + 16, y + BAY_D - 28]) {
      posts.push(k.solidSvg(k.slabOf({ x: ex, y: py, w: 7, d: 7, r: 1 }, 2.5, 34, P, 3, 0.4), { tone: 'mid' }));
    }
    posts.push(
      k.solidSvg(k.slabOf({ x: ex + 1, y: y + 16, w: 5, d: BAY_D - 44 + 7, r: 1 }, 30, 3.5, P, 3), {
        tone: 'hi',
        crease: 'lo',
      })
    );
    add(ex + 3, y + BAY_D / 2, posts.join(''));
  } else if (eq === 'pit') {
    const pit = { x: ex, y: y + 14, w: 20, d: BAY_D - 40, r: 1.5 };
    add(
      ex + 10,
      y + BAY_D / 2,
      `<path class="iso-fill" style="fill:var(--anatomy-shade-0)" d="${k.planOutline(pit, 2.5, P, 3)}"/>` +
        k.lineSvg(k.planOutline(pit, 2.5, P, 3), { tone: 'mid' }) +
        k.lineSvg(k.lineOnTop([pit.x + 6, pit.y + 4], [pit.x + 6, pit.y + pit.d - 4], 2.5, P), { tone: 'lo' }) +
        k.lineSvg(k.lineOnTop([pit.x + 14, pit.y + 4], [pit.x + 14, pit.y + pit.d - 4], 2.5, P), { tone: 'lo' })
    );
  } else {
    const bench =
      k.solidSvg(k.slabOf({ x: ex, y: y + 16, w: 16, d: BAY_D - 44, r: 1.5 }, 2.5, 13, P, 3, 0.4), { tone: 'mid' }) +
      k.solidSvg(k.slabOf({ x: ex + 1, y: y + 22, w: 6, d: 22, r: 1 }, 15.5, 9, P, 3), {
        tone: 'lo',
        crease: 'faint',
      }) +
      k.solidSvg(k.slabOf({ x: ex + 9, y: y + 52, w: 5, d: 8, r: 1 }, 15.5, 5, P, 3), { tone: 'hi', crease: 'lo' });
    add(ex + 8, y + BAY_D / 2, bench);
  }

  // Piezas: 3 columnas (x) × 2 filas (y); si sobran, la sexta casilla es el "+N"
  const pieces = pieceList(c);
  const overflow = pieces.length > MAX_SLOTS;
  const shown = overflow ? pieces.slice(0, MAX_SLOTS - 1) : pieces;
  const slotAt = (i: number): Plane => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    return [x + 38 + col * 34, y + 8 + row * 50];
  };
  shown.forEach((kind, i) => {
    const [px, py] = slotAt(i);
    add(px + 12, py + 22, vehicleSvg(kind, px, py, P));
  });
  if (overflow) {
    const [px, py] = slotAt(MAX_SLOTS - 1);
    add(px + 12, py + 22, overflowSvg(pieces.length - (MAX_SLOTS - 1), px, py, P));
  }

  items.sort((a, b) => a.depth - b.depth);
  out.push(...items.map((item) => item.svg));

  // Rótulo grabado en el piso, sobre el borde cercano
  out.push(
    k.faceTextSvg(k.topMatrix([x + 20, y + BAY_D - 5], 2.6, P, 'x'), truncate(sector.name, NAME_MAX), {
      size: 7.5,
      tone: selected ? 'hi' : 'mid',
    })
  );

  // Poste con semáforo de cupo en la esquina izquierda
  out.push(poleSvg(sector, x + 5, y + BAY_D - 11, P));

  const aria = escapeText(describePlanSector(sector));
  return `<g data-iso-id="${escapeText(sector.id)}" tabindex="0" role="button" aria-label="${aria}" aria-pressed="${selected}">${out.join('')}</g>`;
}

function vehicleSvg(kind: PlanPieceKind, x: number, y: number, P: k.Projection): string {
  const w = 24;
  const len = 44;
  if (kind === 'unassigned') {
    const plan = { x, y, w, d: len, r: 2 };
    return (
      `<path class="iso-fill" style="fill:${PIECE_COLOR.unassigned};opacity:.14" d="${k.planOutline(plan, 2.5, P, 3)}"/>` +
      `<path class="iso-line" style="stroke:${PIECE_COLOR.unassigned};stroke-width:1.1" data-dashed d="${k.planOutline(plan, 2.5, P, 3)}"/>` +
      `<path class="iso-line" style="stroke:${PIECE_COLOR.unassigned};stroke-width:1.1" data-dashed d="${k.planOutline({ x: x + 2, y: y + 2, w: w - 4, d: len - 4, r: 2 }, 15, P, 3)}"/>`
    );
  }
  const color = PIECE_COLOR[kind];
  const chassis = k.solidSvg(k.slabOf({ x, y, w, d: len, r: 2 }, 2.5, 5, P, 3, 0.4), { tone: 'lo', crease: 'faint' });
  const cargoPlan = { x: x + 1, y: y + 1, w: w - 2, d: 28, r: 1.5 };
  const cargoPaths = k.slabOf(cargoPlan, 7.5, 12, P, 3, 0.5);
  const cargo = k.solidSvg(cargoPaths, { tone: 'mid', crease: 'faint' });
  const cap = `<path style="fill:${color};opacity:.82;stroke:none" d="${cargoPaths.top}"/>`;
  const cab = k.solidSvg(k.slabOf({ x: x + 2, y: y + 31, w: w - 4, d: 12, r: 2 }, 7.5, 14, P, 3, 0.6), {
    tone: 'hi',
    crease: 'lo',
  });
  const glass = k.lineSvg(k.lineOnTop([x + 5, y + 40], [x + w - 5, y + 40], 16, P), { tone: 'lo' });
  const wheels = [
    [x + 3, y + 8],
    [x + w - 3, y + 8],
    [x + 3, y + 36],
    [x + w - 3, y + 36],
  ]
    .map(([wx, wy]) => k.solidSvg(k.cylinder(wx, wy, 3.4, 0, 6, P, 10), { tone: 'hi', crease: 'none' }))
    .join('');
  return wheels + chassis + cargo + cap + cab + glass;
}

function overflowSvg(extra: number, x: number, y: number, P: k.Projection): string {
  const plate = k.solidSvg(k.slabOf({ x, y: y + 8, w: 24, d: 28, r: 3 }, 2.5, 4, P, 4, 0.5), {
    tone: 'hi',
    crease: 'lo',
  });
  const [tx, ty] = k.iso([x + 12, y + 22, 8], P);
  const text = `<text x="${tx.toFixed(1)}" y="${(ty + 3.5).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" style="fill:var(--anatomy-strong);font-family:var(--anatomy-mono)">+${extra}</text>`;
  return plate + text;
}

function poleSvg(sector: WorkshopPlanSector, x: number, y: number, P: k.Projection): string {
  const tone = lampTone(sector);
  const post = k.solidSvg(k.slabOf({ x, y, w: 3.5, d: 3.5, r: 0.5 }, 2.5, 22, P, 2), { tone: 'mid', crease: 'none' });
  const house = k.solidSvg(k.slabOf({ x: x - 1.5, y: y - 1.5, w: 6.5, d: 6.5, r: 1.5 }, 24, 21, P, 3, 0.5), {
    tone: 'hi',
    crease: 'faint',
  });
  const levels: Array<{ key: 'danger' | 'warn' | 'ok'; z: number }> = [
    { key: 'danger', z: 41 },
    { key: 'warn', z: 34.5 },
    { key: 'ok', z: 28 },
  ];
  const lamps = levels
    .map(({ key, z }) => {
      const [cx, cy] = k.iso([x + 5, y + 5, z], P);
      const on = tone === key;
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.7" style="fill:var(--status-${key === 'danger' ? 'danger' : key === 'warn' ? 'warn' : 'ok'});opacity:${on ? 1 : 0.2};stroke:none" data-lamp="${key}" data-on="${on}"/>`;
    })
    .join('');
  return post + house + lamps;
}
