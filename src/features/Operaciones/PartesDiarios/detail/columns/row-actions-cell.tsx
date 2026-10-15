'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Clock, Eye, FileText, MoreHorizontal, Pencil, Trash2, UserCog } from 'lucide-react';
import { canAssignRow, canDeleteRow, canEditRow, canManageRemitosRow } from '../lib/row-permissions';
import type { DailyReportDetailRow } from '../types';
import type { Permissions, RowActionHandlers } from './types';

// ============================================================================
// ROW ACTIONS CELL — menú ⋯ con las mismas acciones y la misma elegibilidad que antes
// (la elegibilidad vive en `lib/row-permissions.ts`)
// ============================================================================

export function RowActionsCell({
  row,
  permissions,
  handlers,
  reportDate,
}: {
  row: DailyReportDetailRow;
  permissions: Permissions;
  handlers: RowActionHandlers;
  reportDate: string;
}) {
  const canEdit = canEditRow(row, permissions, reportDate);
  const canAssignResources = canAssignRow(row, permissions, reportDate);
  const canManageRemitos = canManageRemitosRow(row, permissions);
  const canDelete = canDeleteRow(row, permissions, reportDate);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Acciones de la línea">
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* Ver detalle — siempre visible */}
        <DropdownMenuItem onSelect={() => handlers.onViewDetail(row)}>
          <Eye aria-hidden="true" />
          Ver detalle
        </DropdownMenuItem>

        {/* Editar — solo si canUpdate Y (status no ejecutado O parte es hoy) */}
        {canEdit && (
          <DropdownMenuItem onSelect={() => handlers.onEdit(row)}>
            <Pencil aria-hidden="true" />
            Editar
          </DropdownMenuItem>
        )}

        {/* Asignar recursos — solo con el permiso assign_resources (Supervisor de Operaciones) */}
        {canAssignResources && (
          <DropdownMenuItem onSelect={() => handlers.onAssignResources(row)}>
            <UserCog aria-hidden="true" />
            Asignar recursos
          </DropdownMenuItem>
        )}

        {/* Remitos — línea ejecutada o en certificación, con permiso de edición */}
        {canManageRemitos && (
          <DropdownMenuItem onSelect={() => handlers.onManageRemitos(row)}>
            <FileText aria-hidden="true" />
            Remitos
          </DropdownMenuItem>
        )}

        {/* Historial — siempre visible */}
        <DropdownMenuItem onSelect={() => handlers.onHistory(row)}>
          <Clock aria-hidden="true" />
          Historial
        </DropdownMenuItem>

        {/* Eliminar — solo si canDelete (fecha hoy/futura o sin_recursos) */}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => handlers.onDelete(row)}>
              <Trash2 aria-hidden="true" />
              Eliminar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
