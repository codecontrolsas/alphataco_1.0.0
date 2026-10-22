import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

type ChipTone = 'brand' | 'warn' | 'danger';

// Clases completas (Tailwind no ve las que se arman con fragmentos en runtime).
const BADGE_TONE: Record<ChipTone, string> = {
  brand: 'border-brand/30 bg-brand-subtle text-brand-subtle-foreground',
  warn: 'border-warn/40 bg-warn-subtle text-warn-subtle-foreground',
  danger: 'border-danger/40 bg-danger-subtle text-danger-subtle-foreground',
};

/** Etiqueta chica dentro de un chip de equipo seleccionado ("Otro Equipo", "No asignado", condición…). */
export function ChipBadge({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <Badge variant="outline" className={cn('ml-1 text-[10px] px-1 py-0', BADGE_TONE[tone])}>
      {children}
    </Badge>
  );
}

/** Agrega o quita un id de la selección de un campo múltiple. */
export function toggleId(current: string[] | undefined, id: string): string[] {
  const values = current ?? [];
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

interface EquipmentChipProps {
  className: string;
  label: string;
  /** Texto para el nombre accesible del botón de quitar. */
  removeName: string;
  onRemove: () => void;
  disabled?: boolean;
  children?: ReactNode;
}

/** Chip de un equipo ya elegido en el campo: número, etiquetas de estado y botón para quitarlo. */
export function EquipmentChip({ className, label, removeName, onRemove, disabled, children }: EquipmentChipProps) {
  return (
    <div className={cn('text-xs px-2 py-1 rounded-md flex items-center gap-1', className)}>
      {label}
      {children}
      <button
        type="button"
        aria-label={`Quitar ${removeName}`}
        onClick={onRemove}
        disabled={disabled}
        className="ml-1 rounded-sm hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
