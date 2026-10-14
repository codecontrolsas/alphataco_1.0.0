'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Eye, History, Pencil, Trash2, UserCog, type LucideIcon } from 'lucide-react';
import moment from 'moment';
import type { DailyReportDetailRow } from '../types';
import type { Permissions, RowActionHandlers } from './types';

// ============================================================================
// ROW ACTIONS CELL
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
  const isToday = moment(reportDate).isSame(moment(), 'day');
  const isFutureDate = moment(reportDate).isAfter(moment(), 'day');
  // Editar: no permitir si ejecutado (salvo hoy) ni en_certificacion
  const canEdit = permissions.canUpdate && row.status !== 'en_certificacion' && (row.status !== 'ejecutado' || isToday);
  // Asignar recursos: misma elegibilidad que editar, pero gobernada por su propio permiso
  const canAssignResources =
    permissions.canAssignResources && row.status !== 'en_certificacion' && (row.status !== 'ejecutado' || isToday);
  // Eliminar: solo si fecha hoy, futura, o status sin_recursos_asignados
  const canDelete = permissions.canDelete && (isToday || isFutureDate || row.status === 'sin_recursos_asignados');

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center justify-end gap-0.5">
        <RowAction label="Ver detalle" icon={Eye} onClick={() => handlers.onViewDetail(row)} />

        {/* Editar — solo si canUpdate Y (status no ejecutado O parte es hoy) */}
        {canEdit && <RowAction label="Editar" icon={Pencil} onClick={() => handlers.onEdit(row)} />}

        {/* Asignar recursos — solo con el permiso assign_resources (Supervisor de Operaciones) */}
        {canAssignResources && (
          <RowAction
            label="Asignar recursos"
            icon={UserCog}
            onClick={() => handlers.onAssignResources(row)}
            className="text-brand-ink hover:text-brand-ink"
          />
        )}

        <RowAction label="Historial" icon={History} onClick={() => handlers.onHistory(row)} />

        {/* Eliminar — solo si canDelete (fecha hoy/futura o sin_recursos) */}
        {canDelete && (
          <RowAction
            label="Eliminar"
            icon={Trash2}
            onClick={() => handlers.onDelete(row)}
            className="text-danger-subtle-foreground hover:text-danger-subtle-foreground"
          />
        )}
      </div>
    </TooltipProvider>
  );
}

/** Botón de acción de fila: ícono, tooltip y nombre accesible con el mismo texto. */
function RowAction({
  label,
  icon: Icon,
  onClick,
  className,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          className={cn('text-muted-foreground hover:text-foreground', className)}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
