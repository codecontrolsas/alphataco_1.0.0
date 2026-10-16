import type { DiagramAxle } from '../tire-diagram-utils';
import { defaultAxleGaps, type TruckBody, type TruckHitch } from './truck-geometry';

/** Tipo de vehículo que se deduce de la configuración de ejes. */
export type TemplateKind = 'pickup' | 'rigid-truck' | 'tractor' | 'trailer';

export interface TemplateLayout {
  kind: TemplateKind;
  /** Nombre corto del tipo: "Tractor con quinta rueda". */
  title: string;
  /** Fórmula de tracción, p. ej. `6×4` (solo si hay ejes motrices marcados). */
  traction: string | null;
  body: TruckBody;
  /** Texto de la cabina; sin él no se dibuja cabina (semirremolque). */
  cabinLabel?: string;
  hitch?: TruckHitch;
  /** Separación entre ejes consecutivos, de adelante hacia atrás. */
  axleGaps: number[];
  /** Cantidades para el texto de la vista previa. */
  counts: { axles: number; positions: number; spares: number };
}

/** Cuántas posiciones de rueda tiene la configuración: 2 por eje simple, 4 por eje doble y 1 por auxilio. */
function countPositions(axles: DiagramAxle[]) {
  return axles.reduce((total, axle) => total + (axle.is_spare ? 1 : axle.tires_per_side === 1 ? 2 : 4), 0);
}

/**
 * Deduce cómo se arma el vehículo a partir de sus ejes, con las convenciones habituales del transporte:
 * - Todos los ejes simples y dos ejes: camioneta (cabina y caja).
 * - Sin ejes motrices marcados y todos dobles: semirremolque (perno rey adelante, sin cabina, ejes en tándem o trídem).
 * - Eje delantero simple (dirección) y el resto doble: camión con cabina. Con ejes motrices y tren trasero doble,
 *   y son tres ejes, es tractor con quinta rueda sobre el tándem; con 2 ejes o doble dirección es camión rígido.
 * - Dos ejes simples seguidos adelante: doble dirección (8×4), un poco más juntos que el resto.
 * Los auxilios no cambian el tipo: van acostados sobre el chasis, detrás del último eje.
 */
export function inferTemplateLayout(axles: DiagramAxle[]): TemplateLayout | null {
  const regular = axles.filter((axle) => !axle.is_spare).sort((a, b) => a.axle_number - b.axle_number);
  const spares = axles.length - regular.length;
  if (regular.length === 0) return null;

  const dual = (axle: DiagramAxle) => axle.tires_per_side !== 1;
  const driveCount = regular.filter((axle) => axle.is_drive_axle).length;
  const allDual = regular.every(dual);
  const allSingle = regular.every((axle) => !dual(axle));
  const counts = { axles: regular.length, positions: countPositions(axles), spares };
  const traction = driveCount > 0 ? `${regular.length * 2}×${driveCount * 2}` : null;

  const axleGaps = defaultAxleGaps(regular);

  if (allSingle && regular.length <= 2) {
    return { kind: 'pickup', title: 'Camioneta', traction, body: 'pickup', axleGaps, counts };
  }
  if (driveCount === 0 && allDual) {
    return {
      kind: 'trailer',
      title: regular.length === 1 ? 'Acoplado de un eje' : 'Semirremolque',
      traction: null,
      body: 'truck',
      hitch: { label: 'Perno rey', position: 'front' },
      axleGaps,
      counts,
    };
  }
  // Tractor: tres ejes con tracción y tren trasero doble (6×4 / 6×2). Con 2 ejes o doble dirección (8×4) se asume camión rígido.
  if (driveCount > 0 && regular.length === 3 && dual(regular[regular.length - 1])) {
    return {
      kind: 'tractor',
      title: 'Tractor con quinta rueda',
      traction,
      body: 'truck',
      cabinLabel: 'Cabina',
      hitch: { label: 'Quinta rueda', position: 'rear' },
      axleGaps,
      counts,
    };
  }
  return { kind: 'rigid-truck', title: 'Camión', traction, body: 'truck', cabinLabel: 'Cabina', axleGaps, counts };
}

/** Texto de resumen para el pie de la vista previa. */
export function describeTemplateLayout(layout: TemplateLayout): string {
  const { axles, positions, spares } = layout.counts;
  const parts = [
    layout.traction ? `${layout.title} ${layout.traction}` : layout.title,
    `${axles} ${axles === 1 ? 'eje' : 'ejes'}`,
    `${positions} ${positions === 1 ? 'posición' : 'posiciones'}`,
  ];
  if (spares > 0) parts.push(`${spares} ${spares === 1 ? 'auxilio' : 'auxilios'}`);
  return parts.join(' · ');
}
