import { cn } from '@/lib/utils';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { CalendarCheck } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { dayFromToday, expiringListHref, overdueListHref, type DocumentResourceKind } from '../lib/document-list-links';
import { TIMELINE_DAYS, dueLabel, totalUpcoming } from '../lib/expiring-buckets';
import { loadExpiringOverview } from '../lib/expiring-overview.server';
import { ExpiringSourcesState, KIND_LABEL, visibleSources } from './ExpiringSourceNotices';

/** Cuántos días con vencimientos se detallan debajo de la línea. */
const DETAILED_DAYS = 5;
const WARN_WITHIN_DAYS = 7;

const linkClass =
  'hover:bg-muted focus-visible:ring-ring rounded-md px-2 py-1 text-xs font-medium outline-none focus-visible:ring-2';

/**
 * Widget "Línea de vencimientos": documentos de personal y equipos que vencen en los próximos 30 días, día por
 * día, más los ya vencidos. Solo lectura; cada número enlaza a la lista de permanentes con el filtro aplicado.
 * Usa las mismas filas que `expiring-*-docs` (carga única por request) y solo muestra lo que el usuario puede ver.
 */
export async function ExpiringTimelineWidget() {
  const overview = await loadExpiringOverview();
  const sources = visibleSources(overview);
  const state = <ExpiringSourcesState sources={sources} />;
  const ready = sources.flatMap(({ kind, source }) =>
    source.status === 'ok' ? [{ kind, series: source.series }] : []
  );

  if (ready.length === 0) return state;

  const perDay = Array.from({ length: TIMELINE_DAYS + 1 }, (_, day) =>
    ready.map(({ kind, series }) => ({ kind, count: series.byDay[day] }))
  );
  const dayTotals = perDay.map((entries) => entries.reduce((sum, entry) => sum + entry.count, 0));
  const upcoming = ready.reduce((sum, { series }) => sum + totalUpcoming(series), 0);
  const overdue = ready.reduce((sum, { series }) => sum + series.overdue, 0);
  const peak = Math.max(...dayTotals, 1);

  if (upcoming === 0 && overdue === 0) {
    return (
      <>
        {state}
        <StateBlock
          variant="empty"
          icon={CalendarCheck}
          title="Sin vencimientos en los próximos 30 días"
          description="No hay documentos vencidos ni por vencer en este período."
        />
      </>
    );
  }

  const detailedDays = dayTotals.flatMap((total, day) => (total > 0 ? [day] : [])).slice(0, DETAILED_DAYS);
  const dateOf = (day: number) => moment.utc(dayFromToday(overview.today, day)).format('DD/MM');

  return (
    <div className="space-y-4">
      {state}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <p>
          <span className="font-mono text-2xl font-semibold tabular-nums">{upcoming}</span>{' '}
          <span className="text-muted-foreground">
            {upcoming === 1 ? 'vence' : 'vencen'} en los próximos {TIMELINE_DAYS} días
          </span>
        </p>
        {overdue > 0 && (
          <p className="text-danger-subtle-foreground flex flex-wrap items-center gap-1">
            <span className="font-mono text-lg font-semibold tabular-nums">{overdue}</span>
            <span>{overdue === 1 ? 'vencido' : 'vencidos'}</span>
            {ready.map(({ kind, series }) =>
              series.overdue > 0 ? (
                <Link key={kind} href={overdueListHref(kind, overview.today)} className={cn(linkClass, 'underline')}>
                  {KIND_LABEL[kind]} {series.overdue}
                </Link>
              ) : null
            )}
          </p>
        )}
      </div>

      <div>
        <div className="flex h-24 items-end gap-0.5" aria-hidden="true">
          {dayTotals.map((total, day) => (
            <div
              key={day}
              title={`${dateOf(day)}: ${total} ${total === 1 ? 'documento' : 'documentos'}`}
              className={cn(
                'min-w-0 flex-1 rounded-t-sm',
                total === 0 ? 'bg-muted' : day <= WARN_WITHIN_DAYS ? 'bg-warn' : 'bg-brand'
              )}
              style={{ height: total === 0 ? '2px' : `${Math.max((total / peak) * 100, 8)}%` }}
            />
          ))}
        </div>
        <div className="text-muted-foreground mt-1 flex justify-between text-xs" aria-hidden="true">
          <span>Hoy</span>
          <span>{dateOf(10)}</span>
          <span>{dateOf(20)}</span>
          <span>{dateOf(TIMELINE_DAYS)}</span>
        </div>
      </div>

      {detailedDays.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {detailedDays.map((day) => (
            <li key={day} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm">
              <span className="flex items-baseline gap-2">
                <span className="font-mono tabular-nums">{dateOf(day)}</span>
                <span className="text-muted-foreground">{dueLabel(day)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {perDay[day].map(({ kind, count }) =>
                  count > 0 ? (
                    <DayLink key={kind} kind={kind} count={count} day={dayFromToday(overview.today, day)} />
                  ) : null
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DayLink({ kind, count, day }: { kind: DocumentResourceKind; count: number; day: string }) {
  return (
    <Link href={expiringListHref(kind, { from: day, to: day })} className={cn(linkClass, 'bg-muted')}>
      {KIND_LABEL[kind]} <span className="font-mono font-semibold tabular-nums">{count}</span>
    </Link>
  );
}
