'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Eye, Stethoscope, Wrench, XCircle } from 'lucide-react';
import moment from 'moment';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { useState } from 'react';
// Los textos y colores del estado de cada tarea salen del mapa que ya usan las
// tarjetas de sector y el detalle de orden — está exportado justamente para que
// no existan dos vocabularios para el mismo estado.
import { statusBadgeVariants, statusLabels } from '../../../MaintenanceOrders/components/SectorCard';
import { getWorkOrderTasks } from '../actions.server';
import { getWoStatusConfig } from '../work-order-status';

interface WorkOrderTasksDialogProps {
  workOrderId: string;
  orderNumber: string;
  /** Estado de la OT (enum work_order_status) */
  status: string;
  taskCount: number;
}

/**
 * Modal con las tareas de una orden de trabajo (ticket 678).
 *
 * La tabla del sector muestra una fila por OT con la cantidad de tareas; este
 * modal es el "Ver" que deja mirar la OT entera sin salir de la Vista Taller.
 *
 * Las tareas se piden recién al abrir (`enabled: open`): con un acordeón por
 * sector y decenas de OT por sector, traerlas de entrada sería traer todo el
 * taller para mirar una sola orden.
 */
export function WorkOrderTasksDialog({ workOrderId, orderNumber, status, taskCount }: WorkOrderTasksDialogProps) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['work-order-tasks', workOrderId],
    queryFn: () => getWorkOrderTasks(workOrderId),
    enabled: open,
    staleTime: 60 * 1000,
  });

  const woConfig = getWoStatusConfig(status);
  const WoStatusIcon = woConfig.icon;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
          <Eye className="h-3.5 w-3.5" />
          Ver
        </Button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Wrench className="h-4 w-4 opacity-60" />
            <span className="font-mono">{orderNumber}</span>
            <Badge variant={woConfig.variant} className="gap-1">
              <WoStatusIcon className="h-3 w-3" />
              {woConfig.label}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {taskCount === 1 ? '1 tarea en esta orden de trabajo' : `${taskCount} tareas en esta orden de trabajo`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="-mr-4 flex-1 pr-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No se pudieron cargar las tareas de la orden de trabajo.
            </p>
          ) : !data || data.tasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Esta orden de trabajo no tiene tareas.</p>
          ) : (
            <div className="space-y-3">
              {data.tasks.map((task, index) => (
                <div key={task.id} className="rounded-lg border border-border/60 bg-card p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <span className="mt-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                        {index + 1}.
                      </span>
                      <p className="min-w-0 flex-1 text-sm">
                        {task.description || <span className="text-muted-foreground">Sin descripción</span>}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {task.totalRepairs > 0 ? (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {task.completedRepairs}/{task.totalRepairs} trabajos
                        </span>
                      ) : null}
                      <Badge variant={statusBadgeVariants[task.taskStatus] ?? 'secondary'}>
                        {statusLabels[task.taskStatus] ?? task.taskStatus}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
                    {/* Si la tarea ya tiene trabajos de reparación, los tipos se
                        listan abajo con su estado — repetirlos acá sería ruido. */}
                    {task.repairs.length === 0
                      ? task.repairTypes.map((repairType, repairTypeIndex) => (
                          <Badge
                            key={`${repairType?.id ?? 'sin-tipo'}-${repairTypeIndex}`}
                            variant="outline"
                            className="text-[10px]"
                          >
                            {repairType?.name ?? 'Sin tipo'}
                          </Badge>
                        ))
                      : null}
                    {task.isCritical ? (
                      <Badge variant="yellow" className="gap-1 text-[10px]">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Crítica
                      </Badge>
                    ) : null}
                    {task.isDiagnostico ? (
                      <Badge variant="info" className="gap-1 text-[10px]">
                        <Stethoscope className="h-2.5 w-2.5" />
                        Diagnóstico
                      </Badge>
                    ) : null}
                    {task.isRejected ? (
                      <Badge variant="destructive" className="gap-1 text-[10px]">
                        <XCircle className="h-2.5 w-2.5" />
                        Rechazada
                      </Badge>
                    ) : null}
                  </div>

                  {task.plannedStartDate || task.plannedEndDate ? (
                    <p className="mt-2 pl-6 text-xs text-muted-foreground">
                      Planificada:{' '}
                      {task.plannedStartDate ? moment.utc(task.plannedStartDate).format('DD/MM/YYYY') : 'sin inicio'} →{' '}
                      {task.plannedEndDate ? moment.utc(task.plannedEndDate).format('DD/MM/YYYY') : 'sin fin'}
                    </p>
                  ) : null}

                  {task.rejectionReason ? (
                    <>
                      <Separator className="my-2" />
                      <p className="pl-6 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Motivo de rechazo:</span> {task.rejectionReason}
                      </p>
                    </>
                  ) : null}

                  {/* Trabajos de reparación: es donde el taller marca el avance real */}
                  {task.repairs.length > 0 ? (
                    <>
                      <Separator className="my-2" />
                      <ul className="space-y-1 pl-6">
                        {task.repairs.map((repair) => (
                          <li key={repair.id} className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge
                              variant={statusBadgeVariants[repair.status] ?? 'secondary'}
                              className="px-1.5 py-0 text-[10px]"
                            >
                              {statusLabels[repair.status] ?? repair.status}
                            </Badge>
                            <span className="text-foreground">{repair.name ?? 'Sin tipo'}</span>
                            {repair.completedAt ? (
                              <span className="text-muted-foreground">
                                · {formatArgentinaDateTime(repair.completedAt)}
                              </span>
                            ) : null}
                            {repair.technicianNotes ? (
                              <span className="w-full text-muted-foreground">↳ {repair.technicianNotes}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
