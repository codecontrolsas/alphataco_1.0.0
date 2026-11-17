'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { StateBlock } from '@/shared/components/common/StateBlock';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ExpiryCalendar } from '../../lib/pending.server';
import { formatIsoDay } from '../../utils/issue-text';
import { resourceHref } from './resource-link';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
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

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Meses que cubre el rango `[from, to]`: año y mes (0-11). */
function monthsBetween(from: string, to: string): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7)) - 1;
  const endKey = to.slice(0, 7);
  while (iso(year, month, 1).slice(0, 7) <= endKey) {
    result.push({ year, month });
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return result;
}

/** Calendario de vencimientos de los próximos 90 días: cuántos documentos vencen cada día y cuáles son. */
export function ExpiryCalendarClient({ data }: { data: ExpiryCalendar }) {
  const byDay = useMemo(() => {
    const map = new Map<string, ExpiryCalendar['upcoming']>();
    for (const item of data.upcoming) {
      const list = map.get(item.validity!) ?? [];
      list.push(item);
      map.set(item.validity!, list);
    }
    return map;
  }, [data.upcoming]);

  const firstDay = data.upcoming[0]?.validity ?? null;
  const [selected, setSelected] = useState<string | null>(firstDay);
  const months = useMemo(() => monthsBetween(data.today, data.limit), [data.today, data.limit]);
  const selectedItems = selected ? byDay.get(selected) ?? [] : [];

  if (data.upcoming.length === 0) {
    return (
      <StateBlock
        variant="empty"
        title="Nada vence en los próximos 90 días"
        description="No hay documentos vigentes con vencimiento en este período."
      />
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
        {months.map(({ year, month }) => {
          const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
          const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
          return (
            <section key={`${year}-${month}`} aria-label={`${MONTHS[month]} ${year}`} className="space-y-2">
              <h3 className="text-sm font-semibold capitalize">
                {MONTHS[month]} {year}
              </h3>
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {WEEKDAYS.map((w) => (
                  <span key={w} className="text-muted-foreground py-1" aria-hidden="true">
                    {w}
                  </span>
                ))}
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`pad-${i}`} aria-hidden="true" />
                ))}
                {Array.from({ length: days }, (_, i) => {
                  const day = iso(year, month, i + 1);
                  const count = byDay.get(day)?.length ?? 0;
                  const inRange = day >= data.today && day <= data.limit;
                  const label = `${i + 1} de ${MONTHS[month]}: ${count} ${count === 1 ? 'vencimiento' : 'vencimientos'}`;
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={!inRange || count === 0}
                      aria-label={label}
                      aria-pressed={selected === day}
                      onClick={() => setSelected(day)}
                      className={cn(
                        'focus-visible:ring-ring flex aspect-square flex-col items-center justify-center rounded-md text-xs outline-none focus-visible:ring-2 disabled:cursor-default',
                        !inRange && 'text-muted-foreground/40',
                        inRange && count === 0 && 'text-muted-foreground',
                        count > 0 && 'bg-warn-subtle text-warn-subtle-foreground hover:bg-warn-subtle/70 font-semibold',
                        count >= 5 && 'bg-danger-subtle text-danger-subtle-foreground hover:bg-danger-subtle/70',
                        selected === day && 'ring-brand ring-2',
                        day === data.today && 'underline'
                      )}
                    >
                      <span>{i + 1}</span>
                      {count > 0 && <span className="font-mono text-[10px] tabular-nums">{count}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <section aria-labelledby="calendar-day" className="space-y-3">
        <h3 id="calendar-day" className="text-sm font-semibold" aria-live="polite">
          {selected ? `Vencen el ${formatIsoDay(selected)} (${selectedItems.length})` : 'Elegí un día con vencimientos'}
        </h3>
        <ul className="divide-y rounded-md border">
          {selectedItems.map((item) => (
            <li key={`${item.tab}-${item.id}`} className="space-y-0.5 px-3 py-2 text-sm">
              <p className="font-medium">{item.typeName}</p>
              <p className="text-muted-foreground flex items-center gap-2 text-xs">
                <Badge variant="outline">{item.kind === 'Persona' ? 'Persona' : 'Equipo'}</Badge>
                <Link href={resourceHref(item.kind, item.resourceId)} className="truncate hover:underline">
                  {item.resourceLabel}
                </Link>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
