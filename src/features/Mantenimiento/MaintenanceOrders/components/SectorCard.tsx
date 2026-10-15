'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Hand,
  Loader2,
  UserPlus,
  XCircle,
} from 'lucide-react';
import React, { useId, useState } from 'react';
import { REPAIR_STATUS_UI, TONE_TO_BADGE } from '../../lib/status-presentation';
import type { SectorStatus } from './SectorTimeline';

interface TaskInfo {
  id: string;
  repairTypeName: string;
  description?: string;
  status: string;
  isDiagnostico: boolean;
  isAutorizable: boolean;
  isOperatorAdded: boolean;
}

interface SectorCardProps {
  sectorName: string;
  sequenceOrder: number;
  status: SectorStatus;
  tasks: TaskInfo[];
  diagnosticoCompleted: boolean;
  workOrderNumber?: string;
  workOrderStatus?: string;
  /** Reordenar el sector en la secuencia de ejecución; si falta, no se dibuja el control. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isReordering?: boolean;
}

type BadgeVariant = NonNullable<React.ComponentProps<typeof Badge>['variant']>;

// Exportados: el detalle de orden rotula el estado de cada tarea con los mismos
// textos y colores que las tarjetas de sector, para que no haya dos vocabularios.
export const statusBadgeVariants: Record<string, BadgeVariant> = {
  ...Object.fromEntries(Object.entries(REPAIR_STATUS_UI).map(([status, ui]) => [status, TONE_TO_BADGE[ui.tone]])),
  blocked: 'outline',
};

export const statusLabels: Record<string, string> = {
  ...Object.fromEntries(Object.entries(REPAIR_STATUS_UI).map(([status, ui]) => [status, ui.label])),
  // `blocked` es presentación de una tarea trabada, no un valor de la columna.
  blocked: 'Bloqueado',
};

const REPAIR_TONE_TEXT: Record<string, string> = {
  completed: 'text-ok',
  in_progress: 'text-brand-ink',
  rejected: 'text-danger',
  reassignment_requested: 'text-danger',
  pending_approval: 'text-warn',
};

/** Icono de estado de una tarea. El estado también se dice con texto en la pastilla de al lado. */
function TaskStatusIcon({ status }: { status: string }) {
  const tone = REPAIR_TONE_TEXT[status] ?? 'text-muted-foreground';
  const common = `h-4 w-4 shrink-0 ${tone}`;
  switch (status) {
    case 'completed':
      return <CheckCircle2 aria-hidden="true" className={common} />;
    case 'in_progress':
      return <Loader2 aria-hidden="true" className={common} />;
    case 'rejected':
    case 'cancelled':
      return <XCircle aria-hidden="true" className={common} />;
    case 'reassignment_requested':
      return <Hand aria-hidden="true" className={common} />;
    case 'pending_approval':
      return <Clock aria-hidden="true" className={common} />;
    default:
      return <Circle aria-hidden="true" className={common} />;
  }
}

const sectorStatusBadge: Record<SectorStatus, BadgeVariant> = {
  blocked: 'outline',
  pending: 'secondary',
  in_progress: 'warning',
  paused: 'outline',
  completed: 'success',
};

const sectorStatusLabels: Record<SectorStatus, string> = {
  blocked: 'Bloqueado',
  pending: 'Pendiente',
  in_progress: 'En progreso',
  paused: 'Pausado',
  completed: 'Completado',
};

const woStatusBadge: Record<string, BadgeVariant> = {
  pending: 'secondary',
  in_progress: 'warning',
  paused: 'outline',
  completed: 'success',
  completed_partial: 'yellow',
  cancelled: 'destructive',
};

const woStatusLabels: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  paused: 'Pausada',
  completed: 'Completada',
  completed_partial: 'Parcial',
  cancelled: 'Cancelada',
};

