import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { EmployeeForForm } from '../../../form-data.server';
import { DeviationNotice } from './deviation';

interface SelectedEmployeeItemProps {
  employee: EmployeeForForm;
  roleLabel: string;
  isAssigned: boolean;
  deviationLabels: string[];
  onRemove: () => void;
}

/** Persona elegida: avatar de iniciales, "[legajo] Apellido Nombre · rol", avisos y botón quitar */
export function SelectedEmployeeItem({
  employee,
  roleLabel,
  isAssigned,
  deviationLabels,
  onRemove,
}: SelectedEmployeeItemProps) {
  const initials = `${employee.lastname?.[0] ?? ''}${employee.firstname?.[0] ?? ''}`.toUpperCase();
  const fullName = `[${employee.file}] ${employee.lastname} ${employee.firstname}`;

  return (
    <li className="bg-background flex items-center gap-3 rounded-md border px-3 py-2">
      <span
        aria-hidden="true"
        className="bg-brand-subtle text-brand-subtle-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium">
          {fullName}
          <span className="text-muted-foreground font-normal"> · {roleLabel}</span>
        </p>
        {!isAssigned && (
          <Badge variant="outline" className="border-warn/40 bg-warn-subtle text-warn-subtle-foreground text-[10px]">
            No asignado al cliente
          </Badge>
        )}
        <DeviationNotice labels={deviationLabels} />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        aria-label={`Quitar a ${fullName}`}
        onClick={onRemove}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </li>
  );
}
