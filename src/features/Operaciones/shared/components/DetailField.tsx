import type { ReactNode } from 'react';

/** Campo etiquetado del detalle de una línea (etiqueta en mayúsculas + valor). */
export function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/** Valor vacío del detalle. */
export function EmptyValue() {
  return <span className="text-muted-foreground">—</span>;
}
