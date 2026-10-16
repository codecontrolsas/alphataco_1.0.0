'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { Logger } from '@/lib/logger';
import { MetricCard } from '@/shared/components/common/MetricCard';
import { formatDateAr } from '@/shared/lib/argentina-time';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Lock } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { processMassiveLoad } from '../../actions/diagram-massive-actions';
import type { ConflictCheckResult, ConflictRecord, ProcessingResult } from '../../types/massive-diagram';
import { useRefreshDiagramViews } from '../hooks';
import type { MassiveConflictResolution, MassiveLoadParams } from '../schemas';
import { NoveltyBadge } from './NoveltyBadge';

const logger = new Logger('Diagrams/ConflictReviewSheet');

interface ConflictReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  params: MassiveLoadParams;
  check: ConflictCheckResult;
  /** `[legajo] Apellido, Nombre` por id de empleado: el servidor devuelve los nombres sin legajo. */
  employeeLabels: Record<string, string>;
  onProcessed: (result: ProcessingResult) => void;
}

interface EmployeeConflicts {
  employeeId: string;
  label: string;
  replaceable: ConflictRecord[];
  locked: ConflictRecord[];
}

function groupByEmployee(conflicts: ConflictRecord[], labels: Record<string, string>): EmployeeConflicts[] {
  const groups = new Map<string, EmployeeConflicts>();
  for (const conflict of conflicts) {
    const group = groups.get(conflict.employee_id) ?? {
      employeeId: conflict.employee_id,
      label: labels[conflict.employee_id] ?? conflict.employee_name,
      replaceable: [],
      locked: [],
    };
    (conflict.conflict_type === 'IN_USE' ? group.locked : group.replaceable).push(conflict);
    groups.set(conflict.employee_id, group);
  }
  return [...groups.values()];
}

/**
 * Revisión de una carga masiva antes de confirmarla: cuántos registros son nuevos, cuáles reemplazan una novedad y
 * cuáles están bloqueados por un parte diario, y qué hacer con los días que ya tienen novedad. Todo en un panel
 * lateral (sin modales encadenados); al confirmar, el resultado vuelve a la pantalla de carga.
 */
