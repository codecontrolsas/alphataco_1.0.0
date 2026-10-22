import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import { ABSENCE_BADGE_CLASS, absenceLevel, formatAbsencePercent } from '../lib/absence-level';

/** Porcentaje de ausentismo en un badge cuyo color depende del nivel. */
export function AbsencePercentCell({ value }: { value: number | null | undefined }) {
  return (
    <div>
      <span className={`rounded px-2 py-1 text-xs font-medium ${ABSENCE_BADGE_CLASS[absenceLevel(value)]}`}>
        {formatAbsencePercent(value)}
      </span>
    </div>
  );
}

/** Botón "Ver ausentes" de la fila de las tablas de ausentismo. */
export function ViewAbsentButton({
  ariaLabel,
  disabled,
  onClick,
}: {
  ariaLabel: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className="gap-1.5"
    >
      <Users className="h-3.5 w-3.5" />
      Ver ausentes
    </Button>
  );
}
