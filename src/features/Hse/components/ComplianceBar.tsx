import { cn } from '@/lib/utils';

/**
 * Avance de aceptación de un documento: barra + "aceptados de total". Los números van siempre en texto (la barra sola
 * no se lee con lector de pantalla ni en blanco y negro).
 */
export function ComplianceBar({
  compliance,
  className,
}: {
  compliance: { pending: number; accepted: number; rejected: number };
  className?: string;
}) {
  const total = compliance.pending + compliance.accepted + compliance.rejected;
  if (total === 0) return <span className="text-sm text-muted-foreground">Sin destinatarios</span>;
  const percent = Math.round((compliance.accepted / total) * 100);
  return (
    <div className={cn('min-w-36 space-y-1', className)}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`${compliance.accepted} de ${total} aceptaron`}
      >
        <div className="h-full rounded-full bg-ok" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">{compliance.accepted}</span> de {total} aceptaron
        {compliance.pending > 0 && ` · ${compliance.pending} pendientes`}
        {compliance.rejected > 0 && ` · ${compliance.rejected} rechazos`}
      </p>
    </div>
  );
}
