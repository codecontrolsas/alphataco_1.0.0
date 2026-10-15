'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { CalendarIcon, Plus } from 'lucide-react';
import moment from 'moment';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import DiagramFormUpdated from './DiagramFormUpdated';
import { DiagramDetailTable, type DiagramHistoryRow } from './table/DiagramDetailTable';
import { DetailDiagramColums } from './table/diagram-detail-colums';

/** Hoy en hora argentina como fecha local a medianoche (lo que espera el calendario). */
const argentinaToday = () => moment(argentinaDate(), 'YYYY-MM-DD');

interface EmployeeDiagramEntry {
  id: string;
  created_at: string;
  employee_id: string;
  diagram_type: {
    id: string;
    name: string;
    color: string;
    company_id: string;
    created_at: string;
    short_description: string;
  };
  day: number;
  month: number;
  year: number;
  /** Comentario opcional cargado junto con la novedad */
  comments?: string | null;
}

/** Día de la novedad como `YYYY-MM-DD` (las partes vienen sueltas de la base). */
const entryDay = (entry: EmployeeDiagramEntry) =>
  moment(`${entry.year}-${entry.month}-${entry.day}`, 'YYYY-M-D').format('YYYY-MM-DD');

/**
 * Diagrama de un empleado en su ficha: novedades del período elegido + historial de cambios.
 * La carga de novedades se hace en un panel lateral (antes era una pestaña aparte) con el empleado fijo.
 */
export function DiagramDetailEmployeeView({
  diagrams,
  diagrams_types,
  employeeId,
  historyData,
}: {
  historyData: DiagramHistoryRow[];
  diagrams: EmployeeDiagramEntry[];
  diagrams_types: { id: string; name: string | null }[];
  employeeId: string;
}) {
  const [date, setDate] = useState<DateRange | undefined>({
    from: argentinaToday().toDate(),
    to: argentinaToday().add(30, 'days').toDate(),
  });
  const [isLoadOpen, setIsLoadOpen] = useState(false);
  const { canView } = usePermissions();
  // Misma regla que tenía la pestaña "Nuevo Diagrama": visible con la pestaña de carga de diagramas.
  const canLoad = canView('empleados', 'new');
  const canSeeHistory = canView('empleados', 'diagramas-empleado');

  const from = date?.from ? moment(date.from).format('YYYY-MM-DD') : null;
  const to = date?.from ? moment(date.to ?? argentinaToday().toDate()).format('YYYY-MM-DD') : null;

  const rows = diagrams
    .filter((entry) => {
      if (!from || !to) return true;
      const day = entryDay(entry);
      return day >= from && day <= to;
    })
    .sort((a, b) => moment(b.created_at).valueOf() - moment(a.created_at).valueOf())
    .map((entry) => ({
      ...entry,
      ...entry.diagram_type,
      diagram_type_id: entry.diagram_type.id,
      diagram_type_created_at: entry.diagram_type.created_at,
      created_at: `${entry.year}-${entry.month}-${entry.day}`,
    }));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {canSeeHistory ? (
        <SectionCard
          className="@container min-w-0"
          title="Novedades del período"
          action={
            canLoad ? (
              <Button type="button" variant="brand" className="min-h-10" onClick={() => setIsLoadOpen(true)}>
                <Plus aria-hidden="true" className="size-4" />
                Cargar novedad
              </Button>
            ) : null
          }
        >
          <div className="flex min-w-0 flex-col gap-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Período de las novedades"
                  className={cn(
                    'min-h-10 w-full justify-start text-left font-normal sm:w-72',
                    !date && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon aria-hidden="true" className="size-4" />
                  {date?.from ? (
                    <span className="font-mono tabular-nums">
                      {moment(date.from).format('DD/MM/YYYY')}
                      {date.to ? ` – ${moment(date.to).format('DD/MM/YYYY')}` : ''}
                    </span>
                  ) : (
                    <span>Elegir período</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={date?.from}
                  selected={date}
                  onSelect={setDate}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>

            <div className="min-w-0 overflow-x-auto">
              <DiagramDetailTable columns={DetailDiagramColums} historyData={historyData} data={rows} />
            </div>
          </div>
        </SectionCard>
      ) : (
        // Sin la vista de novedades pero con la carga: el formulario va directo, como antes.
        canLoad && (
          <SectionCard title="Cargar novedad">
            <DiagramFormUpdated diagrams_types={diagrams_types} defaultId={employeeId} />
          </SectionCard>
        )
      )}

      {canLoad && canSeeHistory ? (
        <Sheet open={isLoadOpen} onOpenChange={setIsLoadOpen}>
          <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-3xl">
            <SheetHeader className="px-4 pt-6 pb-4 sm:px-6">
              <SheetTitle>Cargar novedad</SheetTitle>
              <SheetDescription>Para este empleado, uno o varios días.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
              {isLoadOpen ? <DiagramFormUpdated diagrams_types={diagrams_types} defaultId={employeeId} /> : null}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
