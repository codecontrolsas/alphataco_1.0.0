'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangeFields, type DayRange } from '@/shared/components/common/DateRangeFields';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { getDocumentAuditEvents } from '../../actions/audit';
import { AUDIT_ACTOR_KIND_LABELS, AUDIT_EVENTS, AUDIT_EVENT_LABELS, type AuditEvent } from '../../lib/audit-events';
import type { FitResourceKind } from '../../lib/customer-fit';
import { resourceHref } from '../pending/resource-link';

const ALL = 'all';

const EVENT_VARIANT: Partial<Record<AuditEvent, 'success' | 'destructive' | 'warning' | 'info' | 'secondary'>> = {
  approved: 'success',
  ai_validated: 'success',
  rejected: 'destructive',
  deleted: 'destructive',
  ai_pending: 'warning',
  external_upload: 'info',
};

function actorText(actor: string | null, kind: string | null): string {
  if (actor)
    return kind && kind !== 'user' && AUDIT_ACTOR_KIND_LABELS[kind]
      ? `${actor} (${AUDIT_ACTOR_KIND_LABELS[kind]})`
      : actor;
  return (kind && AUDIT_ACTOR_KIND_LABELS[kind]) ?? 'Sistema';
}

/** Auditoría: quién cargó, reemplazó, aprobó, rechazó o dio de baja cada documento, y cuándo. */
export function DocumentAuditClient({ kinds }: { kinds: FitResourceKind[] }) {
  const [range, setRange] = useState<DayRange>({ from: '', to: '' });
  const [event, setEvent] = useState<AuditEvent | typeof ALL>(ALL);
  const [kind, setKind] = useState<FitResourceKind | typeof ALL>(ALL);
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ['document-audit', range.from, range.to, event, kind, page],
    queryFn: () =>
      getDocumentAuditEvents({
        from: range.from || undefined,
        to: range.to || undefined,
        event: event === ALL ? undefined : event,
        kind: kind === ALL ? undefined : kind,
        page,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const data = query.data?.ok ? query.data : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const resetPage = () => setPage(0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateRangeFields
          value={range}
          onChange={(value) => {
            setRange(value);
            resetPage();
          }}
        />
        <div className="space-y-1">
          <span className="text-xs font-medium">Evento</span>
          <Select
            value={event}
            onValueChange={(value) => {
              setEvent(value as AuditEvent | typeof ALL);
              resetPage();
            }}
          >
            <SelectTrigger className="w-52" aria-label="Evento">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los eventos</SelectItem>
              {AUDIT_EVENTS.map((e) => (
                <SelectItem key={e} value={e}>
                  {AUDIT_EVENT_LABELS[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {kinds.length > 1 && (
          <div className="space-y-1">
            <span className="text-xs font-medium">Recurso</span>
            <Select
              value={kind}
              onValueChange={(value) => {
                setKind(value as FitResourceKind | typeof ALL);
                resetPage();
              }}
            >
              <SelectTrigger className="w-40" aria-label="Recurso">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Personal y equipos</SelectItem>
                <SelectItem value="Persona">Personal</SelectItem>
                <SelectItem value="Equipos">Equipos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {query.isPending ? (
        <div className="space-y-2" role="status" aria-label="Cargando la auditoría">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : query.isError || query.data?.ok === false ? (
        <StateBlock
          variant="error"
          title="No se pudo leer la auditoría"
          description={query.data?.ok === false ? query.data.error : 'Intentá de nuevo en unos segundos.'}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
              Reintentar
            </Button>
          }
        />
      ) : data && data.events.length === 0 ? (
        <StateBlock
          variant="empty"
          title="Sin movimientos"
          description="No hay cargas, aprobaciones, rechazos ni bajas de documentos con estos filtros."
        />
      ) : data ? (
        <>
          <p role="status" className="text-muted-foreground text-sm tabular-nums">
            {data.total} {data.total === 1 ? 'movimiento' : 'movimientos'}
          </p>
          <ul className={`divide-y rounded-md border ${query.isFetching ? 'opacity-60' : ''}`}>
            {data.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
                <Badge
                  variant={EVENT_VARIANT[e.event as AuditEvent] ?? 'secondary'}
                  className="mt-0.5 w-40 justify-center"
                >
                  {AUDIT_EVENT_LABELS[e.event as AuditEvent] ?? e.event}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {e.documentId && e.event !== 'deleted' ? (
                      <Link href={`/dashboard/document/${e.documentId}?resource=${e.kind}`} className="hover:underline">
                        {e.documentType}
                      </Link>
                    ) : (
                      e.documentType
                    )}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {e.resourceId ? (
                      <Link href={resourceHref(e.kind, e.resourceId)} className="hover:underline">
                        {e.resource}
                      </Link>
                    ) : (
                      e.resource
                    )}
                    {' · '}
                    {actorText(e.actor, e.actorKind)}
                  </p>
                  {e.detail && <p className="text-muted-foreground mt-0.5 text-sm">Detalle: {e.detail}</p>}
                </div>
                <time dateTime={e.createdAt} className="text-muted-foreground font-mono text-xs tabular-nums">
                  {formatArgentinaDateTime(e.createdAt)}
                </time>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="Páginas de la auditoría">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <span className="text-muted-foreground text-sm tabular-nums">
                Página {page + 1} de {pages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </nav>
          )}
        </>
      ) : null}
    </div>
  );
}
