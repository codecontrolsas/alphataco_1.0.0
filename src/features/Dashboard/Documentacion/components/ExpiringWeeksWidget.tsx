import { cn } from '@/lib/utils';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { CalendarCheck } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { dayFromToday, expiringListHref, overdueListHref, type DocumentResourceKind } from '../lib/document-list-links';
import { WEEKS_SHOWN, remainderAfterWeeks, weeklyBuckets } from '../lib/expiring-buckets';
import { loadExpiringOverview } from '../lib/expiring-overview.server';
import { ExpiringSourcesState, KIND_LABEL, visibleSources } from './ExpiringSourceNotices';

const BAR_TONE = { employees: 'bg-brand', vehicles: 'bg-info' } as const satisfies Record<DocumentResourceKind, string>;

const linkClass =
  'hover:bg-muted focus-visible:ring-ring rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums outline-none focus-visible:ring-2';

/**
 * Widget "Vencimientos por semana": barras de las próximas 4 semanas (corridas desde hoy), con personal y
 * equipos apilados, y una fila aparte con los documentos ya vencidos. Las barras son filas de texto con
 * cantidades (leíbles por lectores de pantalla); cada cantidad enlaza a la lista filtrada.
 */
export async function ExpiringWeeksWidget() {
  const overview = await loadExpiringOverview();
  const sources = visibleSources(overview);
  const state = <ExpiringSourcesState sources={sources} />;
  const ready = sources.flatMap(({ kind, source }) =>
    source.status === 'ok' ? [{ kind, series: source.series }] : []
  );

  if (ready.length === 0) return state;

  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, index) => ({
    index,
    perKind: ready.map(({ kind, series }) => ({ kind, bucket: weeklyBuckets(series)[index] })),
  }));
  const weekTotal = (index: number) => weeks[index].perKind.reduce((sum, { bucket }) => sum + bucket.count, 0);
  const overdue = ready.reduce((sum, { series }) => sum + series.overdue, 0);
  const remainder = ready.reduce((sum, { series }) => sum + remainderAfterWeeks(series), 0);
  const peak = Math.max(...weeks.map((week) => weekTotal(week.index)), overdue, 1);
  const total = weeks.reduce((sum, week) => sum + weekTotal(week.index), 0);

  if (total === 0 && overdue === 0 && remainder === 0) {
    return (
      <>
        {state}
        <StateBlock
          variant="empty"
          icon={CalendarCheck}
          title="Sin vencimientos en las próximas 4 semanas"
          description="No hay documentos vencidos ni por vencer en este período."
        />
      </>
    );
  }

  const rangeLabel = (from: number, to: number) =>
    `${moment.utc(dayFromToday(overview.today, from)).format('DD/MM')} al ${moment.utc(dayFromToday(overview.today, to)).format('DD/MM')}`;

  return (
    <div className="space-y-4">
      {state}

      <ul className="space-y-3">
        {overdue > 0 && (
          <li className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[8rem_1fr]">
            <span className="text-danger-subtle-foreground text-sm font-medium">Vencidos</span>
            <div className="flex min-w-0 items-center gap-2">
              <div className="bg-muted h-5 min-w-0 flex-1 overflow-hidden rounded-sm">
                <div className="bg-danger h-full rounded-sm" style={{ width: `${(overdue / peak) * 100}%` }} />
              </div>
              <span className="flex shrink-0 items-center">
                {ready.map(({ kind, series }) =>
                  series.overdue > 0 ? (
                    <Link
                      key={kind}
                      href={overdueListHref(kind, overview.today)}
                      className={linkClass}
                      aria-label={`${KIND_LABEL[kind]}: ${series.overdue} vencidos`}
                    >
                      {series.overdue}
                    </Link>
                  ) : null
                )}
              </span>
            </div>
          </li>
        )}

        {weeks.map((week) => {
          const from = week.index * 7;
          const to = from + 6;
          const count = weekTotal(week.index);
          return (
            <li
              key={week.index}
              className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[8rem_1fr]"
            >
              <span className="text-sm">
                <span className="block font-medium">
                  {week.index === 0 ? 'Esta semana' : `Semana ${week.index + 1}`}
                </span>
                <span className="text-muted-foreground block text-xs">{rangeLabel(from, to)}</span>
              </span>
              <div className="flex min-w-0 items-center gap-2">
                <div className="bg-muted flex h-5 min-w-0 flex-1 overflow-hidden rounded-sm" aria-hidden="true">
                  {week.perKind.map(({ kind, bucket }) =>
                    bucket.count > 0 ? (
                      <div
                        key={kind}
                        className={cn('h-full', BAR_TONE[kind])}
                        style={{ width: `${(bucket.count / peak) * 100}%` }}
                      />
                    ) : null
                  )}
                </div>
                <span className="flex shrink-0 items-center">
                  {count === 0 ? (
                    <span className="text-muted-foreground px-1.5 font-mono text-xs tabular-nums">0</span>
                  ) : (
                    week.perKind.map(({ kind, bucket }) =>
                      bucket.count > 0 ? (
                        <Link
                          key={kind}
                          href={expiringListHref(kind, {
                            from: dayFromToday(overview.today, from),
                            to: dayFromToday(overview.today, to),
                          })}
                          className={linkClass}
                          aria-label={`${KIND_LABEL[kind]}: ${bucket.count} ${bucket.count === 1 ? 'vence' : 'vencen'} del ${rangeLabel(from, to)}`}
                        >
                          {bucket.count}
                        </Link>
                      ) : null
                    )
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-3 text-xs">
        <span className="flex items-center gap-3">
          {ready.map(({ kind }) => (
            <span key={kind} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn('size-2.5 rounded-sm', BAR_TONE[kind])} />
              {KIND_LABEL[kind]}
            </span>
          ))}
        </span>
        {remainder > 0 && (
          <span>
            {remainder} {remainder === 1 ? 'vence' : 'vencen'} entre los días 28 y 30 (fuera de las 4 semanas)
          </span>
        )}
      </div>
    </div>
  );
}
