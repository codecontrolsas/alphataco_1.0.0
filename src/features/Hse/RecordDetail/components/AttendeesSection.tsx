'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Logger } from '@/lib/logger';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { HseRecordDetail } from '../../actions/records.queries';
import {
  addHseRecordAttendee,
  fetchHseRecordFormOptions,
  removeHseRecordAttendee,
  setHseRecordAttendance,
} from '../../actions/records.server';
import { EmployeePicker } from '../../components/EmployeePicker';
import { HseStatusBadge } from '../../components/HseStatusBadge';
import { HSE_QUERY_KEYS } from '../../lib/constants';
import { HSE_ATTENDEE_RESULT_LABELS } from '../../lib/pdf-content';
import { HSE_ASSIGNMENT_STATUS_UI } from '../../lib/status-presentation';
import { formatPercent } from '../../lib/training-status';

const logger = new Logger('Hse/AttendeesSection');

type Attendee = HseRecordDetail['attendees'][number];

function ResultCell({ attendee }: { attendee: Attendee }) {
  if (attendee.status === 'not_assigned') {
    return <span className="text-muted-foreground text-sm">{HSE_ATTENDEE_RESULT_LABELS.not_assigned}</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <HseStatusBadge ui={HSE_ASSIGNMENT_STATUS_UI[attendee.status]} />
      {attendee.scorePercent !== null && (
        <span className="text-sm tabular-nums">{formatPercent(attendee.scorePercent)}</span>
      )}
    </span>
  );
}

/**
 * Asistentes del acta en borrador: presente/ausente, quitar y sumar de a uno (nunca se reemplaza la lista). Muestra el
 * resultado y la firma de la constancia ACTUALES de cada uno; al cerrar se congelan.
 */
export function AttendeesSection({
  recordId,
  attendees,
  editable,
}: {
  recordId: string;
  attendees: Attendee[];
  editable: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pickerId = useId();
  const [newEmployee, setNewEmployee] = useState('');
  const [adding, setAdding] = useState(false);

  const options = useQuery({
    queryKey: [...HSE_QUERY_KEYS.all, 'record-form-options'],
    queryFn: () => fetchHseRecordFormOptions(),
    enabled: adding,
    staleTime: 5 * 60 * 1000,
  });
  const present = useMemo(() => new Set(attendees.map((a) => a.employeeId)), [attendees]);
  const available = useMemo(
    () => (options.data?.employees ?? []).filter((e) => !present.has(e.id)),
    [options.data, present]
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: HSE_QUERY_KEYS.all });
    router.refresh();
  };
  const onError = (error: unknown) => {
    logger.error('Error al actualizar los asistentes', { data: { error } });
    toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la lista');
  };

  const toggle = useMutation({
    mutationFn: async (v: { employeeId: string; attended: boolean }) =>
      unwrapAction(await setHseRecordAttendance({ recordId, ...v })),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: async (employeeId: string) => unwrapAction(await removeHseRecordAttendee({ recordId, employeeId })),
    onSuccess: () => {
      toast.success('Asistente quitado');
      refresh();
    },
    onError,
  });
  const add = useMutation({
    mutationFn: async (employeeId: string) => unwrapAction(await addHseRecordAttendee({ recordId, employeeId })),
    onSuccess: () => {
      setNewEmployee('');
      toast.success('Asistente agregado');
      refresh();
    },
    onError,
  });

  const busy = toggle.isPending || remove.isPending || add.isPending;
  const presentCount = attendees.filter((a) => a.attended).length;

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm" role="status">
        <span className="tabular-nums">{presentCount}</span> presentes de{' '}
        <span className="tabular-nums">{attendees.length}</span> en la lista
      </p>
      {attendees.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay asistentes en la lista.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Asistentes del acta, resultado y firma de la constancia</caption>
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Legajo
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Apellido y nombre
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Resultado
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Constancia
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Asistió
                </th>
                {editable && (
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">Acciones</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {attendees.map((a) => (
                <tr key={a.employeeId}>
                  <td className="px-3 py-2 font-mono tabular-nums">{a.file ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{a.fullName}</span>
                    {a.position && <span className="text-muted-foreground block text-xs">{a.position}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <ResultCell attendee={a} />
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {a.signedAt ? (
                      `Firmada ${formatArgentinaDateTime(a.signedAt)}`
                    ) : (
                      <span className="text-muted-foreground">Sin firmar</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editable ? (
                      <Switch
                        checked={a.attended}
                        disabled={busy}
                        aria-label={`${a.fullName} asistió`}
                        onCheckedChange={(checked) => toggle.mutate({ employeeId: a.employeeId, attended: checked })}
                      />
                    ) : a.attended ? (
                      'Sí'
                    ) : (
                      'No'
                    )}
                  </td>
                  {editable && (
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 sm:size-9"
                        aria-label={`Quitar a ${a.fullName} de la lista`}
                        disabled={busy}
                        onClick={() => remove.mutate(a.employeeId)}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editable && !adding && (
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" className="mr-1 size-4" /> Sumar asistente
        </Button>
      )}
      {editable && adding && (
        <div className="space-y-2 rounded-lg border p-3">
          <label htmlFor={pickerId} className="text-sm font-medium">
            Empleado
          </label>
          {options.isLoading ? (
            <Skeleton className="h-11 w-full sm:h-9" aria-label="Cargando empleados" />
          ) : options.isError ? (
            <StateBlock
              variant="error"
              title="No se pudieron cargar los empleados"
              action={
                <Button type="button" variant="outline" onClick={() => void options.refetch()}>
                  Reintentar
                </Button>
              }
            />
          ) : (
            <EmployeePicker
              id={pickerId}
              options={available}
              value={newEmployee}
              onChange={setNewEmployee}
              label="Elegir el empleado que asistió"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11 sm:min-h-9"
              disabled={!newEmployee || add.isPending}
              aria-busy={add.isPending}
              onClick={() => add.mutate(newEmployee)}
            >
              {add.isPending ? 'Sumando…' : 'Sumar'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 sm:min-h-9"
              onClick={() => {
                setNewEmployee('');
                setAdding(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
