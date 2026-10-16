import type { DiagramAxle } from '@/features/Mantenimiento/Gomeria/shared/TireDiagramRenderer';
import { inferTemplateLayout } from '@/features/Mantenimiento/Gomeria/shared/iso/axle-layout';

interface MiniAxle {
  id: string;
  axle_number: number;
  tires_per_side: number;
  is_spare: boolean;
  is_drive_axle?: boolean;
  tire_size?: string | null;
}

// Vista superior, frente arriba. Unidades del viewBox; la separación entre ejes sale de la misma regla que la
// vista previa isométrica (`inferTemplateLayout`), escalada para que entre en una fila de tabla.
const WIDTH = 64;
const CENTER = WIDTH / 2;
const WHEEL_W = 6;
const WHEEL_H = 8.5;
const GAP_SCALE = 0.16;
const SPARE_R = 5.2;
const FRONT_PAD = 6;

/** Centros (x) de las ruedas de un lado: una simple, o interior y exterior si es dual. */
const wheelCenters = (dual: boolean) => (dual ? [15, 22] : [19]);

/**
 * Mini diagrama de una plantilla para la tabla: misma forma que la vista previa (cabina sobre el eje delantero,
 * tándem pegado, perno rey en el semirremolque, diferencial y cardán en los ejes motrices, quinta rueda en el
 * tractor y el auxilio donde lo dice su lugar en la secuencia). Es decorativo (`aria-hidden`): la cantidad de ejes
 * y posiciones se dice en texto.
 */
