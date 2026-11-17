'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Pencil, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import {
  getMonthlyCycles,
  rejectMonthlyCycle,
  resolveMonthlyCycleRejection,
  type MonthlyCyclesData,
} from '../../actions/monthly-cycles';
import { CYCLE_KIND_UI, CYCLE_STATUS_UI } from '../../lib/monthly-cycle-check';
import { CycleFormDialog } from './CycleFormDialog';

type Cycle = MonthlyCyclesData['cycles'][number];

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

const money = (value: number | null) =>
  value === null
    ? '—'
    : value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });

function RejectDialog({
  cycle,
  customers,
  onClose,
  onDone,
}: {
  cycle: Cycle | null;
  customers: MonthlyCyclesData['customers'];
  onClose: () => void;
  onDone: () => void;
}) {
  const reasonId = useId();
  const [customerId, setCustomerId] = useState('');
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => rejectMonthlyCycle({ cycleId: cycle!.id, customerId, reason }),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.error);
      toast.success('Rechazo registrado');
      setCustomerId('');
      setReason('');
      onDone();
      onClose();
    },
    onError: () => toast.error('No se pudo registrar el rechazo'),
  });
  return (
    <ResponsiveDialog
      open={cycle !== null}
      onOpenChange={(open) => !open && !mutation.isPending && onClose()}
      title="Registrar rechazo del cliente"
      description="El ciclo queda «Rechazado por cliente» hasta que marques que se corrigió."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={mutation.isPending || !customerId || reason.trim().length < 3}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Registrar rechazo
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        <div className="space-y-1">
          <span className="text-sm font-medium">Cliente que lo rechazó</span>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="w-full" aria-label="Cliente que lo rechazó">
              <SelectValue placeholder="Elegí el cliente" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={reasonId}>Motivo</Label>
          <Textarea id={reasonId} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function ResolveButton({ rejectionId, onDone }: { rejectionId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const noteId = useId();
  const mutation = useMutation({
    mutationFn: () => resolveMonthlyCycleRejection({ rejectionId, note }),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.error);
      toast.success('Rechazo resuelto');
      setOpen(false);
      onDone();
    },
    onError: () => toast.error('No se pudo resolver el rechazo'),
  });
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Marcar corregido
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={(next) => !mutation.isPending && setOpen(next)}
        title="Marcar el rechazo como corregido"
        description="Contá qué se corrigió; queda en el historial del ciclo."
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending || note.trim().length < 3}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Marcar corregido
            </Button>
          </div>
        }
      >
        <div className="space-y-1 py-1">
          <Label htmlFor={noteId}>Qué se corrigió</Label>
          <Textarea id={noteId} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </ResponsiveDialog>
    </>
  );
}

