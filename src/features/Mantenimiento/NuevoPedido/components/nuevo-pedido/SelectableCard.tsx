'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { MaintenanceResourceKind } from '@/features/Mantenimiento/shared/maintenance-resource';
import { cn } from '@/lib/utils';
import { Check, Lock, type LucideIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { REQUEST_TYPE_ORDER, type RequestType } from './types';

/** Orden visual del paso "Recurso" — lo usa la navegación por flechas */
export const RESOURCE_KIND_ORDER: MaintenanceResourceKind[] = ['vehicle', 'other_equipment'];

/**
 * Tope de opciones que se renderizan en el selector de recursos.
 * Con ~370 vehículos, pintarlos todos en el popover traba el tipeo.
 */
export const MAX_RESOURCE_RESULTS = 50;

export interface SelectableCardProps<T extends string> {
  value: T;
  /** Orden visual del grupo, para mover el foco con las flechas */
  order: readonly T[];
  icon: LucideIcon;
  title: string;
  description: string;
  selected: boolean;
  onSelect: (value: T) => void;
  /**
   * Si viene, la opción queda bloqueada pero SIGUE siendo focusable y navegable
   * con las flechas. Se usa `aria-disabled` y no `disabled` a propósito: con
   * `disabled` el control sale del orden de foco y el motivo se vuelve
   * inalcanzable por teclado y por lector de pantalla.
   */
  disabledReason?: string;
}

/**
 * Tarjeta seleccionable de un radiogroup.
 *
 * Es un `radio` real a nivel de accesibilidad: se alcanza con Tab (solo la
 * seleccionada está en el orden de tabulación), se mueve con las flechas y se
 * activa con Enter o Espacio. Antes eran `<Card onClick>` sin foco ni teclado.
 */
export function SelectableCard<T extends string>({
  value,
  order,
  icon: Icon,
  title,
  description,
  selected,
  onSelect,
  disabledReason,
}: SelectableCardProps<T>) {
  const isDisabled = Boolean(disabledReason);
  const reasonId = `${value}-disabled-reason`;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      // El bloqueo se implementa acá: `aria-disabled` no lo aplica por sí solo
      if (isDisabled) return;
      onSelect(value);
      return;
    }

    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !backward) return;

    event.preventDefault();
    const total = order.length;
    const nextIndex = (order.indexOf(value) + (forward ? 1 : -1) + total) % total;
    const nextValue = order[nextIndex];
    event.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-card-value="${nextValue}"]`)?.focus();
  };

  return (
    <Card
      role="radio"
      aria-checked={selected}
      aria-disabled={isDisabled || undefined}
      aria-describedby={isDisabled ? reasonId : undefined}
      tabIndex={selected ? 0 : -1}
      data-card-value={value}
      onClick={() => !isDisabled && onSelect(value)}
      onKeyDown={handleKeyDown}
      className={cn(
        'transition-colors outline-none',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        isDisabled ? 'cursor-not-allowed bg-muted/40 opacity-70' : 'cursor-pointer hover:border-primary/50',
        selected && !isDisabled && 'border-primary bg-primary/5'
      )}
    >
      <CardContent className="p-4 flex items-start gap-3">
        <Icon aria-hidden="true" className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-sm text-muted-foreground text-pretty">{description}</p>
          {/* Motivo visible, no tooltip: tiene que poder leerse sin hover */}
          {isDisabled && (
            <p id={reasonId} className="mt-1.5 flex items-start gap-1.5 text-sm text-muted-foreground text-pretty">
              <Lock aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
              {disabledReason}
            </p>
          )}
        </div>
        {/* Siempre presente: si se montara solo al seleccionar, la tarjeta cambiaría de layout */}
        <Check className={cn('h-4 w-4 ml-auto shrink-0 text-primary', !selected && 'invisible')} />
      </CardContent>
    </Card>
  );
}

/**
 * Tarjeta del paso "Tipo de pedido".
 *
 * `order` es opcional porque el grupo cambia de tamaño: con equipamientos no se
 * ofrece "Mant. Preventivo" (ticket 654) y la navegación por flechas tiene que
 * recorrer solo las tarjetas visibles.
 */
export function RequestTypeCard(
  props: Omit<SelectableCardProps<RequestType>, 'value' | 'order'> & {
    type: RequestType;
    order?: readonly RequestType[];
  }
) {
  const { type, order = REQUEST_TYPE_ORDER, ...rest } = props;
  return <SelectableCard<RequestType> value={type} order={order} {...rest} />;
}

/** Tarjeta del paso "Recurso" (ticket 596) */
export function ResourceKindCard(
  props: Omit<SelectableCardProps<MaintenanceResourceKind>, 'value' | 'order'> & { kind: MaintenanceResourceKind }
) {
  const { kind, ...rest } = props;
  return <SelectableCard<MaintenanceResourceKind> value={kind} order={RESOURCE_KIND_ORDER} {...rest} />;
}
