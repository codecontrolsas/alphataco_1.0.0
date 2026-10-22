'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatArgentinaDateTime } from '@/features/Treasury/lib/today';
import { Timeline, type TimelineItem, type TimelineTone } from '@/shared/components/common/Timeline';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { formatCalendarDate } from '@/shared/utils/calendar-date';
import { preparteStatusBadges, preparteStatusLabels } from '@/shared/utils/mappers';
import { User, X } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePreparteChangeLogs, type PreparteChangeLogEntry } from '../../hooks/usePreparteChangeLogs';
import { getPreparteReasonInfo } from '../../lib/preparte-form-data';
import { canTransition, type PreparteStatus } from '../../lib/preparte-status';
import type { PreparteItem } from '../PreparteManager';

/** Acciones que el detalle le pide al manager (cada una abre un único overlay nuevo). */
export type OrderDetailAction = 'confirm' | 'reprogram' | 'reject' | 'cancel' | 'edit';

interface OrderDetailSheetProps {
  item: PreparteItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Permiso `operaciones:preparte:update`. Sin él solo se puede cerrar. */
  canUpdate: boolean;
  onAction: (action: OrderDetailAction) => void;
  /** Al cerrarse el panel: el padre decide a dónde vuelve el foco (ver `PreparteManager`). */
  onCloseAutoFocus?: (event: Event) => void;
}

const EMPTY_VALUE = 'No especificado';

const LOG_TONES: Record<string, TimelineTone> = {
  confirmado: 'ok',
  rechazado: 'danger',
  cancelado: 'danger',
  vencido: 'danger',
  reprogramado: 'warn',
};

function getLogTone(log: PreparteChangeLogEntry): TimelineTone {
  return LOG_TONES[(log.new_value ?? '').toLowerCase()] ?? 'brand';
}

function buildTimelineItems(logs: PreparteChangeLogEntry[]): TimelineItem[] {
  return logs.map((log) => {
    const metadata = log.metadata as Record<string, string | number | boolean | null> | null;
    const oldValue = metadata?.old_item_name ?? log.old_value;
    const newValue = metadata?.new_item_name ?? log.new_value;
    const when = log.changed_at ? formatArgentinaDateTime(log.changed_at) : 'Fecha no disponible';

    return {
      tone: getLogTone(log),
      title: (
        <span className="break-words [overflow-wrap:anywhere]">
          Cambio de {log.field_name}
          {oldValue != null || newValue != null ? `: ${String(oldValue ?? '-')} → ${String(newValue ?? '-')}` : ''}
        </span>
      ),
      meta: (
        <>
          <span className="tabular-nums">{when}</span>
          {log.changed_by_name ? ` · por ${log.changed_by_name}` : ''}
          {log.reason ? (
            <span className="block break-words [overflow-wrap:anywhere]">Motivo: {log.reason}</span>
          ) : null}
        </>
      ),
    };
  });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-foreground text-sm break-words [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function OrderHistory({ orderId, open }: { orderId: string; open: boolean }) {
  const { data: logs = [], isLoading, isError, refetch } = usePreparteChangeLogs(orderId, open);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Cargando historial">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex gap-3">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <StateBlock
        variant="error"
        title="No se pudo cargar el historial"
        description="Probá de nuevo en unos segundos."
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            Reintentar
          </Button>
        }
        className="py-6"
      />
    );
  }

  if (logs.length === 0) {
    return (
      <StateBlock
        variant="empty"
        title="Todavía no hay movimientos"
        description="Los cambios de estado y de datos del pedido aparecen acá."
        className="py-6"
      />
    );
  }

  return <Timeline items={buildTimelineItems(logs)} />;
}

