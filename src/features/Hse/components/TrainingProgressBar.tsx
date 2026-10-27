import { cn } from '@/lib/utils';

/**
 * Avance de una capacitación: barra + "aprobaron de total". Los números van en texto (la barra sola no se lee con
 * lector de pantalla ni en blanco y negro). Mismo formato que `ComplianceBar` de los documentos.
 */
export function TrainingProgressBar({
  passed,
  total,
  className,
}: {
  passed: number;
  total: number;
  className?: string;
}) {
  if (total === 0) return <span className="text-sm text-muted-foreground">Sin asignar</span>;
  const percent = Math.round((passed / total) * 100);
  return (
    <div className={cn('min-w-36 space-y-1', className)}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`${passed} de ${total} aprobaron`}
      >
        <div className="h-full rounded-full bg-ok" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">{passed}</span> de {total} aprobaron
      </p>
    </div>
  );
}
