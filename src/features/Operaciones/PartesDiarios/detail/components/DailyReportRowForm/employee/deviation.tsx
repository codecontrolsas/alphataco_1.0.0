import { TriangleAlert } from 'lucide-react';
import type { EmployeeDeviation } from '../../../../actions/validation.server';
import { deviationText, employeeDeviations } from '../../../../lib/resource-deviations';

/** Contexto de avisos de desvío compartido por los selectores de la sección */
export interface DeviationContext {
  rowId?: string | null;
  savedEmployeeIds: string[];
  getEmployeeDeviation?: (employeeId: string, rowId: string) => EmployeeDeviation | null;
}

/** Textos de desvío de un empleado ya guardado (el aviso "No asignado" se muestra aparte con su badge) */
export function getSavedDeviationLabels(employeeId: string, ctx: DeviationContext): string[] {
  if (!ctx.rowId || !ctx.getEmployeeDeviation || !ctx.savedEmployeeIds.includes(employeeId)) return [];
  const deviation = ctx.getEmployeeDeviation(employeeId, ctx.rowId);
  if (!deviation) return [];
  return employeeDeviations(deviation)
    .filter((entry) => entry.kind !== 'unassigned_to_client')
    .map(deviationText);
}

export function DeviationNotice({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {labels.map((label) => (
        <li key={label} className="text-warn-subtle-foreground flex items-center gap-1 text-xs">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