/** Detalle de un pedido en un panel lateral, con el historial y las acciones que admite su estado. */
export function OrderDetailSheet({
  item,
  open,
  onOpenChange,
  canUpdate,
  onAction,
  onCloseAutoFocus,
}: OrderDetailSheetProps) {
  const status: PreparteStatus = item.status ?? 'pendiente';
  const reason = getPreparteReasonInfo(item);

  const canConfirm = canUpdate && canTransition(status, 'confirmado');
  const canReprogram = canUpdate && canTransition(status, 'reprogramado');
  const canReject = canUpdate && canTransition(status, 'rechazado');
  const canCancel = canUpdate && canTransition(status, 'cancelado');
  // Igual que la tabla: solo se edita un pedido pendiente
  const canEdit = canUpdate && status === 'pendiente';
  const hasActions = canConfirm || canReprogram || canReject || canCancel || canEdit;

  const sector = item.sector_service_id ? item.service_sectors?.sectors?.name : null;
  const area = item.areas_service_id ? item.service_areas?.areas_cliente?.nombre : null;
  const place = [sector, area].filter(Boolean).join(' · ');
  const schedule = [
    item.jornada,
    item.start_time && item.end_time
      ? `${item.start_time} a ${item.end_time}`
      : item.start_time
        ? `desde ${item.start_time}`
        : item.end_time
          ? `hasta ${item.end_time}`
          : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const quantity = [item.quantity != null ? String(item.quantity) : null, item.tipo].filter(Boolean).join(' × ');
  const image = item.preparteImage;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 p-0 sm:max-w-lg"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <header className="flex items-start gap-3 border-b p-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-muted-foreground font-mono text-xs">{item.numero_pedido ?? 'Sin número'}</p>
            <SheetTitle className="text-lg leading-snug break-words [overflow-wrap:anywhere]">
              {item.customers?.name ?? 'Cliente no especificado'}
            </SheetTitle>
            <SheetDescription className="sr-only">Detalle del pedido y su historial</SheetDescription>
            <Badge variant={preparteStatusBadges[status]}>{preparteStatusLabels[status] ?? status}</Badge>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Cerrar detalle" onClick={() => onOpenChange(false)}>
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <Section title="Servicio">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Ítem">{item.service_items?.item_name ?? EMPTY_VALUE}</Field>
              <Field label="Cantidad">{quantity || EMPTY_VALUE}</Field>
              <Field label="Contrato">{item.customer_services?.service_name ?? EMPTY_VALUE}</Field>
              <Field label="Solicitante">{item.solicitante || EMPTY_VALUE}</Field>
              {item.equipos_clientes?.name ? <Field label="Equipo del cliente">{item.equipos_clientes.name}</Field> : null}
              {item.observaciones ? <Field label="Observaciones">{item.observaciones}</Field> : null}
            </dl>
          </Section>

          <Section title="Cuándo y dónde">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Solicitud">
                <span className="tabular-nums">{formatCalendarDate(item.requestDate)}</span>
              </Field>
              <Field label="Ejecución">
                {item.executionDate ? (
                  <span className="tabular-nums">{formatCalendarDate(item.executionDate)}</span>
                ) : (
                  'A disponibilidad'
                )}
              </Field>
              <Field label="Jornada y horario">{schedule || EMPTY_VALUE}</Field>
              <Field label="Sector · área">{place || EMPTY_VALUE}</Field>
            </dl>
          </Section>

          {image ? (
            <Section title="Imagen del pedido">
              {image.toLowerCase().includes('.pdf') ? (
                <iframe src={image} title="Documento adjunto del pedido" className="h-72 w-full rounded-md border" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="Imagen adjunta al pedido" className="max-h-72 w-full rounded-md border object-contain" />
              )}
            </Section>
          ) : null}

          {reason ? (
            <Section title="Motivo">
              <div className="bg-warn-subtle text-warn-subtle-foreground space-y-2 rounded-md p-3 text-sm">
                <p className="font-medium">{reason.title}</p>
                <p className="break-words [overflow-wrap:anywhere]">{reason.content}</p>
                {reason.actor && reason.actorLabel ? (
                  <p className="flex flex-wrap items-center gap-1.5 border-t border-current/20 pt-2">
                    <span className="font-medium">{reason.actorLabel}:</span>
                    <Link
                      href={`/dashboard/configuration?subtab=users&company-users__search=${encodeURIComponent(reason.actor)}`}
                      className="focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <User className="size-3.5" aria-hidden="true" />
                      {reason.actor}
                    </Link>
                  </p>
                ) : null}
              </div>
            </Section>
          ) : null}

          <Section title="Historial">
            <OrderHistory orderId={item.id} open={open} />
          </Section>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t p-4">
          {hasActions ? (
            <>
              {canCancel ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive mr-auto"
                  onClick={() => onAction('cancel')}
                >
                  Cancelar pedido
                </Button>
              ) : null}
              {canEdit ? (
                <Button type="button" variant="outline" onClick={() => onAction('edit')}>
                  Editar
                </Button>
              ) : null}
              {canReject ? (
                <Button type="button" variant="outline" onClick={() => onAction('reject')}>
                  Rechazar
                </Button>
              ) : null}
              {canReprogram ? (
                <Button type="button" variant="outline" onClick={() => onAction('reprogram')}>
                  Reprogramar
                </Button>
              ) : null}
              {canConfirm ? (
                <Button type="button" onClick={() => onAction('confirm')}>
                  Confirmar
                </Button>
              ) : null}
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          )}
        </footer>
      </SheetContent>
    </Sheet>
  );
}
