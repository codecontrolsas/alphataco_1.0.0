interface LoadPreviewProps {
  employeeCount: number;
  dayCount: number;
}

/** «N empleados × M días = K registros»: lo que va a generar la carga antes de revisarla. */
export function LoadPreview({ employeeCount, dayCount }: LoadPreviewProps) {
  if (employeeCount === 0 || dayCount === 0) return null;

  return (
    <p className="bg-muted/40 text-muted-foreground rounded-lg border px-4 py-3 text-sm" aria-live="polite">
      <span className="text-foreground font-semibold tabular-nums">
        {employeeCount} {employeeCount === 1 ? 'empleado' : 'empleados'}
      </span>{' '}
      ×{' '}
      <span className="text-foreground font-semibold tabular-nums">
        {dayCount} {dayCount === 1 ? 'día' : 'días'}
      </span>{' '}
      ={' '}
      <span className="text-brand-ink font-semibold tabular-nums">
        {employeeCount * dayCount} {employeeCount * dayCount === 1 ? 'registro' : 'registros'}
      </span>
    </p>
  );
}
