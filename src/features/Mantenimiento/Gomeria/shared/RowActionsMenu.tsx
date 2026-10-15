'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';

export interface RowAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Acción destructiva: va al final, separada y en rojo. */
  destructive?: boolean;
}

/**
 * Menú ⋯ de acciones de una fila de Gomería. El llamador arma solo las acciones que el usuario puede ejecutar
 * (cada una con la misma clave de permiso que exige el servidor); sin acciones no se dibuja nada.
 */
export function RowActionsMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  if (actions.length === 0) return null;

  const regular = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={label}>
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {regular.map((action) => (
          <DropdownMenuItem key={action.key} onSelect={action.onSelect}>
            <action.icon aria-hidden="true" />
            {action.label}
          </DropdownMenuItem>
        ))}
        {regular.length > 0 && destructive.length > 0 ? <DropdownMenuSeparator /> : null}
        {destructive.map((action) => (
          <DropdownMenuItem key={action.key} variant="destructive" onSelect={action.onSelect}>
            <action.icon aria-hidden="true" />
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
