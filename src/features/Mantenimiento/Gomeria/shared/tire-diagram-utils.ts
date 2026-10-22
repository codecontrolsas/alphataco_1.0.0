// Shared tire diagram types and utilities — usable from both client and server

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DiagramAxle {
  id: string;
  axle_number: number;
  tires_per_side: number; // 1 (single) or 2 (dual)
  tire_size: string | null;
  is_drive_axle: boolean;
  is_spare: boolean;
}

export interface DiagramPosition {
  position_number: number;
  axle_number: number;
  side: 'LEFT' | 'RIGHT' | 'SPARE';
  tire_id: string | null;
  tire_serial?: string;
  tire_brand?: string;
  tire_size?: string;
  /** Profundidad de dibujo de la cubierta montada, en mm. */
  tread_depth_mm?: number;
  /** Última presión medida de la cubierta montada, en psi (último servicio con medición). */
  pressure_psi?: number;
  /** Nivel de recapado: `null` = sin recapar; `undefined` = no se informó. */
  retread_level?: 'FIRST' | 'SECOND' | 'THIRD' | null;
}

export interface TireDiagramHitch {
  /** Texto del extremo del chasis, p. ej. "Enganche AB730HJ" o "Tractor AF023BN". */
  label: string;
  /** Extremo donde se conecta: la cabina está adelante, el enganche atrás. */
  position: 'front' | 'rear';
}

export interface ComputedPosition {
  position_number: number;
  axle_number: number;
  side: 'LEFT' | 'RIGHT' | 'SPARE';
  /** For dual axles: 'INNER' | 'OUTER', for single/spare: undefined */
  dual_role?: 'INNER' | 'OUTER';
  /** Lugar del eje entre los ejes reales (1..N, sin contar auxilios); `axle_number` puede incluir las filas de auxilio. */
  axle_ordinal?: number;
}

// ─── Position Calculation ──────────────────────────────────────────────────

/**
 * Given an array of axles, compute sequential positions.
 *
 * Regular axles (is_spare = false), sorted by axle_number:
 *   - tires_per_side = 1 → 2 positions: LEFT, RIGHT
 *   - tires_per_side = 2 → 4 positions: LEFT-OUTER, LEFT-INNER, RIGHT-INNER, RIGHT-OUTER
 *
 * Spare axles (is_spare = true), sorted by axle_number:
 *   - 1 position: SPARE
 */
export function calculatePositions(axles: DiagramAxle[]): ComputedPosition[] {
  const sorted = [...axles].sort((a, b) => a.axle_number - b.axle_number);
  const regularAxles = sorted.filter((a) => !a.is_spare);
  const spareAxles = sorted.filter((a) => a.is_spare);

  const positions: ComputedPosition[] = [];
  let counter = 1;

  for (const [axleIndex, axle] of regularAxles.entries()) {
    const axle_ordinal = axleIndex + 1;
    if (axle.tires_per_side === 1) {
      positions.push({ position_number: counter++, axle_number: axle.axle_number, axle_ordinal, side: 'LEFT' });
      positions.push({ position_number: counter++, axle_number: axle.axle_number, axle_ordinal, side: 'RIGHT' });
    } else {
      positions.push({
        position_number: counter++,
        axle_number: axle.axle_number,
        axle_ordinal,
        side: 'LEFT',
        dual_role: 'OUTER',
      });
      positions.push({
        position_number: counter++,
        axle_number: axle.axle_number,
        axle_ordinal,
        side: 'LEFT',
        dual_role: 'INNER',
      });
      positions.push({
        position_number: counter++,
        axle_number: axle.axle_number,
        axle_ordinal,
        side: 'RIGHT',
        dual_role: 'INNER',
      });
      positions.push({
        position_number: counter++,
        axle_number: axle.axle_number,
        axle_ordinal,
        side: 'RIGHT',
        dual_role: 'OUTER',
      });
    }
  }

  for (const axle of spareAxles) {
    positions.push({ position_number: counter++, axle_number: axle.axle_number, side: 'SPARE' });
  }

  return positions;
}

// ─── Descripciones de texto ────────────────────────────────────────────────

/** "Posición 3 · Eje 2 · izquierda exterior" (o "Posición 9 · Auxilio"). */
export function describePosition(position: ComputedPosition): string {
  if (position.side === 'SPARE') return `Posición ${position.position_number} · Auxilio`;
  const side = position.side === 'LEFT' ? 'izquierda' : 'derecha';
  const role = position.dual_role === 'INNER' ? ' interior' : position.dual_role === 'OUTER' ? ' exterior' : '';
  return `Posición ${position.position_number} · Eje ${position.axle_ordinal ?? position.axle_number} · ${side}${role}`;
}

/** Descripción de una posición por número, a partir de los ejes del vehículo. */
export function describePositionNumber(positionNumber: number, axles: DiagramAxle[]): string {
  const found = calculatePositions(axles).find((p) => p.position_number === positionNumber);
  return found ? describePosition(found) : `Posición ${positionNumber}`;
}
