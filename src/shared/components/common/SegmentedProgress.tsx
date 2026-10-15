import { cn } from '@/lib/utils';

export interface ProgressSegment {
  key: string;
  label: string;
  value: number;
  /** Clase de color de fondo escrita completa (ej. `bg-ok`). */
  className: string;
}

interface SegmentedProgressProps {
  segments: ProgressSegment[];
  total: number;
  label: string;
  className?: string;
}

/** Barra de progreso segmentada. El ancho dinámico es el único `style`; los colores llegan como clases completas. */
export function SegmentedProgress({ segments, total, label, className }: SegmentedProgressProps) {
  const summary = segments.map((segment) => `${segment.label}: ${segment.value}`).join(', ');

  return (
    <div
      role="img"
      aria-label={`${label}. ${summary}. Total: ${total}`}
      className={cn('bg-muted flex h-2 w-full overflow-hidden rounded-full', className)}
    >
      {total > 0
        ? segments
            .filter((segment) => segment.value > 0)
            .map((segment) => (
              <span
                key={segment.key}
                className={cn('h-full', segment.className)}
                style={{ width: `${(segment.value / total) * 100}%` }}
              />
            ))
        : null}
    </div>
  );
}
