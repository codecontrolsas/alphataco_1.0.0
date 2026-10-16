'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import moment from 'moment';
import { getContrastTextColor } from '../lib/color-contrast';

interface DiagramCellProps {
  /** Novedad del día; `null` = sin novedad cargada (casilla vacía, con borde punteado). */
  diagramType: { name: string | null; short_description: string; color: string } | null;
  /** Día de la casilla (UTC: las fechas `@db.Date` llegan como medianoche UTC). */
  date: Date | string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  /** Se antepone al nombre accesible (por ejemplo, el empleado de la fila) para que la casilla se entienda sola. */
  ariaPrefix?: string;
  /** Con `false`, una casilla solo lectura no es parada de tabulación (grillas con cientos de casillas). */
  focusable?: boolean;
  /** Comentario del día: se muestra en el tooltip. */
  comment?: string | null;
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'h-7 w-9 text-[10px]',
  md: 'h-9 w-12 text-xs',
  lg: 'h-12 w-16 text-sm',
} as const;

/**
 * Casilla de un día del calendario de diagramas: color de la novedad con texto de contraste, o borde punteado si no
 * hay novedad. Es un botón solo si recibe `onClick`.
 */
export function DiagramCell({
  diagramType,
  date,
  size = 'md',
  onClick,
  ariaPrefix,
  focusable = true,
  comment,
  className,
}: DiagramCellProps) {
  const formattedDate = moment.utc(date).format('DD/MM/YYYY');
  const namePrefix = ariaPrefix ? `${ariaPrefix}, ` : '';

  if (!diagramType) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          'border-muted-foreground/30 hover:border-muted-foreground/60 focus-visible:ring-ring rounded border border-dashed outline-none focus-visible:ring-2',
          SIZE_CLASSES[size],
          onClick ? 'cursor-pointer' : 'cursor-default',
          className
        )}
        aria-label={`${namePrefix}Sin novedad, ${formattedDate}`}
      />
    );
  }

  const label = diagramType.name ?? diagramType.short_description;
  const interactive = Boolean(onClick);
  const cellClassName = cn(
    'focus-visible:ring-ring relative flex items-center justify-center rounded font-medium transition-shadow outline-none',
    SIZE_CLASSES[size],
    interactive ? 'hover:ring-primary/40 cursor-pointer hover:ring-2 focus-visible:ring-2' : 'cursor-default',
    className
  );
  const style = { background: diagramType.color, color: getContrastTextColor(diagramType.color) };
  const content = diagramType.short_description;
  const accessibleName = `${namePrefix}${label}, ${formattedDate}${comment ? `, ${comment}` : ''}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Sin acción es una imagen enfocable y no un botón deshabilitado: un botón `disabled` no abre el tooltip. */}
        {interactive ? (
          <button type="button" onClick={onClick} aria-label={accessibleName} className={cellClassName} style={style}>
            {content}
          </button>
        ) : (
          <span
            role="img"
            tabIndex={focusable ? 0 : -1}
            aria-label={accessibleName}
            className={cellClassName}
            style={style}
          >
            {content}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">{label}</p>
        <p className="text-xs opacity-80">{formattedDate}</p>
        {comment && <p className="max-w-56 text-xs">{comment}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
