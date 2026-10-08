'use client';

import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type RowActionBase = {
  id: string;
  /** Texto del ítem del menú y tooltip del ícono ("Editar"). */
  label: string;
  icon: LucideIcon;
  /** `danger`: ícono `danger-ghost` y, en el menú, al final tras un separador. */
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Por qué está deshabilitada: se muestra en el ítem del menú o en el tooltip del ícono. */
  disabledReason?: string;
};

/** Una acción de fila: navega (`href`) o actúa (`onSelect`). Nunca un ítem inerte. */
type RowAction = RowActionBase &
  ({ onSelect: () => void; href?: never } | { href: string; onSelect?: never });

type RowActionsProps = {
  /** Acciones YA filtradas por permisos y por estado de la fila: `RowActions` no decide permisos. */
  actions: RowAction[];
  /** Identidad de la fila ("Pérez Juan"): arma los nombres accesibles ("Acciones de «Pérez Juan»"). */
  rowLabel: string;
  /** Ids que se ven como ícono en desktop (máx. 2); el resto va al ⋯. Con 1 o 2 acciones van todas como ícono. */
  inline?: string[];
  /** `'menu'` = solo el ⋯ de 44×44 (tarjeta mobile del DataTable). Default `'auto'`. */
  layout?: 'auto' | 'menu';
  className?: string;
};

const MAX_INLINE = 2;
const NO_IDS: string[] = [];

type InlineActionProps = { action: RowAction; rowLabel: string };

function InlineAction({ action, rowLabel }: InlineActionProps) {
  const Icon = action.icon;
  const accessibleName = `${action.label} «${rowLabel}»`;
  const tooltip = action.disabled && action.disabledReason ? `${action.label}: ${action.disabledReason}` : action.label;
  const variant = action.tone === 'danger' ? 'danger-ghost' : 'ghost';
  const icon = <Icon strokeWidth={1.75} aria-hidden="true" />;

  let control: React.ReactNode;
  if (action.disabled) {
    // `aria-disabled` (no `disabled`): sigue enfocable y el motivo llega por el tooltip y el nombre accesible.
    control = (
      <Button
        type="button"
        variant={variant}
        size="icon-sm"
        aria-disabled="true"
        aria-label={action.disabledReason ? `${accessibleName}: ${action.disabledReason}` : accessibleName}
        className="cursor-not-allowed opacity-50 hover:bg-transparent"
      >
        {icon}
      </Button>
    );
  } else if (action.href !== undefined) {
    control = (
      <Button asChild variant={variant} size="icon-sm">
        <Link href={action.href} aria-label={accessibleName}>
          {icon}
        </Link>
      </Button>
    );
  } else {
    control = (
      <Button type="button" variant={variant} size="icon-sm" aria-label={accessibleName} onClick={action.onSelect}>
        {icon}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

type MenuActionItemProps = {
  action: RowAction;
  onDeferSelect: (run: () => void) => void;
};

function MenuActionItem({ action, onDeferSelect }: MenuActionItemProps) {
  const Icon = action.icon;
  const variant = action.tone === 'danger' ? 'destructive' : 'default';
  const content = (
    <>
      <Icon strokeWidth={1.75} aria-hidden="true" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{action.label}</span>
        {action.disabled && action.disabledReason ? (
          <span className="text-caption text-muted-foreground">{action.disabledReason}</span>
        ) : null}
      </span>
    </>
  );

  if (action.href !== undefined && !action.disabled) {
    return (
      <DropdownMenuItem asChild variant={variant}>
        <Link href={action.href}>{content}</Link>
      </DropdownMenuItem>
    );
  }

  const run = action.onSelect;
  return (
    <DropdownMenuItem
      variant={variant}
      disabled={action.disabled}
      onSelect={run ? () => onDeferSelect(run) : undefined}
    >
      {content}
    </DropdownMenuItem>
  );
}

/**
 * Acciones de una fila: hasta 2 íconos con tooltip + menú ⋯ con el resto (DISENO.md §4.6, decisión 7.11).
 * Siempre visibles (no dependen del hover). Si `actions` viene vacío no renderiza nada.
 */
function RowActions({ actions, rowLabel, inline = NO_IDS, layout = 'auto', className }: RowActionsProps) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  // Acción elegida en el menú: corre cuando el menú terminó de cerrarse (ver `handleCloseAutoFocus`).
  const pendingRef = React.useRef<(() => void) | null>(null);

  if (actions.length === 0) return null;

  let inlineActions: RowAction[] = [];
  let menuActions: RowAction[] = actions;
  if (layout === 'auto') {
    if (actions.length <= MAX_INLINE) {
      inlineActions = actions;
      menuActions = [];
    } else {
      const inlineIds = new Set(inline.slice(0, MAX_INLINE));
      inlineActions = actions.filter((action) => inlineIds.has(action.id));
      menuActions = actions.filter((action) => !inlineIds.has(action.id));
    }
  }

  const regularMenuActions = menuActions.filter((action) => action.tone !== 'danger');
  const dangerMenuActions = menuActions.filter((action) => action.tone === 'danger');

  const deferSelect = (run: () => void) => {
    pendingRef.current = run;
  };

  // Correr la acción en el mismo tick del select deja el body con `pointer-events: none` si abre un dialog
  // (Radix). Se corre al cerrar el menú, con el foco ya devuelto al ⋯: el dialog que abra lo devuelve ahí.
  const handleCloseAutoFocus = (event: Event) => {
    const run = pendingRef.current;
    if (!run) return;
    pendingRef.current = null;
    event.preventDefault();
    triggerRef.current?.focus();
    run();
  };

  return (
    // El clic no sube a la fila o tarjeta (que abre el detalle): tampoco el de los ítems del menú, que en el árbol
    // de React son hijos de este div aunque se rendericen en un portal. La navegación de los `Link` no se toca.
    <div
      data-slot="row-actions"
      className={cn('flex items-center justify-end gap-0.5', className)}
      onClick={(event) => event.stopPropagation()}
    >
      {inlineActions.length > 0 ? (
        <TooltipProvider>
          {inlineActions.map((action) => (
            <InlineAction key={action.id} action={action} rowLabel={rowLabel} />
          ))}
        </TooltipProvider>
      ) : null}
      {menuActions.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={triggerRef}
              type="button"
              variant="ghost"
              size={layout === 'menu' ? 'icon' : 'icon-sm'}
              aria-label={`Acciones de «${rowLabel}»`}
              className={layout === 'menu' ? 'size-11' : undefined}
            >
              <MoreHorizontal strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-72" onCloseAutoFocus={handleCloseAutoFocus}>
            {regularMenuActions.map((action) => (
              <MenuActionItem key={action.id} action={action} onDeferSelect={deferSelect} />
            ))}
            {regularMenuActions.length > 0 && dangerMenuActions.length > 0 ? <DropdownMenuSeparator /> : null}
            {dangerMenuActions.map((action) => (
              <MenuActionItem key={action.id} action={action} onDeferSelect={deferSelect} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export { RowActions, type RowAction, type RowActionsProps };