export function TemplateAxlesMini({ axles }: { axles: MiniAxle[] }) {
  if (axles.length === 0) {
    return <span className="text-muted-foreground text-xs italic">Sin ejes</span>;
  }

  const diagramAxles: DiagramAxle[] = axles.map((axle) => ({
    id: axle.id,
    axle_number: axle.axle_number,
    tires_per_side: axle.tires_per_side,
    tire_size: axle.tire_size ?? null,
    is_drive_axle: axle.is_drive_axle ?? false,
    is_spare: axle.is_spare,
  }));
  const layout = inferTemplateLayout(diagramAxles);
  const regular = diagramAxles.filter((axle) => !axle.is_spare).sort((a, b) => a.axle_number - b.axle_number);
  const spares = diagramAxles.filter((axle) => axle.is_spare).sort((a, b) => a.axle_number - b.axle_number);
  if (!layout || regular.length === 0) return <span className="text-muted-foreground text-xs italic">Sin ejes</span>;

  const hasCab = layout.kind !== 'trailer';

  // Posición (y) de cada eje, de adelante hacia atrás. El eje delantero deja lugar arriba para la cabina o el perno rey.
  const spareAnchorOf = (spare: DiagramAxle) => regular.filter((r) => r.axle_number < spare.axle_number).length;
  const frontSpares = hasCab ? 0 : spares.filter((spare) => spareAnchorOf(spare) === 0).length;
  const firstY = FRONT_PAD + (hasCab ? 12 : 28 + Math.max(0, frontSpares - 1) * (SPARE_R * 2 + 2));
  const ys: number[] = [firstY];
  regular.slice(1).forEach((_, index) => {
    let gap = (layout.axleGaps[index] ?? 160) * GAP_SCALE;
    // Entre dos ejes que llevan un auxilio hace falta lugar (igual que en la figura isométrica).
    const hasSpareBetween = spares.some((spare) => {
      const anchor = regular.filter((r) => r.axle_number < spare.axle_number).length;
      return anchor === index + 1;
    });
    if (hasSpareBetween) gap = Math.max(gap, 150 * GAP_SCALE);
    ys.push(ys[index] + gap);
  });
  const lastY = ys[ys.length - 1];

  // Auxilios: entre ejes, bajo la trompa (semirremolque), detrás de la cabina (camión / tractor) o al final.
  const spareYs: number[] = [];
  const rearIndex = { value: 0 };
  const frontIndex = { value: 0 };
  spares.forEach((spare) => {
    const anchor = spareAnchorOf(spare);
    if (anchor > 0 && anchor < regular.length) spareYs.push((ys[anchor - 1] + ys[anchor]) / 2);
    else if (hasCab && regular.length >= 2) spareYs.push((ys[0] + ys[1]) / 2);
    else if (anchor === 0 && !hasCab) spareYs.push(firstY - 13 - frontIndex.value++ * (SPARE_R * 2 + 2));
    else spareYs.push(lastY + 13 + rearIndex.value++ * (SPARE_R * 2 + 2));
  });
  const bottom = Math.max(lastY + WHEEL_H / 2 + 3, ...spareYs.map((y) => y + SPARE_R + 2));
  const height = Math.ceil(bottom + 2);

  const driveYs = regular.flatMap((axle, index) => (axle.is_drive_axle ? [ys[index]] : []));
  const lastDriveY = driveYs.length > 0 ? Math.max(...driveYs) : null;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="h-auto max-h-28 w-14 shrink-0"
      style={{ aspectRatio: `${WIDTH} / ${height}` }}
    >
      {/* Largueros */}
      <g className="stroke-border" strokeWidth={1.4} strokeLinecap="round">
        <line x1={CENTER - 4.5} x2={CENTER - 4.5} y1={FRONT_PAD + 2} y2={lastY + 4} />
        <line x1={CENTER + 4.5} x2={CENTER + 4.5} y1={FRONT_PAD + 2} y2={lastY + 4} />
      </g>

      {/* Cabina sobre el eje delantero, o perno rey del semirremolque */}
      {hasCab ? (
        <rect
          x={CENTER - 11}
          y={FRONT_PAD - 4}
          width={22}
          height={16}
          rx={3.5}
          className="fill-muted stroke-border"
          strokeWidth={1}
        />
      ) : (
        <circle cx={CENTER} cy={FRONT_PAD + 3} r={3} className="fill-muted-foreground/70" />
      )}

      {/* Cardán: de la cabina al último eje motriz */}
      {lastDriveY !== null && (
        <line
          x1={CENTER}
          x2={CENTER}
          y1={firstY}
          y2={lastDriveY}
          className="stroke-muted-foreground/60"
          strokeWidth={1.6}
        />
      )}

      {/* Quinta rueda del tractor, sobre el tándem trasero */}
      {layout.kind === 'tractor' && (
        <rect
          x={CENTER - 7}
          y={(ys[ys.length - 1] + ys[Math.max(0, ys.length - 2)]) / 2 - 4.5}
          width={14}
          height={9}
          rx={3}
          className="fill-background stroke-muted-foreground/70"
          strokeWidth={1}
        />
      )}

      {/* Ejes y ruedas */}
      {regular.map((axle, index) => {
        const y = ys[index];
        const dual = axle.tires_per_side !== 1;
        const centers = wheelCenters(dual);
        const edge = Math.max(...centers) + WHEEL_W / 2;
        return (
          <g key={axle.id}>
            <line
              x1={CENTER - edge + WHEEL_W}
              x2={CENTER + edge - WHEEL_W}
              y1={y}
              y2={y}
              className="stroke-muted-foreground/50"
              strokeWidth={1.6}
            />
            {centers.flatMap((offset) =>
              [-1, 1].map((side) => (
                <rect
                  key={`${side}-${offset}`}
                  x={CENTER + side * offset - WHEEL_W / 2}
                  y={y - WHEEL_H / 2}
                  width={WHEEL_W}
                  height={WHEEL_H}
                  rx={1.6}
                  className="fill-muted-foreground/65"
                />
              ))
            )}
            {axle.is_drive_axle && <circle cx={CENTER} cy={y} r={3.2} className="fill-foreground/80" />}
          </g>
        );
      })}

      {/* Auxilios */}
      {spareYs.map((y, index) => (
        <g key={`spare-${index}`}>
          <circle
            cx={CENTER}
            cy={y}
            r={SPARE_R}
            className="fill-background stroke-muted-foreground/70"
            strokeWidth={1.8}
          />
          <circle cx={CENTER} cy={y} r={1.6} className="fill-muted-foreground/70" />
        </g>
      ))}
    </svg>
  );
}
