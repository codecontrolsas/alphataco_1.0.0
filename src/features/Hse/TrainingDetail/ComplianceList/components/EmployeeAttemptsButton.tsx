'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleMinus, ListChecks, XCircle } from 'lucide-react';
import { useState } from 'react';
import { fetchHseEmployeeTrainingAttempts } from '../../../actions/trainings.server';
import { HseStatusBadge } from '../../../components/HseStatusBadge';
import { HSE_QUERY_KEYS } from '../../../lib/constants';
import { HSE_ATTEMPT_STATUS_UI } from '../../../lib/status-presentation';
import { formatPercent } from '../../../lib/training-status';
import { EmployeeCertificates } from './EmployeeCertificates';

const RESULT_UI = {
  correct: { label: 'Correcta', icon: CheckCircle2, className: 'text-ok-subtle-foreground' },
  wrong: { label: 'Incorrecta', icon: XCircle, className: 'text-danger-subtle-foreground' },
  unanswered: { label: 'Sin responder', icon: CircleMinus, className: 'text-muted-foreground' },
} as const;

/**
 * Resultados de un empleado en la capacitación: cada intento con su puntaje y, en el dashboard (con permiso), el
 * detalle por pregunta. Se piden al abrir el diálogo.
 */
export function EmployeeAttemptsButton({
  trainingId,
  employeeId,
  employeeLabel,
}: {
  trainingId: string;
  employeeId: string;
  employeeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const attempts = useQuery({
    queryKey: [...HSE_QUERY_KEYS.trainingCompliance, trainingId, 'attempts', employeeId],
    queryFn: () => fetchHseEmployeeTrainingAttempts(trainingId, employeeId),
    enabled: open,
    staleTime: 60 * 1000,
  });

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 sm:min-h-8"
        onClick={() => setOpen(true)}
        aria-label={`Ver los intentos de ${employeeLabel}`}
      >
        <ListChecks aria-hidden="true" className="mr-1 size-4" /> Intentos
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Intentos de {employeeLabel}</DialogTitle>
            <DialogDescription>El puntaje es el porcentaje de puntos sobre el total del examen.</DialogDescription>
          </DialogHeader>
          {attempts.isLoading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Cargando los intentos">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : attempts.isError || !attempts.data ? (
            <StateBlock
              variant="error"
              title="No se pudieron cargar los intentos"
              action={
                <Button type="button" variant="outline" onClick={() => void attempts.refetch()}>
                  Reintentar
                </Button>
              }
            />
          ) : attempts.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no rindió.</p>
          ) : (
            <ol className="space-y-4">
              {attempts.data.map((a) => (
                <li key={a.id} className="space-y-2 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium tabular-nums">Intento {a.number}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <HseStatusBadge ui={HSE_ATTEMPT_STATUS_UI[a.status]} />
                      {a.passed !== null && (
                        <span
                          className={
                            a.passed
                              ? 'font-medium text-ok-subtle-foreground'
                              : 'font-medium text-danger-subtle-foreground'
                          }
                        >
                          {a.passed ? 'Aprobado' : 'Desaprobado'}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    Empezó {formatArgentinaDateTime(a.startedAt)}
                    {a.submittedAt && ` · cerró ${formatArgentinaDateTime(a.submittedAt)}`}
                    {a.scorePercent !== null &&
                      ` · ${formatPercent(a.scorePercent)} (${a.scorePoints} de ${a.maxPoints} puntos)`}
                  </p>
                  {a.questions.length > 0 && (
                    <ul className="space-y-1 text-sm">
                      {a.questions.map((q, index) => {
                        const ui = RESULT_UI[q.result];
                        const Icon = ui.icon;
                        return (
                          <li key={q.id} className="flex items-start gap-2">
                            <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${ui.className}`} />
                            <span className="min-w-0 text-pretty">
                              <span className="tabular-nums">{index + 1}.</span> {q.prompt}{' '}
                              <span className="text-muted-foreground">
                                ({ui.label}, {q.points} pt{q.points === 1 ? '' : 's'})
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
          {open && (
            <EmployeeCertificates trainingId={trainingId} employeeId={employeeId} employeeLabel={employeeLabel} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
