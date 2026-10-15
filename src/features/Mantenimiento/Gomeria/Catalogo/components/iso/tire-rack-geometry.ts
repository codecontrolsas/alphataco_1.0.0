/**
 * Geometría de la estantería isométrica de cubiertas (skill anatomy). Funciones puras: datos -> string SVG.
 * Sin React ni DOM.
 *
 * Mundo: la repisa corre a lo largo de `y` (el extremo +y queda a la IZQUIERDA en pantalla), la profundidad
 * es `x` (el frente abierto es +x, hacia la cámara) y `z` es arriba. Cada repisa tiene una columna de rótulo y
 * una columna (bahía) por estado; las cubiertas son cilindros apoyados con el eje a lo largo de `y`, una al lado
 * de la otra, y la nueva más cercana a la cámara queda a la izquierda de su bahía.
 *
 * Orden de pintado: sombra -> montantes traseros -> travesaños traseros -> cada repisa de abajo hacia arriba
 * (chapa, bahías de lejos a cerca, travesaño delantero con su rótulo) -> montantes delanteros.
 */
import * as k from '@/shared/components/iso/iso-kit.ts';
import * as G from '@/shared/components/iso/lathe.mjs';

// ─── Estados ───────────────────────────────────────────────────────────────

/** Mismos valores que `TireStatus` (prisma). Se repiten acá para que el módulo siga puro y sin dependencias del cliente de Prisma. */
export type RackStatus = 'AVAILABLE' | 'INSTALLED' | 'IN_REPAIR' | 'MISSING' | 'DISCARDED';

/** Orden de las bahías de izquierda a derecha. */
export const RACK_STATUS_ORDER: readonly RackStatus[] = ['AVAILABLE', 'INSTALLED', 'IN_REPAIR', 'MISSING', 'DISCARDED'];

/** Textos del estado: los mismos que la tabla y las tarjetas del catálogo (`TIRE_STATUS_UI`). */
export const RACK_STATUS_TEXT: Readonly<Record<RackStatus, { singular: string; plural: string }>> = {
  AVAILABLE: { singular: 'Disponible', plural: 'disponibles' },
  INSTALLED: { singular: 'Instalada', plural: 'instaladas' },
  IN_REPAIR: { singular: 'En reparación', plural: 'en reparación' },
  MISSING: { singular: 'Extraviada', plural: 'extraviadas' },
  DISCARDED: { singular: 'Descartada', plural: 'descartadas' },
};

/** Tono del estado (mismos `--status-*` que las tarjetas): disponible verde, instalada azul, reparación ámbar, extraviada roja, descartada gris. */
export type RackTone = 'green' | 'blue' | 'amber' | 'red' | 'none';

export const RACK_STATUS_TONE: Readonly<Record<RackStatus, RackTone>> = {
  AVAILABLE: 'green',
  INSTALLED: 'blue',
  IN_REPAIR: 'amber',
  MISSING: 'red',
  DISCARDED: 'none',
};

export interface RackShelf {
  /** Medida (`tire_types.size`), por ejemplo `295/80R22.5`. */
  size: string;
  counts: Partial<Record<RackStatus, number>>;
  /** Unidades que faltan para llegar al mínimo de stock de esta medida (0 o ausente = no está bajo mínimo). */
  shortage?: number;
}

export interface BuildTireRackInput {
  shelves: RackShelf[];
  /** `<medida>|<estado>` del grupo resaltado. */
  selected?: string | null;
  /** Texto accesible de toda la figura. */
  label?: string;
}

export interface TireRackSvg {
  svg: string;
  width: number;
  height: number;
}

/** Id de un grupo: lo que viaja en `data-iso-id` y lo que entiende la tabla (medida + estado). */
export const rackGroupId = (size: string, status: RackStatus) => `${size}|${status}`;

export function parseRackGroupId(id: string): { size: string; status: RackStatus } | null {
  const cut = id.lastIndexOf('|');
  if (cut < 0) return null;
  const status = id.slice(cut + 1) as RackStatus;
  if (!RACK_STATUS_ORDER.includes(status)) return null;
  return { size: id.slice(0, cut), status };
}

