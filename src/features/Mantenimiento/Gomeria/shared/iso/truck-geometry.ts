/**
 * Geometría del camión isométrico de cubiertas (skill anatomy). Funciones puras: datos -> string SVG.
 * Sin React ni DOM, así lo puede reusar un servidor o cualquier otra pantalla ("gemelo del vehículo").
 *
 * Mundo: x = hacia adelante (la cabina está en +x), y = hacia la izquierda del vehículo, z = arriba.
 * Con la cámara de `AZIMUTH` el lado IZQUIERDO queda cerca del que mira y el DERECHO lejos.
 * Orden de pintado: ruedas del lado lejano -> chasis -> auxilios -> ruedas del lado cercano.
 */
import * as k from '@/shared/components/iso/iso-kit.ts';
import * as G from '@/shared/components/iso/lathe.mjs';
import {
  calculatePositions,
  describePosition,
  type ComputedPosition,
  type DiagramAxle,
  type DiagramPosition,
} from '../tire-diagram-utils';

// ─── Umbrales de estado ────────────────────────────────────────────────────
// Todos PROVISORIOS: a confirmar con el taller antes de darlos por definitivos.

/** Profundidad de dibujo (mm): verde desde este valor. A confirmar con el taller. */
export const TREAD_OK_MM = 8;
/** Profundidad de dibujo (mm): ámbar desde este valor hasta TREAD_OK_MM; por debajo, rojo. A confirmar con el taller. */
export const TREAD_WARN_MM = 5;
/** Presión objetivo (psi). A confirmar con el taller. */
export const PRESSURE_TARGET_PSI = 110;
/** Desvío de presión (psi) todavía aceptable (verde), ±. A confirmar con el taller. */
export const PRESSURE_OK_DELTA_PSI = 8;
/** Desvío de presión (psi) de atención (ámbar), ±; más allá, rojo. A confirmar con el taller. */
export const PRESSURE_WARN_DELTA_PSI = 15;

// ─── Capas y tonos ─────────────────────────────────────────────────────────

export type TireLayer = 'profundidad' | 'presion' | 'recapado';

/** `none` = hay cubierta pero la capa no tiene dato; el SVG la dibuja neutra. */
export type TireTone = 'green' | 'amber' | 'red' | 'blue' | 'none';

export const TIRE_LAYERS: ReadonlyArray<{ id: TireLayer; label: string }> = [
  { id: 'profundidad', label: 'Dibujo' },
  { id: 'presion', label: 'Presión' },
  { id: 'recapado', label: 'Recapado' },
];

/** Mismo vocabulario que `tireRetreadLabels` (tire-mappers.ts); acá no se importa para mantener este módulo puro. */
export const RETREAD_LABELS: Record<'FIRST' | 'SECOND' | 'THIRD', string> = {
  FIRST: '1° Precurado',
  SECOND: '2° Precurado',
  THIRD: '3° Precurado',
};

const RETREAD_TONES: Record<'FIRST' | 'SECOND' | 'THIRD', TireTone> = { FIRST: 'blue', SECOND: 'amber', THIRD: 'red' };

export function toneForTread(mm: number): TireTone {
  return mm >= TREAD_OK_MM ? 'green' : mm >= TREAD_WARN_MM ? 'amber' : 'red';
}

export function toneForPressure(psi: number): TireTone {
  const delta = Math.abs(psi - PRESSURE_TARGET_PSI);
  return delta <= PRESSURE_OK_DELTA_PSI ? 'green' : delta <= PRESSURE_WARN_DELTA_PSI ? 'amber' : 'red';
}

/** Tono de una posición en la capa elegida. Posición vacía o sin dato -> `none`. */
export function toneForLayer(layer: TireLayer | null, position: DiagramPosition | undefined): TireTone {
  if (!layer || !position || position.tire_id === null) return 'none';
  if (layer === 'profundidad') return position.tread_depth_mm == null ? 'none' : toneForTread(position.tread_depth_mm);
  if (layer === 'presion') return position.pressure_psi == null ? 'none' : toneForPressure(position.pressure_psi);
  if (position.retread_level === undefined) return 'none';
  return position.retread_level === null ? 'green' : RETREAD_TONES[position.retread_level];
}

/** Qué capas tienen al menos un dato para dibujar. */
export function availableLayers(positions: DiagramPosition[]): TireLayer[] {
  const mounted = positions.filter((p) => p.tire_id !== null);
  const out: TireLayer[] = [];
  if (mounted.some((p) => p.tread_depth_mm != null)) out.push('profundidad');
  if (mounted.some((p) => p.pressure_psi != null)) out.push('presion');
  if (mounted.some((p) => p.retread_level !== undefined)) out.push('recapado');
  return out;
}

// ─── Formato de números (es-AR: coma decimal) ──────────────────────────────

const decimal = (value: number, digits: number) => value.toFixed(digits).replace('.', ',');
export const formatMm = (mm: number) => `${decimal(mm, 1)} mm`;
export const formatPsi = (psi: number) => `${decimal(psi, 0)} psi`;

