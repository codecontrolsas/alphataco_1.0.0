'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TabsManagerClientSide } from '@/features/TabsManager';
import { cn } from '@/lib/utils';
import InfoComponent from '@/shared/components/common/InfoComponent';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { CalendarIcon } from '@radix-ui/react-icons';
import { FolderOpen, Plus } from 'lucide-react';
import moment from 'moment';
import { useState } from 'react';
import { DateRange } from 'react-day-picker';
import DiagramFormUpdated from './DiagramFormUpdated';
import { DiagramDetailTable, type DiagramHistoryRow } from './table/DiagramDetailTable';
import { DetailDiagramColums } from './table/diagram-detail-colums';
/** Hoy en hora argentina como fecha local a medianoche (lo que espera el calendario). */
const argentinaToday = () => moment(argentinaDate(), 'YYYY-MM-DD');

type diagram = {
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
};

export function DiagramDetailEmployeeView({
  diagrams,
  diagrams_types,
  activeEmploees,
  historyData,
  role,
  searchParams = {},
}: {
  historyData: DiagramHistoryRow[];
  diagrams: diagram[] | [];
  diagrams_types: { id: string; name: string | null }[];
  activeEmploees: { id: string }[];
  role?: string | null;
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const [date, setDate] = useState<DateRange | undefined>({
    from: argentinaToday().toDate(),
    to: argentinaToday().add(30, 'days').toDate(),
  });
  const [diagramType, setDiagramType] = useState<{ id: string; name: string } | undefined>(undefined);

  function filterDiagramsByDate(diagrams: diagram[], date: DateRange | undefined) {
    if (!date) {
      return diagrams;
    }

    return diagrams.filter((diagram) => {
      const diagramDate = new Date(diagram.year, diagram.month - 1, diagram.day);
      return diagramDate >= (date.from ?? new Date(0)) && diagramDate <= (date.to ?? argentinaToday().toDate());
    });
  }

  function filterDiagramsByType(diagrams: diagram[], diagramType: { id: string; name: string } | undefined) {
    if (!diagramType) {
      return diagrams;
    }

    return diagrams.filter((diagram) => diagram.diagram_type.id === diagramType.id);
  }

  const diagramsFilteredByDate = filterDiagramsByDate(diagrams, date);
  const diagramsFilteredByType = filterDiagramsByType(diagramsFilteredByDate, diagramType);

  const tabs = [
    {
      value: 'Diagramas',
      label: (
        <span className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4" />
          Diagramas
        </span>
      ),
      moduleSlug: 'empleados' as const,
      tabSlug: 'diagramas-empleado' as const,
      content: (
        <div>
          <div className={cn('gap-2 flex')}>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  id="date"
                  variant={'outline'}
                  className={cn('w-[300px] justify-start text-left font-normal', !date && 'text-muted-foreground')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date?.from ? (
                    date.to ? (
                      <>
                        {moment(date.from).format('DD/MM/YYYY')} - {moment(date.to).format('DD/MM/YYYY')}
                      </>
                    ) : (
                      moment(date.from).format('DD/MM/YYYY')
                    )
                  ) : (
                    <span>Seleccionar fecha</span>
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
            <InfoComponent message="La selección máxima es de 30 días" size="sm" />
          </div>
          <div className="gap-4 pr-7 ">
            <div className=" mt-3">
              <div className=" w-full">
                <DiagramDetailTable
                  columns={DetailDiagramColums}
                  historyData={historyData}
                  data={diagramsFilteredByType
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((diagram) => ({
                      ...diagram,
                      ...diagram.diagram_type,
                      diagram_type_id: diagram.diagram_type.id,
                      diagram_type_created_at: diagram.diagram_type.created_at,
                      created_at: `${diagram.year}-${diagram.month}-${diagram.day}`,
                    }))}
                />
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      value: 'NuevoDiagrama',
      label: (
        <span className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Nuevo Diagrama
        </span>
      ),
      moduleSlug: 'empleados' as const,
      tabSlug: 'new' as const, // Hereda de empleados/diagrams/new
      content: <DiagramFormUpdated diagrams_types={diagrams_types} defaultId={activeEmploees[0].id} />,
    },
  ] as const;

  return <TabsManagerClientSide<'empleados'> paramName="subtab" defaultTab="Diagramas" tabs={tabs} />;
}

/* TODO

1- Filtrar por fecha 👌 
2- Filtrar por tipo de diagrama 👌 
  2.1 - Crear un select con los tipos de diagramas 👌 
  2.2 - Traer los tipos de diagramas desde la API (no fue necesario, se filtra por las opciones que tenga el usuario) 👌
  2.3 - Filtrar los diagramas por el tipo seleccionado 👌 
3- Agregar un botón para descargar los diagramas
4- Agregar un boton para editar diagramas

*/

{
  /* <select value={diagramType?.id} onChange={handleDiagramTypeChange} className="mb-4">
          <option value="">Todos los tipos de diagrama</option>
          {diagramTypes.map((diagram) => (
            <option key={diagram.id} value={diagram.id}>
              {diagram.name}
            </option>
          ))}
        </select> */
}
