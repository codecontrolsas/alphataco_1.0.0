import type { ComplianceCounts } from '../lib/document-compliance.server';

interface Segment {
  key: string;
  value: number;
  /** Clase `stroke-*` de un token del sistema (nunca colores fijos). */
  stroke: string;
}

const RADIUS = 15.9155; // circunferencia = 100: los porcentajes son directamente el largo del trazo.

/**
 * Donut SVG de dos o tres tramos (en regla / vencidos / faltantes). Decorativo: el texto equivalente
 * (leyenda con cantidades) lo pone el widget, por eso va `aria-hidden`. Sin JavaScript en el cliente.
 */
export function ComplianceDonut({ counts }: { counts: ComplianceCounts }) {
  const segments: Segment[] = [
    { key: 'complete', value: counts.complete, stroke: 'stroke-ok' },
    { key: 'expired', value: counts.expired, stroke: 'stroke-warn' },
    { key: 'incomplete', value: counts.incomplete, stroke: 'stroke-danger' },
  ];

  let offset = 0;
  return (
    <div className="relative size-32 shrink-0" aria-hidden="true">
      <svg viewBox="0 0 36 36" className="size-full -rotate-90">
        <circle cx="18" cy="18" r={RADIUS} fill="none" strokeWidth="4" className="stroke-muted" />
        {segments.map((segment) => {
          const length = counts.total === 0 ? 0 : (segment.value / counts.total) * 100;
          const circle = (
            <circle
              key={segment.key}
              cx="18"
              cy="18"
              r={RADIUS}
              fill="none"
              strokeWidth="4"
              strokeDasharray={`${length} ${100 - length}`}
              strokeDashoffset={-offset}
              className={segment.stroke}
            />
          );
          offset += length;
          return length > 0 ? circle : null;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl leading-none font-semibold tabular-nums">
          {counts.total === 0 ? '0' : Math.round((counts.complete / counts.total) * 100)}
          {counts.total === 0 ? '' : <span className="text-muted-foreground text-sm">%</span>}
        </span>
        <span className="text-muted-foreground mt-1 text-xs">en regla</span>
      </div>
    </div>
  );
}
