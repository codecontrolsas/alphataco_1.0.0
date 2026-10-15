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

export interface OrderMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Acción que descarta o rechaza: va separada y en rojo. */
  destructive?: boolean;
}

interface OrderActionsMenuProps {
  /** Identificador del pedido para el nombre accesible ("Más acciones para AB093KH"). */
  resourceLabel: string;
  items: OrderMenuItem[];
}

/**
 * Menú ⋯ de acciones de una fila de pedidos. Las acciones que el usuario no puede ejecutar NO se pasan
 * (se ocultan, nunca se muestran deshabilitadas); la columna de acciones en sí no se oculta.
 */
export function OrderActionsMenu({ resourceLabel, items }: OrderActionsMenuProps) {
  if (items.length === 0) return null;

  const regular = items.filter((item) => !item.destructive);
  const destructive = items.filter((item) => item.destructive);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={`Más acciones para ${resourceLabel}`}>
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {regular.map((item) => (
          <DropdownMenuItem key={item.key} onSelect={item.onSelect}>
            <item.icon aria-hidden="true" />
            {item.label}
          </DropdownMenuItem>
        ))}
        {regular.length > 0 && destructive.length > 0 ? <DropdownMenuSeparator /> : null}
        {destructive.map((item) => (
          <DropdownMenuItem key={item.key} variant="destructive" onSelect={item.onSelect}>
            <item.icon aria-hidden="true" />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