// ─── Constantes de la figura ───────────────────────────────────────────────

export const TRUCK_VIEW_WIDTH = 680;
export const TRUCK_VIEW_HEIGHT = 400;
const AZIMUTH = 40;

const TIRE_R = 26;
const TIRE_W = 22;
/** Carriles en Y (del lado izquierdo, hacia afuera): simple, doble interior y doble exterior. */
const LANE_SINGLE: [number, number] = [40, 62];
const LANE_INNER: [number, number] = [34, 56];
const LANE_OUTER: [number, number] = [58, 80];
const FRAME_TOP = 59;
const SPARE_PITCH = 56;

export interface TruckHitch {
  label: string;
  position: 'front' | 'rear';
}

export interface BuildTruckSvgInput {
  axles: DiagramAxle[];
  positions?: DiagramPosition[];
  /** Capa de color de los anillos; `null` = sin color. Sin `positions` la figura es una vista previa (ruedas sin estado). */
  layer: TireLayer | null;
  selected?: number | null;
  highlighted?: number[];
  /** Si viene, se dibuja la cabina adelante. El texto va en el `title` del bloque. */
  cabinLabel?: string;
  /** Si viene, se dibuja el enganche en ese extremo. El texto va en el `title` del bloque. */
  hitch?: TruckHitch;
  /** Interactiva: las ruedas son botones. Si no, son imágenes enfocables (se puede leer su detalle). */
  interactive?: boolean;
  /** Texto accesible de toda la figura. */
  label?: string;
  /**
   * Silueta de la carrocería. `truck` (por defecto) es el camión / tractor / semirremolque de siempre;
   * `pickup` y `machinery` dibujan su propia carrocería sobre los mismos ejes. Opcional: sin él, la
   * figura es idéntica a la de antes.
   */
  body?: TruckBody;
  /** Zonas del "gemelo del vehículo" (chasis, cabina, motor, enganche). Sin ellas no se dibuja nada extra. */
  zones?: TruckZones;
  /** Prefijo del `data-iso-id` de cada rueda (p. ej. `tire-`): permite que un id de rueda no choque con el de una zona. */
  wheelIdPrefix?: string;
  /** Dibuja el aro de selección en TODAS las ruedas (cuando el gemelo tiene seleccionada la zona de cubiertas). */
  selectAllWheels?: boolean;
  /**
   * Separación entre ejes consecutivos (de adelante hacia atrás: `axleGaps[0]` es entre el eje 1 y el 2).
   * Sin ella, dos ejes dobles seguidos van juntos (tándem) y el resto a distancia de eje delantero.
   */
  axleGaps?: number[];
}

/** Carrocería de la figura: ver `BuildTruckSvgInput.body`. */
export type TruckBody = 'truck' | 'pickup' | 'machinery';

/** Una zona clicable del vehículo: `data-iso-id`, texto accesible y estado (tono) con el que se pinta. */
export interface TruckZone {
  id: string;
  label: string;
  tone: TireTone;
  selected?: boolean;
}

/**
 * Zonas que se superponen a la carrocería. Cada una se dibuja como un `<g data-iso-id>` con su contorno
 * pintado con el tono de estado y, si el tono tiene color, un punto indicador.
 * - `documents`: chasis (largueros) en camión y semirremolque; paragolpe con placa en camioneta y maquinaria.
 * - `checklists`: cabina; en el semirremolque (sin cabina), el paragolpe trasero con las luces.
 * - `maintenance`: motor; en el semirremolque, el tren de rodaje (ejes).
 * - `hitch`: el enganche, si la figura lo dibuja (`hitch`).
 */
export interface TruckZones {
  documents?: TruckZone;
  checklists?: TruckZone;
  maintenance?: TruckZone;
  hitch?: TruckZone;
}

// ─── Distancia entre ejes ──────────────────────────────────────────────────

const GAP_TANDEM = 75;
const GAP_TWIN_STEER = 100;
const GAP_WHEELBASE = 140;

/**
 * Separación entre ejes consecutivos (de adelante hacia atrás) según cómo son los dos vecinos: dos dobles
 * forman tándem o trídem, dos simples seguidos son doble dirección y simple-doble es la distancia entre ejes.
 * La usan todas las vistas, así una misma configuración pone las ruedas en el mismo lugar en cualquier pantalla.
 */
export function defaultAxleGaps(regular: DiagramAxle[]): number[] {
  const dual = (axle: DiagramAxle) => axle.tires_per_side !== 1;
  return regular.slice(1).map((axle, index) => {
    const previous = regular[index];
    if (dual(previous) && dual(axle)) return GAP_TANDEM;
    if (!dual(previous) && !dual(axle)) return GAP_TWIN_STEER;
    return GAP_WHEELBASE;
  });
}

// ─── Utilidades ────────────────────────────────────────────────────────────

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface AxleSlot {
  axle: DiagramAxle;
  x: number;
  dual: boolean;
}