/** Descripción accesible del grupo de una repisa. */
export function describeRackGroup(shelf: RackShelf, status: RackStatus): string {
  const count = shelf.counts[status] ?? 0;
  const base = `Medida ${shelf.size}: ${count} ${RACK_STATUS_TEXT[status].plural}`;
  const short = status === 'AVAILABLE' ? shelf.shortage ?? 0 : 0;
  return short > 0 ? `${base}, faltan ${short} para el mínimo` : base;
}

// ─── Constantes de la figura ───────────────────────────────────────────────

export const RACK_VIEW_WIDTH = 680;
const MIN_HEIGHT = 250;
const PAD = 26;
const AZIMUTH = 30;

/** Piezas dibujadas por grupo; el resto va como "+N". */
export const RACK_MAX_PIECES = 4;

const TIRE_R = 13;
const TIRE_W = 9;
const PITCH = 9.5;
const BAY_PAD = 3.5;
const BAY_LEN = RACK_MAX_PIECES * PITCH + BAY_PAD * 2;
const LABEL_LEN = 44;
const DECK_D = 32;
const DECK_T = 2.4;
const LEVEL = 42;
const BEAM_H = 7;
const BEAM_T = 2.2;
const POST = 2.2;
const FOOT_Z = 8;
const TEXT = 5;
const SIZE_TEXT = 4.4;

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ─── Constructor ───────────────────────────────────────────────────────────

