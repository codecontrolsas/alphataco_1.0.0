'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ActivityHistoryModal } from '@/features/Mantenimiento/components/ActivityHistoryModal';
import { MaintenanceStatusPill } from '@/features/Mantenimiento/shared/components/MaintenanceStatusPill';
import { ResourceCell } from '@/features/Mantenimiento/shared/components/ResourceCell';
import { invalidateAllMaintenanceQueries } from '@/features/Mantenimiento/utils/queryInvalidation';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { Logger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Clock, RotateCcw, Wrench } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { reassignTaskToSector, type ReturnedTaskData } from '../actions/actionsServer';
import { getTaskInfo } from '../utils/task-info';

const logger = new Logger('ApprovalInbox/ReassignmentList');

interface ReassignmentCardProps {
  task: ReturnedTaskData;
  sectors: Array<{ id: string; name: string }>;
  onShowHistory: (workOrderId: string) => void;
}

function ReassignmentCard({ task, sectors, onShowHistory }: ReassignmentCardProps) {
  const queryClient = useQueryClient();
  const info = getTaskInfo(task);
  const originalSectorName = task.original_sector?.name ?? null;

  const [sectorId, setSectorId] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);
  const selectId = `reassign-sector-${task.id}`;

  const handleReassign = async () => {
    if (!sectorId) {
      toast.error('Seleccione un sector');
      return;
    }
    setIsReassigning(true);
    try {
      await reassignTaskToSector(task.id, sectorId);
      toast.success('Tarea reasignada');
      invalidateAllMaintenanceQueries(queryClient);
      setSectorId('');
    } catch (error) {
      logger.error('Error reasignando tarea', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al reasignar');
    } finally {
      setIsReassigning(false);
    }
  };

  return (
    <li className="bg-card rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <ResourceCell resource={info.resource} />
          {info.orderNumber ? <span className="font-mono text-sm font-semibold">{info.orderNumber}</span> : null}
          {originalSectorName ? <Badge variant="warning">{originalSectorName}</Badge> : null}
          <MaintenanceStatusPill entity="repair" status={task.status} size="sm" />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label="Ver historial de la OT"
          title="Ver historial"
          disabled={!info.workOrderId}
          onClick={() => info.workOrderId && onShowHistory(info.workOrderId)}
        >
          <Clock className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Wrench className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <p className="font-semibold">{info.repairTypeName}</p>
      </div>
      {info.itemDescription ? <p className="text-muted-foreground mt-1 text-sm">{info.itemDescription}</p> : null}

      {task.return_reason ? (
        <div className="border-danger/30 bg-danger-subtle text-danger-subtle-foreground mt-3 flex items-start gap-2 rounded-md border px-3 py-2">
          <RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-medium">Motivo de devolucion</p>
            <p>{task.return_reason}</p>
          </div>
        </div>
      ) : null}

      <PermissionGuard module="mantenimiento" tab="bandeja_aprobaciones" action="update">
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1 space-y-1.5 sm:max-w-xs">
            <Label htmlFor={selectId}>Nuevo sector</Label>
            <Select value={sectorId} onValueChange={setSectorId} disabled={sectors.length === 0}>
              <SelectTrigger id={selectId} className="w-full">
                <SelectValue placeholder={sectors.length === 0 ? 'Sin sectores disponibles' : 'Seleccionar sector'} />
              </SelectTrigger>
              <SelectContent>
                {sectors.map((sector) => (
                  <SelectItem key={sector.id} value={sector.id}>
                    {sector.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={handleReassign} disabled={isReassigning || !sectorId}>
            <ArrowRight className="size-4" aria-hidden="true" />
            {isReassigning ? 'Reasignando...' : 'Reasignar'}
          </Button>
        </div>
      </PermissionGuard>
    </li>
  );
}

interface ReassignmentListProps {
  tasks: ReturnedTaskData[];
  sectors: Array<{ id: string; name: string }>;
}

/** Tareas devueltas por un sector. Reasignar exige `bandeja_aprobaciones:update`. */
export function ReassignmentList({ tasks, sectors }: ReassignmentListProps) {
  const [historyWoId, setHistoryWoId] = useState<string | null>(null);

  return (
    <>
      <ul className="space-y-3">
        {tasks.map((task) => (
          <ReassignmentCard key={task.id} task={task} sectors={sectors} onShowHistory={setHistoryWoId} />
        ))}
      </ul>
      <ActivityHistoryModal
        open={!!historyWoId}
        onClose={() => setHistoryWoId(null)}
        workOrderId={historyWoId}
        title="Historial de OT"
      />
    </>
  );
}