export function SectorCard({
  sectorName,
  status,
  tasks,
  diagnosticoCompleted,
  workOrderNumber,
  workOrderStatus,
  onMoveUp,
  onMoveDown,
  isReordering = false,
}: SectorCardProps) {
  const [isOpen, setIsOpen] = useState(true);

  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const totalTasks = tasks.length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const diagnosticoTask = tasks.find((t) => t.isDiagnostico);
  const regularTasks = tasks.filter((t) => !t.isDiagnostico);
  // Con el diagnóstico sin cerrar, el resto de las tareas del sector todavía no se puede ejecutar.
  const waitingDiagnostico = !diagnosticoCompleted && !!diagnosticoTask && status !== 'blocked';

  const bodyId = useId();

  return (
    <section aria-label={`Sector ${sectorName}`} className="bg-card overflow-hidden rounded-lg border">
      <div className="flex items-center gap-2 pr-3">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={bodyId}
          onClick={() => setIsOpen((open) => !open)}
          className="hover:bg-muted/50 focus-visible:ring-ring flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
        >
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
          <span className="text-sm font-semibold">{sectorName}</span>
          {workOrderNumber && (
            <code className="text-muted-foreground max-w-[220px] truncate font-mono text-xs" title={workOrderNumber}>
              {workOrderNumber}
            </code>
          )}
          <Badge variant={sectorStatusBadge[status]}>{sectorStatusLabels[status]}</Badge>
          {workOrderStatus && (
            <Badge variant={woStatusBadge[workOrderStatus] || 'outline'} className="text-[11px]">
              OT {(woStatusLabels[workOrderStatus] || workOrderStatus).toLowerCase()}
            </Badge>
          )}
        </button>

        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {completedTasks}/{totalTasks}
        </span>
        <div
          role="progressbar"
          aria-label={`Progreso de ${sectorName}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
          aria-valuetext={`${completedTasks} de ${totalTasks} tareas completadas`}
          className="bg-muted hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full sm:block"
        >
          <div className="bg-brand h-full rounded-full transition-[width]" style={{ width: `${progressPercent}%` }} />
        </div>

        {(onMoveUp || onMoveDown) && (
          <div className="flex shrink-0 gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Subir ${sectorName}`}
              disabled={!onMoveUp || isReordering}
              onClick={onMoveUp}
            >
              <ArrowUp aria-hidden="true" className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Bajar ${sectorName}`}
              disabled={!onMoveDown || isReordering}
              onClick={onMoveDown}
            >
              <ArrowDown aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {isOpen && (
        <ul id={bodyId} className="divide-y border-t">
          {diagnosticoTask && (
            <li className="flex items-center gap-3 px-4 py-2.5">
              <TaskStatusIcon status={diagnosticoTask.status} />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">Diagnóstico {sectorName}</span>
                <p className="text-muted-foreground text-xs">
                  Obligatorio{waitingDiagnostico ? ' · bloquea las tareas restantes del sector' : ''}
                </p>
              </div>
              <Badge variant={statusBadgeVariants[diagnosticoTask.status] || 'outline'} className="shrink-0 text-[11px]">
                {statusLabels[diagnosticoTask.status] || diagnosticoTask.status}
              </Badge>
            </li>
          )}

          {regularTasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
              <TaskStatusIcon status={task.status} />
              <div className="min-w-0 flex-1">
                <span className="text-sm leading-tight font-medium">{task.repairTypeName}</span>
                {task.description && task.description !== task.repairTypeName && (
                  <p className="text-muted-foreground truncate text-xs leading-tight">{task.description}</p>
                )}
                {(task.isOperatorAdded || task.isAutorizable) && (
                  <p className="text-muted-foreground flex items-center gap-1 text-xs">
                    {task.isOperatorAdded && (
                      <>
                        <UserPlus aria-hidden="true" className="h-3 w-3" />
                        Agregado por operador
                      </>
                    )}
                    {task.isOperatorAdded && task.isAutorizable && ' · '}
                    {task.isAutorizable && 'Requiere autorización'}
                  </p>
                )}
              </div>
              <Badge variant={statusBadgeVariants[task.status] || 'outline'} className="shrink-0 text-[11px]">
                {statusLabels[task.status] || task.status}
              </Badge>
            </li>
          ))}

          {regularTasks.length === 0 && !diagnosticoTask && (
            <li className="text-muted-foreground px-4 py-3 text-center text-sm">Sin tareas asignadas</li>
          )}
        </ul>
      )}
    </section>
  );
}