export function buildTireRackSvg({ shelves, selected = null, label }: BuildTireRackInput): TireRackSvg {
  // Estantería vacía: se dibuja el esqueleto con dos repisas sin nada.
  const levels: Array<RackShelf | null> = shelves.length > 0 ? shelves : [null, null];
  const count = levels.length;

  // Columnas: solo los estados que aparecen en alguna repisa (disponible siempre), así las columnas alinean entre repisas.
  const used = RACK_STATUS_ORDER.filter(
    (status) => status === 'AVAILABLE' || shelves.some((shelf) => (shelf.counts[status] ?? 0) > 0)
  );
  const length = LABEL_LEN + used.length * BAY_LEN;
  const yMax = length / 2;
  const yMin = -length / 2;
  const half = DECK_D / 2;

  const zTop = (level: number) => FOOT_Z + (count - 1 - level) * LEVEL;
  const capZ = zTop(0) + LEVEL;
  const postTop = capZ + 1;

  // Cámara: ancho fijo; el alto crece con la cantidad de repisas y la escala se mantiene (la manda el ancho).
  const corners: k.Point3[] = [
    ...k.boxCorners({ x: -half - 6, y: yMin - 4, w: DECK_D + 12, d: length + 8, r: 0 }, 0, postTop + 2),
  ];
  const unit = k.fitProjection(corners, RACK_VIEW_WIDTH, 100000, { pad: PAD, azimuth: AZIMUTH });
  const flat = corners.map((p) => k.iso(p, { ...unit, origin: [0, 0], scale: unit.scale }));
  const naturalHeight = Math.max(...flat.map(([, y]) => y)) - Math.min(...flat.map(([, y]) => y)) + PAD * 2;
  const height = Math.ceil(Math.max(MIN_HEIGHT, naturalHeight));
  const P = k.fitProjection(corners, RACK_VIEW_WIDTH, height, { pad: PAD, azimuth: AZIMUTH });

  const S = (paths: ReturnType<typeof k.slabOf>, style?: k.SolidStyle) => k.solidSvg(paths, style);
  const L = (d: string, style?: k.LineStyle) => k.lineSvg(d, style);
  const D = (pts: k.Flat[], style?: { size?: number; tone?: k.Tone }) => k.dotsSvg(pts, style);
  const at = (p: number[]) => k.iso(p as k.Point3, P);

  // Límites de cada columna a lo largo de y (de +y a -y).
  const labelTop = yMax;
  const labelBottom = yMax - LABEL_LEN;
  const bayTop = (index: number) => labelBottom - index * BAY_LEN;
  const boundaries = [yMax, labelBottom, ...used.map((_, index) => bayTop(index) - BAY_LEN)];

  // ── Una cubierta apoyada: eje a lo largo de +y, la cara que mira a la cámara es la de +y.
  // La proyección es ortográfica: todas las cubiertas de un estado son la misma figura desplazada, así que se
  // dibuja UNA vez en `<defs>` y cada pieza es un `<use>` con su traslación (el SVG pesa una fracción).
  const scaleKey = Math.round(P.scale * 1000);
  const defs = new Map<string, string>();
  const origin = at([0, 0, 0]);
  const place = (key: string, build: () => string, slotY: number, zBase: number) => {
    const id = `rk${scaleKey}-${key}`;
    if (!defs.has(id)) defs.set(id, `<g id="${id}">${build()}</g>`);
    const [px, py] = at([0, slotY, zBase]);
    return `<use href="#${id}" x="${Math.round((px - origin[0]) * 10) / 10}" y="${Math.round((py - origin[1]) * 10) / 10}"/>`;
  };
  const tire = (slotY: number, zBase: number, status: RackStatus) =>
    place(status, () => tireShape(status), slotY, zBase);
  const gap = (slotY: number, zBase: number) => place('gap', gapShape, slotY, zBase);

  function tireShape(status: RackStatus): string {
    const F = G.frameAlong([0, 0, TIRE_R], [0, 1, 0]);
    const tone = RACK_STATUS_TONE[status];
    const colored = tone !== 'none';
    const dim = status === 'DISCARDED' ? 0.55 : status === 'MISSING' ? 0.8 : 1;
    const body: string[] = [
      S(
        G.solidOf(
          [
            [0, TIRE_R * 0.58],
            [0.7, TIRE_R * 0.87, 1],
            [1.6, TIRE_R],
            [TIRE_W - 1.6, TIRE_R],
            [TIRE_W - 0.7, TIRE_R * 0.87, 1],
            [TIRE_W, TIRE_R * 0.58],
          ],
          F,
          P,
          { steps: 28 }
        ),
        { tone: 'mid', crease: 'faint' }
      ),
      // Banda de rodamiento coloreada: se lee aunque la cara quede tapada por la cubierta de al lado.
      `<path class="iso-line" data-tone="${colored ? tone : 'faint'}" d="${G.arcOf(F, TIRE_W * 0.5, TIRE_R, P, { steps: 28 })}" style="stroke-width:${colored ? 2 : 0.6};stroke-linecap:round"/>`,
      S(G.disc(TIRE_W - 0.3, TIRE_W + 0.5, TIRE_R * 0.52, F, P, { steps: 20 }), { tone: 'hi', crease: 'lo' }),
      `<path class="iso-line" data-tone="${colored ? tone : 'mid'}"${status === 'MISSING' ? ' data-dashed' : ''} d="${G.circleOf(F, TIRE_W, TIRE_R * 0.77, P, 36)}" style="stroke-width:${colored ? 2.6 : 1.2};stroke-linecap:round"/>`,
      D([at(G.pointOf(F, TIRE_W + 0.5, 0, 0))], { size: 0.6, tone: 'hi' }),
    ];
    if (status === 'DISCARDED') {
      // Tachada: una diagonal sobre la cara.
      const a = at(G.pointOf(F, TIRE_W + 0.6, TIRE_R - 1, Math.PI * 0.75));
      const b = at(G.pointOf(F, TIRE_W + 0.6, TIRE_R - 1, Math.PI * 1.75));
      body.push(
        `<path class="iso-line" data-tone="hi" d="${k.pathOf([a, b])}" style="stroke-width:1.5;stroke-linecap:round"/>`
      );
    }
    return dim < 1 ? `<g style="opacity:${dim}">${body.join('')}</g>` : body.join('');
  }

  /** Hueco punteado donde falta stock para llegar al mínimo. */
  function gapShape(): string {
    const F = G.frameAlong([0, 0, TIRE_R], [0, 1, 0]);
    return [
      `<path class="iso-line" data-tone="mid" data-dotted d="${G.circleOf(F, TIRE_W, TIRE_R - 1, P, 40)}" style="stroke-width:1.8"/>`,
      `<path class="iso-line" data-tone="faint" data-dotted d="${G.circleOf(F, 0, TIRE_R - 1, P, 40)}" style="stroke-width:1.2"/>`,
    ].join('');
  }

  // Texto sobre la cara frontal del travesaño: `anchor` start = hacia la izquierda de la bahía.
  const faceMatrix = (y: number, z: number) => k.sideMatrix([half + BEAM_T, y], z, P, 'right');
  const beamText = (y: number, z: number, body: string, anchor: 'start' | 'middle' = 'start', size = TEXT) =>
    `<text class="iso-face-text" data-tone="hi" transform="${faceMatrix(y, z)}" x="0" y="${BEAM_H - 1.6}" font-size="${size}" text-anchor="${anchor}">${body}</text>`;

  // ── Estructura
  const posts = (front: boolean) =>
    boundaries
      .map((y) => {
        const x = front ? half : -half - POST;
        const items = [
          S(k.slabOf({ x: x - 0.4, y: y - POST / 2, w: POST + 0.8, d: POST + 0.8, r: 0.3 }, 0, 1.2, P, 2, 0), {
            tone: 'lo',
            crease: 'none',
          }),
          S(k.slabOf({ x, y: y - POST / 2, w: POST, d: POST, r: 0.4 }, 1.2, postTop - 1.2, P, 2, 0), {
            tone: 'mid',
            crease: 'none',
          }),
        ];
        return { depth: k.depthOf([x, y, 0], P), svg: items.join('') };
      })
      .sort((a, b) => a.depth - b.depth)
      .map((p) => p.svg)
      .join('');

  const beam = (z: number, front: boolean) =>
    S(
      k.slabOf(
        { x: front ? half : -half - BEAM_T, y: yMin, w: BEAM_T, d: length, r: 0.4 },
        z - BEAM_H,
        BEAM_H + 0.5,
        P,
        2,
        0.3
      ),
      { tone: 'mid', crease: 'faint' }
    );

  const out: string[] = [];
  out.push('');
  const defsSlot = out.length - 1;
  out.push(
    `<path class="iso-halo" d="${k.haloOf({ x: -half - 8, y: yMin - 6, w: DECK_D + 16, d: length + 12, r: 6 }, 0, 0.1, P)}" style="filter:blur(6px)"/>`
  );
  out.push(posts(false));
  for (let level = 0; level < count; level++) out.push(beam(zTop(level), false));
  out.push(beam(capZ, false));

  // ── Repisas, de abajo hacia arriba
  for (let level = count - 1; level >= 0; level--) {
    const shelf = levels[level];
    const z = zTop(level);
    out.push(
      S(k.slabOf({ x: -half, y: yMin, w: DECK_D, d: length, r: 0.6 }, z - DECK_T, DECK_T, P, 3, 0.3), {
        tone: 'lo',
        crease: 'faint',
      })
    );
    // Costuras entre columnas.
    for (const y of boundaries.slice(1, -1))
      out.push(L(k.lineOnTop([-half + 1, y], [half - 1, y], z, P), { tone: 'faint' }));

    // Bahías de lejos (y chico) a cerca.
    const bays = used
      .map((status, index) => ({ status, index, depth: k.depthOf([0, bayTop(index) - BAY_LEN / 2, z], P) }))
      .sort((a, b) => a.depth - b.depth);
    const beamBits: string[] = [];

    for (const { status, index } of bays) {
      const total = shelf?.counts[status] ?? 0;
      const shortage = status === 'AVAILABLE' ? shelf?.shortage ?? 0 : 0;
      const top = bayTop(index);
      const id = shelf ? rackGroupId(shelf.size, status) : '';
      const yCenter = top - BAY_LEN / 2;
      if (!shelf || (total === 0 && shortage === 0)) continue;

      const isSelected = selected === id;
      const shown = Math.min(total, RACK_MAX_PIECES);
      const holes = Math.min(Math.max(0, Math.ceil(shortage)), RACK_MAX_PIECES - shown);
      const slotY = (slot: number) => top - BAY_PAD - (slot + 1) * PITCH + (PITCH - TIRE_W) / 2;

      const parts: string[] = [];
      const footprint = { x: -half + 1, y: top - BAY_LEN + 1, w: DECK_D - 2, d: BAY_LEN - 2, r: 1 };
      if (isSelected) {
        parts.push(
          `<path class="iso-line" data-tone="lit" d="${k.planOutline(footprint, z + 0.2, P, 3)}" style="stroke-width:2.2"/>`
        );
      } else if (shortage > 0) {
        // Bajo mínimo: el borde de la bahía se marca punteado aunque no entren más huecos.
        parts.push(
          `<path class="iso-line" data-tone="mid" data-dotted d="${k.planOutline(footprint, z + 0.2, P, 3)}" style="stroke-width:1.3"/>`
        );
      }
      // Cubiertas y huecos de lejos (slot alto) a cerca (slot 0).
      for (let slot = shown + holes - 1; slot >= 0; slot--) {
        parts.push(slot < shown ? tire(slotY(slot), z, status) : gap(slotY(slot), z));
      }
      // Zona de toque: toda la bahía, aunque haya pocas cubiertas.
      const hit = `<path d="${k.planOutline({ x: -half, y: top - BAY_LEN, w: DECK_D, d: BAY_LEN, r: 0 }, z + TIRE_R * 2, P, 1)}" fill="transparent" stroke="none" pointer-events="all"/>`;
      const aria = `${describeRackGroup(shelf, status)}${isSelected ? ', filtro aplicado' : ''}`;
      out.push(
        `<g data-iso-id="${esc(id)}" data-status="${status}" tabindex="0" role="button" aria-pressed="${isSelected}" aria-label="${esc(aria)}">${hit}${parts.join('')}</g>`
      );

      // Rótulo de la bahía sobre el travesaño delantero (se pinta después de todas las bahías de la repisa).
      const extra = total - shown;
      const labelParts = [`<tspan>${total}</tspan>`];
      if (extra > 0) labelParts.push(`<tspan style="opacity:.7"> +${extra}</tspan>`);
      if (shortage > 0)
        labelParts.push(`<tspan style="fill:var(--anatomy-red)"> faltan ${Math.ceil(shortage)}</tspan>`);
      beamBits.push(
        `<g data-iso-id="${esc(id)}" aria-hidden="true"><path d="${k.pathOf(
          [
            at([half + BEAM_T, top, z + 0.5]),
            at([half + BEAM_T, top - BAY_LEN, z + 0.5]),
            at([half + BEAM_T, top - BAY_LEN, z - BEAM_H]),
            at([half + BEAM_T, top, z - BEAM_H]),
          ],
          true
        )}" fill="transparent" stroke="none" pointer-events="all"/>${beamText(top - 3, z, labelParts.join(''))}${
          isSelected
            ? L(k.segment([half + BEAM_T, top - 1, z - BEAM_H], [half + BEAM_T, top - BAY_LEN + 1, z - BEAM_H], P), {
                tone: 'lit',
                className: 'iso-sel',
              })
            : ''
        }</g>`
      );
      void yCenter;
    }

    out.push(beam(z, true));
    // Rótulo grabado con la medida y tornillos en cada montante.
    if (shelf) {
      out.push(beamText(labelTop - 3, z, esc(shelf.size), 'start', SIZE_TEXT));
    } else {
      out.push(
        `<text class="iso-face-text" data-tone="faint" transform="${faceMatrix(labelTop - 3, z)}" x="0" y="${BEAM_H - 1.6}" font-size="${TEXT}">sin cubiertas</text>`
      );
    }
    out.push(...beamBits);
    out.push(
      D(
        boundaries.flatMap((y) => [at([half + BEAM_T, y, z - 1.6]), at([half + BEAM_T, y, z - BEAM_H + 1.6])]),
        { size: 0.55, tone: 'hi' }
      )
    );
  }

  // Travesaño superior y montantes delanteros.
  out.push(beam(capZ, true));
  out.push(posts(true));
  out.push(
    D(
      boundaries.map((y) => at([half + POST, y - POST / 2 + 0.7, capZ - 3])),
      { size: 0.5, tone: 'hi' }
    )
  );

  // Las piezas se arman arriba; los `<defs>` se completan al final con las formas que se usaron.
  out[defsSlot] = defs.size > 0 ? `<defs>${[...defs.values()].join('')}</defs>` : '';

  const summary =
    label ??
    (shelves.length === 0
      ? 'Estantería de cubiertas vacía: todavía no hay cubiertas cargadas.'
      : `Estantería de cubiertas con ${shelves.length} ${shelves.length === 1 ? 'medida' : 'medidas'}: una repisa por medida y, sobre cada una, las cubiertas agrupadas por estado.`);

  const svg = k
    .figureSvg({ width: RACK_VIEW_WIDTH, height, label: summary, body: out })
    // Las repisas son botones: el contenedor pasa de imagen a grupo para que los lectores de pantalla los vean.
    .replace(' role="img"', ' role="group"');

  return { svg, width: RACK_VIEW_WIDTH, height };
}
