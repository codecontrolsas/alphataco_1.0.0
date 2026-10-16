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

// Esqueleto visto desde arriba, frente arriba. Unidades del viewBox; la separación entre ejes sale de la misma
// regla que la vista previa isométrica (`inferTemplateLayout`), escalada para que entre en una fila de tabla.
const WIDTH = 56;
const CENTER = WIDTH / 2;
const RAIL = 5; // mitad de la trocha del chasis
const WHEEL_W = 5.5;
const WHEEL_H = 9;
const GAP_SCALE = 0.17;
const SPARE_R = 4.6;
const TOP = 7; // lugar para el frente (paragolpe o perno rey)

/** Centro (distancia al eje del chasis) de las ruedas de un lado: una simple, o interior y exterior si es dual. */
const wheelOffsets = (dual: boolean) => (dual ? [16, 22] : [19]);

/**
 * Mini esqueleto de una plantilla para la tabla, visto desde arriba: largueros con travesaños, un eje por fila con sus
 * ruedas (los duales con dos por lado), diferencial y cardán en los ejes motrices, quinta rueda en el tractor, perno
 * rey en el semirremolque y el auxilio donde lo dice su lugar en la secuencia. Es decorativo (`aria-hidden`): la
 * cantidad de ejes y posiciones se dice en texto.
 */
export function TemplateAxlesMini({ axles }: { axles: MiniAxle[] }) {
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
  if (!layout || regular.length === 0) {
    return <span className="text-muted-foreground text-xs italic">Sin ejes</span>;
  }

  const trailer = layout.kind === 'trailer';
  const anchorOf = (spare: DiagramAxle) => regular.filter((r) => r.axle_number < spare.axle_number).length;
  const frontSpares = trailer ? spares.filter((spare) => anchorOf(spare) === 0).length : 0;

  // Posición (y) de cada eje, de adelante hacia atrás. Un semirremolque deja lugar delante del primer eje para el perno rey y el auxilio.
  const firstY = TOP + (trailer ? 14 + frontSpares * (SPARE_R * 2 + 3) : 11);
  const ys: number[] = [firstY];
  regular.slice(1).forEach((_, index) => {
    let gap = (layout.axleGaps[index] ?? 160) * GAP_SCALE;
    // Entre dos ejes con un auxilio hace falta lugar (igual que en la figura isométrica).
    if (spares.some((spare) => anchorOf(spare) === index + 1)) gap = Math.max(gap, 150 * GAP_SCALE);
    ys.push(ys[index] + gap);
  });
  const lastY = ys[ys.length - 1];

  // Auxilios: entre ejes, bajo la trompa (semirremolque), detrás de la cabina (camión / tractor) o al final.
  const spareYs: number[] = [];
  let front = 0;
  let rear = 0;
  for (const spare of spares) {
    const anchor = anchorOf(spare);
    if (anchor > 0 && anchor < regular.length) spareYs.push((ys[anchor - 1] + ys[anchor]) / 2);
    else if (!trailer && regular.length >= 2) spareYs.push((ys[0] + ys[1]) / 2);
    else if (anchor === 0 && trailer) spareYs.push(firstY - 12 - front++ * (SPARE_R * 2 + 3));
    else spareYs.push(lastY + 14 + rear++ * (SPARE_R * 2 + 3));
  }
  const bottom = Math.max(lastY + WHEEL_H / 2 + 3, ...spareYs.map((y) => y + SPARE_R + 2));
  const height = Math.ceil(bottom + 2);

  const driveYs = regular.flatMap((axle, index) => (axle.is_drive_axle ? [ys[index]] : []));
  const driveFrom = Math.min(...driveYs, Infinity);
  const driveTo = Math.max(...driveYs, -Infinity);
  const railEnd = Math.max(lastY + 6, ...spareYs.map((y) => y + SPARE_R));

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="h-auto max-h-28 w-14 shrink-0"
      style={{ aspectRatio: `${WIDTH} / ${height}` }}
    >
      {/* Largueros y travesaños (uno por eje) */}
      <g className="stroke-border" strokeWidth={1.5} strokeLinecap="round">
        <line x1={CENTER - RAIL} x2={CENTER - RAIL} y1={TOP} y2={railEnd} />
        <line x1={CENTER + RAIL} x2={CENTER + RAIL} y1={TOP} y2={railEnd} />
        {ys.map((y, index) => (
          <line
            key={index}
            x1={CENTER - RAIL}
            x2={CENTER + RAIL}
            y1={y - WHEEL_H / 2 - 1.5}
            y2={y - WHEEL_H / 2 - 1.5}
            strokeWidth={1.1}
          />
        ))}
      </g>

      {/* Frente: paragolpe en los camiones, perno rey en el semirremolque */}
      {trailer ? (
        <circle cx={CENTER} cy={TOP + 3} r={3} className="fill-muted-foreground/75" />
      ) : (
        <line
          x1={CENTER - RAIL - 2}
          x2={CENTER + RAIL + 2}
          y1={TOP}
          y2={TOP}
          className="stroke-muted-foreground/70"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      )}

      {/* Cardán: entre los ejes motrices */}
      {Number.isFinite(driveFrom) && (
        <line
          x1={CENTER}
          x2={CENTER}
          y1={Math.max(TOP + 2, driveFrom - (layout.kind === 'tractor' || !trailer ? 14 : 0))}
          y2={driveTo}
          className="stroke-muted-foreground/60"
          strokeWidth={1.8}
        />
      )}

      {/* Quinta rueda del tractor, sobre el tándem trasero */}
      {layout.kind === 'tractor' && (
        <rect
          x={CENTER - 6}
          y={(ys[ys.length - 1] + ys[Math.max(0, ys.length - 2)]) / 2 - 4}
          width={12}
          height={8}
          rx={2.5}
          className="fill-none stroke-muted-foreground/70"
          strokeWidth={1.1}
        />
      )}

      {/* Ejes y ruedas */}
      {regular.map((axle, index) => {
        const y = ys[index];
        const offsets = wheelOffsets(axle.tires_per_side !== 1);
        const inner = offsets[0] - WHEEL_W / 2;
        return (
          <g key={axle.id}>
            <line
              x1={CENTER - inner}
              x2={CENTER + inner}
              y1={y}
              y2={y}
              className="stroke-muted-foreground/60"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
            {offsets.flatMap((offset) =>
              [-1, 1].map((side) => (
                <rect
                  key={`${side}-${offset}`}
                  x={CENTER + side * offset - WHEEL_W / 2}
                  y={y - WHEEL_H / 2}
                  width={WHEEL_W}
                  height={WHEEL_H}
                  rx={1.7}
                  className="fill-muted-foreground/70"
                />
              ))
            )}
            {axle.is_drive_axle && <circle cx={CENTER} cy={y} r={3} className="fill-foreground/80" />}
          </g>
        );
      })}

      {/* Auxilios: aro con cubo, sobre el chasis */}
      {spareYs.map((y, index) => (
        <g key={`spare-${index}`}>
          <circle
            cx={CENTER}
            cy={y}
            r={SPARE_R}
            className="fill-background stroke-muted-foreground/75"
            strokeWidth={1.9}
          />
          <circle cx={CENTER} cy={y} r={1.5} className="fill-muted-foreground/75" />
        </g>
      ))}
    </svg>
  );
}