/** Ciclos mensuales de un período: F.931, sindicales, planes de pago y recibos, con su cruce y los rechazos. */
export function MonthlyCyclesClient({ initialPeriod }: { initialPeriod: string }) {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(initialPeriod);
  const [editing, setEditing] = useState<Cycle | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [rejecting, setRejecting] = useState<Cycle | null>(null);

  const query = useQuery({
    queryKey: ['monthly-cycles', period],
    queryFn: () => getMonthlyCycles(period),
    staleTime: 30_000,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['monthly-cycles'] });
  const data = query.data?.ok ? query.data : null;
  const [year, month] = period.split('-').map(Number);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Mes anterior"
            onClick={() => setPeriod(shiftPeriod(period, -1))}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <h3 className="min-w-40 text-center text-base font-semibold capitalize" aria-live="polite">
            {MONTHS[month - 1]} {year}
          </h3>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Mes siguiente"
            onClick={() => setPeriod(shiftPeriod(period, 1))}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        {data?.canEdit && (
          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden="true" />
            Cargar ciclo
          </Button>
        )}
      </div>

      {data && (
        <p className="text-muted-foreground text-sm">
          Nómina del período en el sistema:{' '}
          <span className="text-foreground font-mono tabular-nums">{data.payrollHeadcount}</span> empleados (contra eso
          se controla lo declarado en el F.931 y la cantidad de recibos).
        </p>
      )}

      {query.isPending ? (
        <div className="space-y-2" role="status" aria-label="Cargando los ciclos">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : query.isError || query.data?.ok === false ? (
        <StateBlock
          variant="error"
          title="No se pudieron leer los ciclos"
          description={query.data?.ok === false ? query.data.error : 'Intentá de nuevo en unos segundos.'}
        />
      ) : data && data.cycles.length === 0 ? (
        <StateBlock
          variant="empty"
          title="Sin ciclos cargados en este mes"
          description="Cargá el F.931, los aportes sindicales, los planes de pago y los recibos del período para controlarlos."
        />
      ) : data ? (
        <ul className="space-y-3">
          {data.cycles.map((c) => {
            const status = CYCLE_STATUS_UI[c.check.status];
            const ui = CYCLE_KIND_UI[c.kind];
            const files = [
              { label: ui.declaration, url: c.files.declaration },
              { label: 'Boleta', url: c.files.slip },
              { label: 'Comprobante de pago', url: c.files.payment },
            ].filter((f) => f.url);
            return (
              <li key={c.id} className="bg-card space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {ui.label}
                      {c.label ? ` · ${c.label}` : ''}
                    </p>
                    <dl className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {c.declaredHeadcount !== null && (
                        <div>
                          <dt className="inline">{c.kind === 'recibos' ? 'Recibos: ' : 'Empleados: '}</dt>
                          <dd className="text-foreground inline font-mono tabular-nums">{c.declaredHeadcount}</dd>
                        </div>
                      )}
                      {c.kind !== 'recibos' && c.kind !== 'plan_pago' && (
                        <div>
                          <dt className="inline">Declarado: </dt>
                          <dd className="text-foreground inline font-mono tabular-nums">{money(c.declaredAmount)}</dd>
                        </div>
                      )}
                      {c.kind !== 'recibos' && (
                        <>
                          <div>
                            <dt className="inline">{c.kind === 'plan_pago' ? 'Cuota: ' : 'Boleta: '}</dt>
                            <dd className="text-foreground inline font-mono tabular-nums">{money(c.slipAmount)}</dd>
                          </div>
                          <div>
                            <dt className="inline">Pagado: </dt>
                            <dd className="text-foreground inline font-mono tabular-nums">{money(c.paidAmount)}</dd>
                          </div>
                        </>
                      )}
                    </dl>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>

                {c.check.issues.length > 0 && (
                  <ul className="space-y-0.5 text-sm">
                    {c.check.issues.map((issue) => (
                      <li
                        key={issue}
                        className={
                          c.check.status === 'incomplete' ? 'text-muted-foreground' : 'text-danger-subtle-foreground'
                        }
                      >
                        {issue}
                      </li>
                    ))}
                  </ul>
                )}

                {c.rejections.length > 0 && (
                  <ul className="space-y-2 border-t pt-2 text-sm">
                    {c.rejections.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <span className="font-medium">{r.customer}</span> rechazó el{' '}
                          {formatArgentinaDay(r.rejectedAt)}: {r.reason}
                          {r.resolvedAt && (
                            <span className="text-muted-foreground">
                              {' '}
                              · Corregido el {formatArgentinaDay(r.resolvedAt)}
                              {r.resolutionNote ? `: ${r.resolutionNote}` : ''}
                            </span>
                          )}
                        </span>
                        {!r.resolvedAt && data.canEdit && <ResolveButton rejectionId={r.id} onDone={refresh} />}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                  {files.map((f) => (
                    <Button key={f.label} asChild variant="ghost" size="sm">
                      <a href={f.url!} target="_blank" rel="noopener noreferrer">
                        <ExternalLink aria-hidden="true" />
                        {f.label}
                      </a>
                    </Button>
                  ))}
                  {data.canEdit && (
                    <div className="ml-auto flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setRejecting(c)}>
                        Registrar rechazo
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditing(c);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil aria-hidden="true" />
                        Editar
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <CycleFormDialog open={formOpen} onOpenChange={setFormOpen} period={period} cycle={editing} onSaved={refresh} />
      <RejectDialog
        cycle={rejecting}
        customers={data?.customers ?? []}
        onClose={() => setRejecting(null)}
        onDone={refresh}
      />
    </div>
  );
}