export function ConflictReviewSheet({
  open,
  onOpenChange,
  params,
  check,
  employeeLabels,
  onProcessed,
}: ConflictReviewSheetProps) {
  const radioId = useId();
  const refreshDiagramViews = useRefreshDiagramViews();
  const { hasPermission } = usePermissions();
  // Sobrescribir novedades ya cargadas es una edición (`massive_diagram:update`); sin ese permiso sólo se crean las nuevas.
  const canCreate = hasPermission('empleados', 'massive_diagram', 'create');
  const canUpdate = hasPermission('empleados', 'massive_diagram', 'update');

  const [choice, setChoice] = useState<MassiveConflictResolution>(canUpdate ? 'update' : 'skip');
  const [understoodLocked, setUnderstoodLocked] = useState(false);

  const totalConflicts = check.conflicts.length;
  const locked = check.conflicts.filter((conflict) => conflict.conflict_type === 'IN_USE').length;
  const replaceable = totalConflicts - locked;
  const fresh = Math.max(0, check.total_records - totalConflicts);
  // Sin ningún día ocupado no hay nada que decidir (`skip` crea todo y no pisa nada); sin permiso de edición tampoco se pisa.
  const resolution: MassiveConflictResolution = totalConflicts === 0 || !canUpdate ? 'skip' : choice;
  const recordsToWrite = fresh + (resolution === 'update' ? replaceable : 0);

  const groups = groupByEmployee(check.conflicts, employeeLabels);
  const canConfirm = canCreate && (locked === 0 || understoodLocked) && recordsToWrite + locked > 0;

  const processMutation = useMutation({
    mutationFn: () => processMassiveLoad(params, resolution),
    onSuccess: (result) => {
      refreshDiagramViews();
      toast.success(params.mode === 'diagram' ? 'Diagramas procesados correctamente' : 'Novedad cargada correctamente');
      onProcessed(result);
    },
    onError: (error: Error) => {
      logger.error('Error al procesar la carga masiva', { data: { error } });
      // Se muestra el motivo que devolvió el servidor (tope de empleados, rango inválido, etc.)
      toast.error(error.message || 'No se pudo completar la carga. Volvé a intentar.');
    },
  });

  return (
    <Sheet open={open} onOpenChange={(next) => (processMutation.isPending ? undefined : onOpenChange(next))}>
      <SheetContent className="gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b p-4 pr-12">
          <SheetTitle>Revisar la carga</SheetTitle>
          <SheetDescription>
            {totalConflicts > 0
              ? 'Hay días que ya tienen una novedad. Revisalos antes de confirmar.'
              : 'No hay días con novedad cargada: se crean todos los registros.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2">
            <MetricCard label="Nuevos" value={fresh} tone="ok" />
            <MetricCard label="Reemplazables" value={replaceable} tone={replaceable > 0 ? 'brand' : 'default'} />
            <MetricCard label="Bloqueados" value={locked} tone={locked > 0 ? 'danger' : 'default'} />
          </div>

          {replaceable > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Días que ya tienen una novedad</legend>
              <RadioGroup
                value={resolution}
                onValueChange={(next) => setChoice(next as MassiveConflictResolution)}
                className="gap-2"
              >
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <RadioGroupItem value="update" id={`${radioId}-update`} disabled={!canUpdate} className="mt-0.5" />
                  <Label htmlFor={`${radioId}-update`} className="flex flex-col items-start gap-0.5">
                    Reemplazar con la novedad nueva
                    <span className="text-muted-foreground text-xs font-normal">
                      {canUpdate
                        ? `Se reemplazan ${replaceable} ${replaceable === 1 ? 'novedad cargada' : 'novedades cargadas'}.`
                        : 'No tenés permiso para modificar novedades ya cargadas.'}
                    </span>
                  </Label>
                </div>
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <RadioGroupItem value="skip" id={`${radioId}-skip`} className="mt-0.5" />
                  <Label htmlFor={`${radioId}-skip`} className="flex flex-col items-start gap-0.5">
                    Conservar las que ya están
                    <span className="text-muted-foreground text-xs font-normal">
                      Solo se crean los días libres; lo cargado queda como está.
                    </span>
                  </Label>
                </div>
              </RadioGroup>
            </fieldset>
          ) : null}

          {locked > 0 ? (
            <Alert className="border-danger/30 bg-danger-subtle text-danger-subtle-foreground">
              <Lock aria-hidden="true" className="size-4" />
              <AlertDescription className="flex flex-col gap-3 text-current">
                <span>
                  {locked} {locked === 1 ? 'registro está bloqueado' : 'registros están bloqueados'} porque el día ya
                  tiene un parte diario. No se modifican y salen como errores en el resultado.
                </span>
                <span className="flex items-center gap-2">
                  <Checkbox
                    id={`${radioId}-understood`}
                    checked={understoodLocked}
                    onCheckedChange={(checked) => setUnderstoodLocked(checked === true)}
                  />
                  <Label htmlFor={`${radioId}-understood`} className="text-sm font-normal">
                    Entiendo que los bloqueados no se modifican
                  </Label>
                </span>
              </AlertDescription>
            </Alert>
          ) : null}

          {groups.length > 0 ? (
            <section aria-label="Detalle por empleado" className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Detalle por empleado</h3>
              <ul className="flex flex-col gap-2">
                {groups.map((group) => (
                  <li key={group.employeeId}>
                    <EmployeeConflictGroup group={group} resolution={resolution} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <SheetFooter className="flex-row justify-end border-t p-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={processMutation.isPending}
          >
            Cancelar
          </Button>
          {canCreate ? (
            <Button
              type="button"
              onClick={() => processMutation.mutate()}
              disabled={!canConfirm || processMutation.isPending}
            >
              {processMutation.isPending
                ? 'Procesando…'
                : `Confirmar carga (${recordsToWrite} ${recordsToWrite === 1 ? 'registro' : 'registros'})`}
            </Button>
          ) : (
            <p className="text-muted-foreground self-center text-sm">No tenés permiso para realizar cargas masivas.</p>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Días ocupados de un empleado. Las filas se montan al abrir el grupo: una carga grande puede tener miles. */
function EmployeeConflictGroup({
  group,
  resolution,
}: {
  group: EmployeeConflicts;
  resolution: MassiveConflictResolution;
}) {
  const [opened, setOpened] = useState(false);
  const rows = [...group.replaceable, ...group.locked];

  return (
    <details
      className="group rounded-lg border"
      onToggle={(event) => setOpened((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="focus-visible:ring-ring/50 flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 text-sm outline-none focus-visible:ring-[3px] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate font-medium">{group.label}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {group.replaceable.length > 0 ? (
            <Badge variant={resolution === 'update' ? 'default' : 'secondary'}>
              {group.replaceable.length} {resolution === 'update' ? 'a reemplazar' : 'a conservar'}
            </Badge>
          ) : null}
          {group.locked.length > 0 ? <Badge variant="destructive">{group.locked.length} bloqueados</Badge> : null}
        </span>
      </summary>
      {opened ? (
        <ul className="max-h-72 divide-y overflow-y-auto border-t">
          {rows.map((conflict) => (
            <li key={conflict.date_formatted} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="font-mono tabular-nums">{formatDateAr(conflict.date_formatted)}</span>
              <span className="flex items-center gap-1.5">
                <NoveltyBadge name={conflict.current_diagram_name} color={conflict.current_diagram_color} />
                {conflict.conflict_type === 'IN_USE' ? (
                  <Badge variant="destructive">Bloqueado</Badge>
                ) : resolution === 'update' ? (
                  <>
                    <ArrowRight aria-label="se reemplaza por" className="text-muted-foreground size-3.5" />
                    <NoveltyBadge name={conflict.new_diagram_name} color={conflict.new_diagram_color} />
                  </>
                ) : (
                  <Badge variant="secondary">Se conserva</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}