/** Descripción accesible de una posición con su dato de la capa. */
export function describePositionDetail(computed: ComputedPosition, data: DiagramPosition | undefined): string {
  const base = describePosition(computed);
  if (!data || data.tire_id === null) return `${base}: sin cubierta`;
  const parts = [
    data.tire_serial ? `cubierta ${data.tire_serial}` : 'con cubierta',
    data.tire_brand,
    data.tire_size,
    data.tread_depth_mm != null ? formatMm(data.tread_depth_mm) : null,
    data.pressure_psi != null ? formatPsi(data.pressure_psi) : null,
    data.retread_level ? RETREAD_LABELS[data.retread_level] : null,
  ].filter(Boolean);
  return `${base}: ${parts.join(', ')}`;
}

// ─── Constructor ───────────────────────────────────────────────────────────

export function buildTruckSvg({
  axles,
  positions = [],
  layer,
  selected = null,
  highlighted = [],
  cabinLabel,
  hitch,
  interactive = false,
  label,
  body: bodyInput,
  zones,
  wheelIdPrefix = '',
  selectAllWheels = false,
  axleGaps,
}: BuildTruckSvgInput): string {
  const body: TruckBody = bodyInput ?? 'truck';
  const computed = calculatePositions(axles);
  const dataByPosition = new Map(positions.map((p) => [p.position_number, p]));
  const highlightedSet = new Set(highlighted);
  const preview = positions.length === 0;

  const sorted = [...axles].sort((a, b) => a.axle_number - b.axle_number);
  const regular = sorted.filter((a) => !a.is_spare);
  const spareCount = sorted.length - regular.length;
  const hasCab = Boolean(cabinLabel);

  // ── Distribución en X: el eje 1 en x = 0, los demás hacia atrás. Dos ejes dobles seguidos = tándem (más juntos).
  const gaps = axleGaps ?? defaultAxleGaps(regular);
  const slots: AxleSlot[] = [];
  let cursor = 0;
  regular.forEach((axle, index) => {
    const dual = axle.tires_per_side !== 1;
    if (index > 0) {
      cursor -= gaps[index - 1] ?? GAP_WHEELBASE;
    }
    slots.push({ axle, x: cursor, dual });
  });
  const slotByAxle = new Map(slots.map((s) => [s.axle.axle_number, s]));
  const firstX = slots.length ? slots[0].x : 0;
  const lastX = slots.length ? slots[slots.length - 1].x : 0;

  const frontEnd =
    firstX +
    (body === 'pickup'
      ? 96
      : body === 'machinery'
        ? 64
        : hitch?.position === 'front' && !hasCab
          ? 200
          : hasCab
            ? 72
            : 50);
  const rearEnd =
    lastX - (body === 'pickup' ? 52 : body === 'machinery' ? 60 : Math.max(62, 36 + SPARE_PITCH * spareCount));
  const frameLen = frontEnd - rearEnd;
  const outerHalf = Math.max(LANE_SINGLE[1], ...slots.map((s) => (s.dual ? LANE_OUTER[1] : LANE_SINGLE[1])));
  const halfWidth = outerHalf + 6;

  // ── Cámara: entran el chasis, las ruedas, la cabina y los auxilios.
  const rise = [
    ...k.boxCorners({ x: rearEnd - 8, y: -halfWidth, w: frameLen + 16, d: halfWidth * 2, r: 2 }, 0, FRAME_TOP),
    // Puntos altos: techo de la cabina y auxilios acostados.
    ...(hasCab && body === 'truck' ? ([[frontEnd - 34, 0, 108]] as k.Point3[]) : []),
    ...(body === 'pickup' ? ([[frontEnd - 76, 0, 90]] as k.Point3[]) : []),
    ...(body === 'machinery' ? ([[firstX, 0, 100]] as k.Point3[]) : []),
    ...(spareCount ? ([[lastX - 56, 0, FRAME_TOP + TIRE_W + 2]] as k.Point3[]) : []),
  ];
  const P = k.fitProjection(rise, TRUCK_VIEW_WIDTH, TRUCK_VIEW_HEIGHT, { pad: 28, azimuth: AZIMUTH });
  // `lathe.mjs` no tiene tipos: sus puntos llegan como number[].
  const at = (p: number[]) => k.iso(p as k.Point3, P);
  const S = (paths: ReturnType<typeof k.slabOf>, style?: k.SolidStyle) => k.solidSvg(paths, style);
  const L = (d: string, style?: k.LineStyle) => k.lineSvg(d, style);
  const D = (pts: number[][], style?: { size?: number; tone?: k.Tone }) =>
    k.dotsSvg(pts as Array<[number, number]>, style);

  // ── Una cubierta: eje de giro dado por el marco F; la cara que mira a la cámara es s = TIRE_W.
  function tire(F: unknown, tone: TireTone, empty: boolean, isSelected: boolean, isHighlighted: boolean): string {
    const body: string[] = [];
    body.push(
      S(
        G.solidOf(
          [
            [0, 15],
            [1.2, 23.5, 1],
            [3, 26],
            [TIRE_W - 3, 26],
            [TIRE_W - 1.2, 23.5, 1],
            [TIRE_W, 15],
          ],
          F,
          P
        ),
        { tone: 'mid' }
      )
    );
    body.push(L(G.arcOf(F, TIRE_W * 0.5, TIRE_R, P), { tone: 'faint' }));
    body.push(S(G.disc(TIRE_W - 0.4, TIRE_W + 1.4, 15, F, P), { tone: 'hi', crease: 'lo' }));
    body.push(L(G.circleOf(F, TIRE_W + 1.4, 11, P, 40), { tone: 'lo' }));
    body.push(D(G.dotsOf(F, TIRE_W + 1.4, 7, 8, P, { all: true }), { size: 0.5 }));
    const out: string[] = [empty ? `<g style="opacity:.45">${body.join('')}</g>` : body.join('')];

    if (empty) {
      // Sin cubierta: anillo punteado, sin color de estado.
      out.push(
        `<path class="iso-line" data-tone="mid" data-dotted d="${G.circleOf(F, TIRE_W, 20.5, P, 48)}" style="stroke-width:2"/>`
      );
    } else {
      const colored = tone !== 'none';
      // Banda de la banda de rodamiento: se ve aunque el flanco quede tapado (cubiertas duales).
      out.push(
        `<path class="iso-line" data-tone="${colored ? tone : 'faint'}" d="${G.arcOf(F, TIRE_W * 0.5, TIRE_R, P)}" style="stroke-width:${colored ? 2.4 : 0.6};stroke-linecap:round"/>`
      );
      // Anillo de estado en el flanco.
      out.push(
        `<path data-ring class="iso-line" data-tone="${colored ? tone : 'mid'}" d="${G.circleOf(F, TIRE_W, 20.5, P, 48)}" style="stroke-width:${colored ? 3.6 : 1.4};stroke-linecap:round"/>`
      );
      out.push(D([at(G.pointOf(F, TIRE_W + 1.4, 0, 0))], { size: 0.8, tone: 'hi' }));
    }
    if (isHighlighted) {
      // Intervenida en esta orden: aro y punto en el centro.
      out.push(L(G.circleOf(F, TIRE_W + 1.4, 9, P, 32), { tone: 'hi' }));
      out.push(D([at(G.pointOf(F, TIRE_W + 1.4, 0, 0))], { size: 2.6, tone: 'hi' }));
    }
    if (isSelected) {
      out.push(
        `<path class="iso-line" data-tone="lit" d="${G.circleOf(F, TIRE_W, 24.4, P, 56)}" style="stroke-width:2.8;stroke-linecap:round"/>`
      );
    }
    return out.join('');
  }

  // ── Una posición (rueda de eje horizontal o auxilio acostado).
  function wheelGroup(cp: ComputedPosition, F: unknown): string {
    const data = dataByPosition.get(cp.position_number);
    // Sin datos de posiciones = vista previa de la configuración: ruedas normales, sin estado.
    const empty = !preview && (!data || data.tire_id === null);
    const tone = toneForLayer(layer, data);
    const isSelected = selected === cp.position_number;
    const text = describePositionDetail(cp, data);
    const aria = `${text}${highlightedSet.has(cp.position_number) ? ', intervenida en esta orden' : ''}${
      isSelected ? ', seleccionada' : ''
    }`;
    const attrs = interactive ? `role="button" aria-pressed="${isSelected}"` : `role="img"`;
    // Número de la posición: sobre la banda de rodamiento (se ve en todas, también en la rueda interior de un dual).
    const hub = G.pointOf(F, cp.side === 'SPARE' ? TIRE_W + 1.4 : TIRE_W / 2, 0, 0);
    const [bx, by] = at(cp.side === 'SPARE' ? hub : [hub[0], hub[1], hub[2] + TIRE_R + 0.5]);
    const badge = `<g aria-hidden="true" pointer-events="none"><circle cx="${bx}" cy="${by}" r="8.2" style="fill:var(--anatomy-paper);stroke:var(--anatomy-hi);stroke-width:.9"/><text x="${bx}" y="${by}" text-anchor="middle" dominant-baseline="central" style="fill:var(--anatomy-hi);font:600 9.5px var(--anatomy-mono);font-variant-numeric:tabular-nums">${cp.position_number}</text></g>`;
    return `<g data-iso-id="${wheelIdPrefix}${cp.position_number}" tabindex="0" ${attrs} aria-label="${esc(aria)}">${tire(
      F,
      tone,
      empty,
      isSelected || selectAllWheels,
      highlightedSet.has(cp.position_number)
    )}${badge}</g>`;
  }

  // ── Ruedas de los ejes: siempre con el eje hacia +y, así la cara visible es la que mira a la cámara.
  interface WheelItem {
    cp: ComputedPosition;
    side: 1 | -1;
    depth: number;
    F: unknown;
  }
  const wheels: WheelItem[] = [];
  const spares: Array<{ cp: ComputedPosition; depth: number; F: unknown }> = [];
  const spareOrder = computed.filter((c) => c.side === 'SPARE');

  for (const cp of computed) {
    if (cp.side === 'SPARE') continue;
    const slot = slotByAxle.get(cp.axle_number);
    if (!slot) continue;
    const lane = !slot.dual ? LANE_SINGLE : cp.dual_role === 'INNER' ? LANE_INNER : LANE_OUTER;
    const side: 1 | -1 = cp.side === 'LEFT' ? 1 : -1;
    const yMin = side === 1 ? lane[0] : -lane[1];
    const centerY = side * ((lane[0] + lane[1]) / 2);
    wheels.push({
      cp,
      side,
      depth: k.depthOf([slot.x, centerY, 0], P),
      F: G.frameAlong([slot.x, yMin, TIRE_R], [0, 1, 0]),
    });
  }
  spareOrder.forEach((cp, index) => {
    const x = lastX - 56 - SPARE_PITCH * index;
    spares.push({ cp, depth: k.depthOf([x, 0, FRAME_TOP], P), F: G.frameAlong([x, 0, FRAME_TOP], [0, 0, 1]) });
  });

  const farSide: 1 | -1 = k.depthOf([0, -100, 0], P) < k.depthOf([0, 100, 0], P) ? -1 : 1;
  const byDepth = <T extends { depth: number }>(list: T[]) => [...list].sort((a, b) => a.depth - b.depth);
  const farWheels = byDepth(wheels.filter((w) => w.side === farSide));
  const nearWheels = byDepth(wheels.filter((w) => w.side !== farSide));

  // ── Zonas del gemelo: grupo clicable + contorno del tono de estado + punto indicador.
  const zoneGroup = (zone: TruckZone, inner: string) =>
    `<g data-iso-id="${esc(zone.id)}" tabindex="0" role="button" aria-pressed="${Boolean(zone.selected)}" aria-label="${esc(zone.label)}">${inner}</g>`;
  /** Pinta `inner` dentro de la zona (si la figura la tiene); sin zona devuelve `inner` tal cual. */
  const wrap = (zone: TruckZone | undefined, inner: string) => (zone ? zoneGroup(zone, inner) : inner);
  /** Contorno grueso en el tono de la zona; seleccionada, con un borde blanco/negro debajo. Sin zona, nada. */
  const rim = (zone: TruckZone | undefined, d: string, width = 2.4) => {
    if (!zone) return '';
    const colored = zone.tone !== 'none';
    const stroke = (tone: string, w: number) =>
      `<path class="iso-line" data-tone="${tone}" d="${d}" style="stroke-width:${w};stroke-linecap:round;stroke-linejoin:round"/>`;
    return (
      (zone.selected ? stroke('lit', width + 2.6) : '') + stroke(colored ? zone.tone : 'mid', colored ? width : 0.9)
    );
  };
  /** Punto indicador del estado sobre la zona (un trazo de largo cero con extremos redondos). */
  const beacon = (zone: TruckZone | undefined, point: number[]) => {
    if (!zone || zone.tone === 'none') return '';
    const [sx, sy] = at(point);
    const dot = (tone: string, w: number) =>
      `<path class="iso-line" data-tone="${tone}" d="M${sx} ${sy}h.01" style="stroke-width:${w};stroke-linecap:round"/>`;
    return (zone.selected ? dot('lit', 11) : '') + dot(zone.tone, 7.5);
  };
  /** Rellena la huella con un polígono transparente: la zona se puede tocar aunque su dibujo sea fino. */
  const hit = (plan: k.Plan, z: number, h: number) =>
    `<path d="${k.slabOf(plan, z, h, P, 4).fill}" style="fill:transparent;stroke:none"/>`;

  // ── Chasis
  function chassis(): string {
    const out: string[] = [
      `<path class="iso-halo" d="${k.haloOf({ x: rearEnd - 4, y: -halfWidth - 4, w: frameLen + 8, d: (halfWidth + 4) * 2, r: 6 }, 0, 0.1, P)}" style="filter:blur(6px)"/>`,
    ];
    // Semirremolque (sin cabina ni carrocería propia): los ejes son su tren de rodaje.
    const trailerLike = body === 'truck' && !hasCab;

    // Ejes
    const axleParts: string[] = [];
    for (const slot of slots) {
      const half = (slot.dual ? LANE_OUTER[1] : LANE_SINGLE[1]) - 4;
      const F = G.frameAlong([slot.x, -half, TIRE_R], [0, 1, 0]);
      axleParts.push(S(G.disc(0, 2 * half, 5, F, P), { tone: 'lo', crease: 'none' }));
      axleParts.push(S(G.disc(half - 8, half + 8, 8.5, F, P), { tone: 'mid' }));
    }
    // Ejes motrices (con "tractor = eje motriz"): carcasa del diferencial y cardán entre ellos y hacia la cabina.
    const driveSlots = slots.filter((slot) => slot.axle.is_drive_axle);
    const driveParts: string[] = [];
    driveSlots.forEach((slot, index) => {
      const fromX = index === 0 ? (hasCab && body === 'truck' ? frontEnd - 68 : slot.x + 60) : driveSlots[index - 1].x;
      if (fromX - slot.x > 12) {
        const shaft: k.Plan = { x: slot.x, y: -2.5, w: fromX - slot.x, d: 5, r: 1 };
        driveParts.push(S(k.slabOf(shaft, 34, 5, P, 2, 0.3), { tone: 'lo', crease: 'none' }));
      }
      driveParts.push(S(k.cylinder(slot.x, 0, 10, 20, 13, P, 28), { tone: 'hi', crease: 'lo' }));
      driveParts.push(L(k.ring(slot.x, 0, 10, 33, P, 28), { tone: 'lo' }));
      driveParts.push(D([at([slot.x, 0, 33])], { size: 0.6, tone: 'hi' }));
    });
    axleParts.push(...driveParts);
    if (trailerLike && zones?.maintenance && slots.length) {
      const frontAxle = slots[0];
      axleParts.push(
        rim(
          zones.maintenance,
          k.lineOnTop([frontAxle.x, -LANE_SINGLE[0] + 4], [frontAxle.x, LANE_SINGLE[0] - 4], TIRE_R + 2, P),
          2.2
        )
      );
      axleParts.push(beacon(zones.maintenance, [lastX, 0, TIRE_R + 6]));
    }
    out.push(trailerLike ? wrap(zones?.maintenance, axleParts.join('')) : axleParts.join(''));

    // Paragolpe trasero con luces (semirremolque): zona de los desvíos del checklist.
    if (trailerLike && zones?.checklists) {
      const bumper: k.Plan = { x: rearEnd - 10, y: -halfWidth + 24, w: 8, d: (halfWidth - 24) * 2, r: 2 };
      out.push(
        wrap(
          zones.checklists,
          S(k.slabOf(bumper, 36, 18, P, 3, 0.4), { tone: 'mid' }) +
            rim(zones.checklists, k.planOutline(k.insetPlan(bumper, 0.5), 54, P, 3)) +
            beacon(zones.checklists, [bumper.x + 4, 0, 58])
        )
      );
    }

    // Largueros y travesaños (el chasis)
    const frameParts: string[] = [];
    for (const y of [-26, 20]) {
      frameParts.push(S(k.slabOf({ x: rearEnd, y, w: frameLen, d: 6, r: 1.5 }, 46, 13, P, 4, 0.6), { tone: 'mid' }));
      frameParts.push(L(k.lineOnTop([rearEnd + 4, y + 3], [frontEnd - 4, y + 3], FRAME_TOP, P), { tone: 'faint' }));
    }
    // Travesaños, repartidos a lo largo del chasis
    const crossCount = Math.max(3, Math.round(frameLen / 90));
    for (let i = 0; i < crossCount; i++) {
      const x = rearEnd + 10 + ((frameLen - 20) * i) / (crossCount - 1);
      frameParts.push(S(k.slabOf({ x: x - 3, y: -20, w: 6, d: 40, r: 1 }, 48, 9, P, 3, 0.4), { tone: 'lo' }));
    }
    // El chasis es la zona de documentación en camión y semirremolque; en camioneta y maquinaria, el paragolpe con la placa.
    const frameIsDocs = body === 'truck';
    if (frameIsDocs && zones?.documents) {
      for (const y of [-23, 23]) {
        frameParts.push(rim(zones.documents, k.lineOnTop([rearEnd + 2, y], [frontEnd - 2, y], FRAME_TOP, P), 2.2));
      }
      frameParts.push(beacon(zones.documents, [rearEnd + 26, 0, FRAME_TOP + 4]));
      frameParts.unshift(hit({ x: rearEnd, y: -26, w: frameLen, d: 52, r: 1.5 }, 46, 13));
    }
    out.push(frameIsDocs ? wrap(zones?.documents, frameParts.join('')) : frameParts.join(''));

    if (body === 'truck') {
      // Motor (solo con zonas): bloque detrás de la cabina, entre los largueros.
      if (hasCab && zones?.maintenance) {
        const engine: k.Plan = { x: frontEnd - 64 - 50, y: -17, w: 46, d: 34, r: 4 };
        const engineTop = FRAME_TOP + 17;
        const ribs: string[] = [];
        for (let i = 1; i <= 3; i++) {
          const x = engine.x + (engine.w * i) / 4;
          ribs.push(L(k.lineOnTop([x, engine.y + 3], [x, engine.y + engine.d - 3], engineTop, P), { tone: 'faint' }));
        }
        out.push(
          wrap(
            zones.maintenance,
            S(k.slabOf(engine, FRAME_TOP, 17, P, 4, 0.6), { tone: 'mid' }) +
              ribs.join('') +
              rim(zones.maintenance, k.planOutline(k.insetPlan(engine, 0.6), engineTop, P, 4)) +
              beacon(zones.maintenance, [engine.x + engine.w / 2, 0, engineTop + 5])
          )
        );
      }
      // Cabina
      if (hasCab) {
        const cab: k.Plan = { x: frontEnd - 64, y: -34, w: 62, d: 68, r: 6 };
        const cabTop = FRAME_TOP + 46;
        const cabInner =
          (zones?.checklists ? '' : `<title>${esc(cabinLabel ?? '')}</title>`) +
          S(k.slabOf(cab, FRAME_TOP, 46, P, 6, 1.2), { tone: 'mid' }) +
          S(k.slabOf({ x: frontEnd - 14, y: -28, w: 6, d: 56, r: 2 }, 66, 28, P, 3, 0.6), {
            tone: 'hi',
            crease: 'lo',
          }) +
          rim(zones?.checklists, k.planOutline(k.insetPlan(cab, 1), cabTop, P, 6)) +
          beacon(zones?.checklists, [frontEnd - 36, 0, cabTop + 4]);
        out.push(wrap(zones?.checklists, cabInner));
      }
    } else if (body === 'pickup') {
      const half = 38;
      const hood: k.Plan = { x: frontEnd - 44, y: -half, w: 44, d: half * 2, r: 8 };
      const cab: k.Plan = { x: frontEnd - 98, y: -half, w: 54, d: half * 2, r: 8 };
      const bedFront = cab.x;
      const bedLen = bedFront - rearEnd;
      // Caja: portón, pared lejana, piso, pared cercana (de atrás hacia adelante y de lejos a cerca).
      out.push(S(k.slabOf({ x: rearEnd, y: -half, w: 5, d: half * 2, r: 1.5 }, 30, 22, P, 3, 0.4), { tone: 'mid' }));
      out.push(S(k.slabOf({ x: rearEnd, y: -half, w: bedLen, d: 5, r: 1.5 }, 30, 22, P, 3, 0.4), { tone: 'mid' }));
      out.push(
        S(k.slabOf({ x: rearEnd, y: -half + 5, w: bedLen, d: half * 2 - 10, r: 1 }, 26, 6, P, 3, 0.2), { tone: 'lo' })
      );
      out.push(S(k.slabOf({ x: rearEnd, y: half - 5, w: bedLen, d: 5, r: 1.5 }, 30, 22, P, 3, 0.4), { tone: 'mid' }));
      // Cabina
      const cabTop = 26 + 56;
      out.push(
        wrap(
          zones?.checklists,
          S(k.slabOf(cab, 26, 56, P, 8, 1.2), { tone: 'mid' }) +
            S(k.slabOf({ x: cab.x + cab.w - 12, y: -half + 5, w: 6, d: (half - 5) * 2, r: 2 }, 56, 24, P, 3, 0.6), {
              tone: 'hi',
              crease: 'lo',
            }) +
            rim(zones?.checklists, k.planOutline(k.insetPlan(cab, 1), cabTop, P, 6)) +
            beacon(zones?.checklists, [cab.x + cab.w / 2 - 4, 0, cabTop + 4])
        )
      );
      // Capot (motor)
      const hoodTop = 26 + 24;
      out.push(
        wrap(
          zones?.maintenance,
          S(k.slabOf(hood, 26, 24, P, 8, 1), { tone: 'mid' }) +
            rim(zones?.maintenance, k.planOutline(k.insetPlan(hood, 1), hoodTop, P, 6)) +
            beacon(zones?.maintenance, [hood.x + hood.w / 2, 0, hoodTop + 4])
        )
      );
      out.push(bumperWithPlate());
    } else {
      // Maquinaria: cuerpo bajo, motor atrás, cabina adelante.
      const half = 36;
      const lower: k.Plan = { x: rearEnd, y: -half, w: frontEnd - rearEnd, d: half * 2, r: 8 };
      out.push(S(k.slabOf(lower, 28, 22, P, 8, 0.8), { tone: 'mid' }));
      const engine: k.Plan = { x: rearEnd + 2, y: -half + 4, w: 78, d: (half - 4) * 2, r: 8 };
      const engineTop = 50 + 20;
      out.push(
        wrap(
          zones?.maintenance,
          S(k.slabOf(engine, 50, 20, P, 8, 1), { tone: 'mid' }) +
            rim(zones?.maintenance, k.planOutline(k.insetPlan(engine, 1), engineTop, P, 6)) +
            beacon(zones?.maintenance, [engine.x + engine.w / 2, 0, engineTop + 4])
        )
      );
      const cab: k.Plan = { x: firstX - 30, y: -27, w: 62, d: 54, r: 6 };
      const cabTop = 50 + 40;
      out.push(
        wrap(
          zones?.checklists,
          S(k.slabOf(cab, 50, 40, P, 6, 1.2), { tone: 'mid' }) +
            S(k.slabOf({ x: cab.x + cab.w - 10, y: -22, w: 5, d: 44, r: 2 }, 62, 22, P, 3, 0.6), {
              tone: 'hi',
              crease: 'lo',
            }) +
            rim(zones?.checklists, k.planOutline(k.insetPlan(cab, 1), cabTop, P, 6)) +
            beacon(zones?.checklists, [cab.x + cab.w / 2 - 4, 0, cabTop + 4])
        )
      );
      out.push(bumperWithPlate());
    }

    // Enganche
    if (hitch) {
      const label = esc(hitch.label);
      const hz = zones?.hitch;
      const titleOrNothing = hz ? '' : `<title>${label}</title>`;
      if (hitch.position === 'rear' && hasCab && slots.length) {
        // Quinta rueda sobre el tándem trasero.
        const fifthX = slots.length > 1 ? (lastX + slots[slots.length - 2].x) / 2 : lastX;
        const plate: k.Plan = { x: fifthX - 26, y: -22, w: 52, d: 44, r: 8 };
        out.push(
          wrap(
            hz,
            titleOrNothing +
              S(k.slabOf(plate, FRAME_TOP, 5, P, 6, 0.8), { tone: 'hi', crease: 'lo' }) +
              D([at([fifthX + 2, 0, FRAME_TOP + 5]), at([fifthX - 14, 0, FRAME_TOP + 5])], { size: 0.6 }) +
              rim(hz, k.planOutline(k.insetPlan(plate, 0.8), FRAME_TOP + 5, P, 6)) +
              beacon(hz, [fifthX, 0, FRAME_TOP + 10])
          )
        );
      } else if (hitch.position === 'front' && !hasCab) {
        // Perno rey: plato de acople en la punta delantera.
        const pinX = frontEnd - 34;
        const plate: k.Plan = { x: pinX - 22, y: -20, w: 44, d: 40, r: 8 };
        out.push(
          wrap(
            hz,
            titleOrNothing +
              S(k.slabOf(plate, FRAME_TOP, 5, P, 6, 0.8), { tone: 'hi', crease: 'lo' }) +
              S(k.cylinder(pinX, 0, 4, FRAME_TOP + 5, 6, P, 16), { tone: 'mid', crease: 'lo' }) +
              rim(hz, k.planOutline(k.insetPlan(plate, 0.8), FRAME_TOP + 5, P, 6)) +
              beacon(hz, [pinX, 0, FRAME_TOP + 16])
          )
        );
      } else {
        // Barra de tiro con ojal hacia el otro vehículo.
        const sign = hitch.position === 'front' ? 1 : -1;
        const baseX = hitch.position === 'front' ? frontEnd : rearEnd;
        const bar: k.Plan = { x: sign === 1 ? baseX - 2 : baseX - 30, y: -5, w: 32, d: 10, r: 2 };
        const eyeX = sign === 1 ? baseX + 26 : baseX - 26;
        out.push(
          wrap(
            hz,
            titleOrNothing +
              S(k.slabOf(bar, 46, 8, P, 3, 0.4), { tone: 'mid' }) +
              S(k.cylinder(eyeX, 0, 6, 46, 8, P, 16), { tone: 'hi', crease: 'lo' }) +
              rim(hz, k.planOutline(k.insetPlan(bar, 0.5), 54, P, 3), 2.2) +
              beacon(hz, [eyeX, 0, 58])
          )
        );
      }
    }
    return out.join('');
  }

  /** Paragolpe delantero con la placa (camioneta y maquinaria): zona de documentación. */
  function bumperWithPlate(): string {
    const bumper: k.Plan = { x: frontEnd - 1, y: -40, w: 7, d: 80, r: 2 };
    const plate: k.Plan = { x: frontEnd + 5.5, y: -14, w: 1.5, d: 28, r: 0.5 };
    return wrap(
      zones?.documents,
      S(k.slabOf(bumper, 24, 12, P, 3, 0.4), { tone: 'mid' }) +
        S(k.slabOf(plate, 27, 7, P, 2, 0), { tone: 'hi', crease: 'lo' }) +
        rim(zones?.documents, k.planOutline(k.insetPlan(bumper, 0.5), 36, P, 3)) +
        beacon(zones?.documents, [bumper.x + 3, 0, 41])
    );
  }

  const spareCradles = spares.map((s) => {
    const cp = s.cp;
    return wheelGroup(cp, s.F);
  });

  const aria =
    label ??
    `Vehículo de ${regular.length} ${regular.length === 1 ? 'eje' : 'ejes'}${spareCount ? ' con auxilio' : ''} en perspectiva isométrica; cada cubierta es un círculo con un anillo cuyo color indica su estado.`;

  const svg = k.figureSvg({
    width: TRUCK_VIEW_WIDTH,
    height: TRUCK_VIEW_HEIGHT,
    label: aria,
    body: [
      farWheels.map((w) => wheelGroup(w.cp, w.F)).join(''),
      chassis(),
      spareCradles.join(''),
      nearWheels.map((w) => wheelGroup(w.cp, w.F)).join(''),
    ],
  });
  // El SVG de la skill viene como `img`, que oculta a los hijos para lectores de pantalla: las
  // cubiertas son botones, así que el contenedor pasa a ser un grupo.
  return svg.replace(' role="img"', ' role="group"');
}
