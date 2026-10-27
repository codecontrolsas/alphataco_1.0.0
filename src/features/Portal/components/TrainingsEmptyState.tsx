import { GraduationCap } from 'lucide-react';

/**
 * "Mis capacitaciones" sin capacitaciones vigentes: no hay ninguna publicada que le aplique (o HSE está apagado).
 * Estado vacío honesto: no se inventan filas de ejemplo.
 */
export function TrainingsEmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? 'flex items-start gap-3'
          : 'flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center'
      }
    >
      <span className="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-full">
        <GraduationCap aria-hidden="true" className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">No tenés capacitaciones asignadas</p>
        <p className="text-muted-foreground text-sm text-pretty">
          Cuando la empresa te asigne una capacitación, vas a ver acá el material y el examen.
        </p>
      </div>
    </div>
  );
}
