'use client';

import { Button } from '@/components/ui/button';
import { MetricCard } from '@/shared/components/common/MetricCard';
import { CalendarDays, CheckCircle2, RotateCcw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface LoadTotals {
  created: number;
  replaced: number;
  skipped: number;
  errors: number;
}

interface LoadResultPanelProps {
  totals: LoadTotals;
  /** Una línea sobre lo que se procesó (empleados, días). */
  description: ReactNode;
  onReset: () => void;
  /** Enlace al calendario; sin valor (por ejemplo, dentro del detalle del empleado) no se muestra. */
  calendarHref?: string;
  /** Detalle (listas de registros, avisos) debajo de los totales. */
  children?: ReactNode;
  /** Acciones extra (por ejemplo, descargar el reporte). */
  extraActions?: ReactNode;
}

/** Foco al montar: el lector de pantalla anuncia el resultado y el teclado queda donde está lo nuevo. */
const focusOnMount = (node: HTMLElement | null) => node?.focus();

/** Resultado de una carga: totales (creados, reemplazados, omitidos, errores) y las acciones para seguir. */
export function LoadResultPanel({
  totals,
  description,
  onReset,
  calendarHref,
  children,
  extraActions,
}: LoadResultPanelProps) {
  const hasErrors = totals.errors > 0;
  const Icon = hasErrors ? TriangleAlert : CheckCircle2;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div role="status" className="flex items-start gap-3">
        <span
          className={
            hasErrors
              ? 'bg-warn-subtle text-warn-subtle-foreground flex size-10 shrink-0 items-center justify-center rounded-full'
              : 'bg-ok-subtle text-ok-subtle-foreground flex size-10 shrink-0 items-center justify-center rounded-full'
          }
        >
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 ref={focusOnMount} tabIndex={-1} className="text-lg leading-tight font-semibold outline-none">
            {hasErrors ? 'Carga terminada con errores' : 'Carga terminada'}
          </h3>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Creados" value={totals.created} hint="Novedades nuevas" tone="ok" />
        <MetricCard label="Reemplazados" value={totals.replaced} hint="Pisaron otra novedad" tone="brand" />
        <MetricCard label="Omitidos" value={totals.skipped} hint="Quedaron como estaban" />
        <MetricCard
          label="Errores"
          value={totals.errors}
          hint="No se cargaron"
          tone={hasErrors ? 'danger' : 'default'}
        />
      </div>

      {children}

      <div className="flex flex-wrap justify-end gap-2">
        {extraActions}
        <Button type="button" variant="outline" className="min-h-10" onClick={onReset}>
          <RotateCcw aria-hidden="true" />
          Cargar otra
        </Button>
        {calendarHref ? (
          <Button asChild variant="brand" className="min-h-10">
            <Link href={calendarHref}>
              <CalendarDays aria-hidden="true" />
              Ver en el calendario
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
