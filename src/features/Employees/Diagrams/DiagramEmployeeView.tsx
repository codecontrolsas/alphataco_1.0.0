'use client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarIcon } from '@radix-ui/react-icons';
import { DateRange } from 'react-day-picker';

import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Form, FormDescription, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import InfoComponent from '@/shared/components/common/InfoComponent';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowDownIcon, ArrowUpIcon, FileDown } from 'lucide-react';
import moment from 'moment';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { z } from 'zod';

/** Hoy en hora argentina como fecha local a medianoche (lo que espera el calendario). */
const argentinaToday = () => moment(argentinaDate(), 'YYYY-MM-DD');

// Tipo para un diagrama
type DiagramType = {
  created_at: string;
  day: number;
  diagram_type: {
    color: string;
    company_id: string;
    created_at: string;
    id: string;
    is_active: boolean;
    name: string | null;
    short_description: string;
    work_active: boolean | null;
  };
  employee_id: string;
  id: string;
  month: number;
  year: number;
  /** Comentario opcional cargado junto con la novedad */
  comments?: string | null;
};

// Tipo para un empleado con sus diagramas
type EmployeeWithDiagrams = {
  value: string;
  label: string;
  diagrams: DiagramType[];
  // Datos del empleado para el export a Excel (opcionales para retrocompatibilidad)
  position?: string;
  sector?: string;
  dateOfAdmission?: string | null;
  workDiagram?: string;
  costCenter?: string;
  category?: string;
  covenant?: string;
  guild?: string;
};

/**
 * Grilla mensual de novedades por empleado (resultado del buscador de diagramas).
 * Los datos llegan del wrapper, que los mantiene al día con React Query (`refetchInterval`):
 * ya no hay suscripción realtime a `employees_diagram`.
 */
function DiagramEmployeeView({
  employeesData,
  dateRange,
  onDateRangeChange,
}: {
  employeesData: EmployeeWithDiagrams[];
  /** Rango controlado por el wrapper: así el servidor trae las novedades de la ventana que se está mirando. */
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
}) {
  const [localDate, setLocalDate] = useState<DateRange | undefined>({
    from: argentinaToday().toDate(),
    to: argentinaToday().add(30, 'days').toDate(),
  });
  const date = onDateRangeChange ? dateRange : localDate;
  const setDate = onDateRangeChange ?? setLocalDate;
  // `null` = "todos los empleados de la búsqueda": así una recarga de datos (refetch o
  // "cargar más") no pisa la selección del usuario ni hace falta un useEffect para resetearla.
  const [pickedResources, setPickedResources] = useState<string[] | null>(null);
  const selectedResources = useMemo(
    () => pickedResources ?? employeesData.map((employee) => employee.value),
    [pickedResources, employeesData]
  );

  /*--------------------- ESQUEMA EMPLEADOS ---------------------------*/
  const formSchema = z.object({
    resources: z
      .array(z.string(), { required_error: 'Los recursos son requeridos' })
      .min(1, 'Selecciona al menos 1 recurso'),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      resources: [],
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    // No es necesario hacer nada más ya que los recursos se actualizan vía onChange
  }

  /*--------------------- FILTROS DE FECHA ---------------------------*/
  const fechaInicio = date?.from;
  const fechaFin = date?.to;

  // Generar el rango de fechas a mostrar (máximo 30 días)
  function generarDiasEntreFechas({ fechaInicio, fechaFin }: { fechaInicio?: Date; fechaFin?: Date }) {
    const dias: Date[] = [];
    if (!fechaInicio) return dias;

    let fechaActual = new Date(fechaInicio);
    const fechaFinalMaxima = new Date(fechaInicio);
    fechaFinalMaxima.setDate(fechaFinalMaxima.getDate() + 30);

    // Usar la fecha final proporcionada o la fecha final máxima, la que sea menor
    const fechaFinal = fechaFin ? new Date(fechaFin) : fechaFinalMaxima;
    const fechaFinalReal = fechaFinal <= fechaFinalMaxima ? fechaFinal : fechaFinalMaxima;

    while (fechaActual <= fechaFinalReal) {
      dias.push(new Date(fechaActual));
      fechaActual.setDate(fechaActual.getDate() + 1);
    }

    return dias;
  }

  const diasMostrados = generarDiasEntreFechas({ fechaInicio, fechaFin });

  // Agrupar diagramas por empleado para facilitar el acceso
  const diagramasPorEmpleado = useMemo(() => {
    const resultado: Record<string, DiagramType[]> = {};

    if (!employeesData || employeesData.length === 0) return resultado;

    employeesData.forEach((employee) => {
      if (employee.diagrams && employee.diagrams.length > 0) {
        resultado[employee.value] = employee.diagrams;
      }
    });

    return resultado;
  }, [employeesData]);

  // Función para exportar los diagramas a Excel
  function exportarAExcel() {
    if (!employeesData || employeesData.length === 0 || diasMostrados.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    // Columnas fijas de informacion del empleado (antes de los dias)
    const columnasEmpleado = [
      'Empleado',
      'Puesto',
      'Sector',
      'Fecha de ingreso',
      'Diagrama',
      'Centro de Costo',
      'Categoría',
      'Convenio',
      'Sindicato',
    ];
    // Cantidad de columnas fijas: define el offset donde empiezan los dias
    const COLUMNAS_FIJAS = columnasEmpleado.length;

    // Datos para el Excel
    const datosExcel = [];

    // Encabezados (primera fila)
    const encabezados = [...columnasEmpleado, ...diasMostrados.map((day) => moment(day).format('DD/MM'))];
    datosExcel.push(encabezados);

    // Filtrar empleados según selección
    const empleadosFiltrados =
      selectedResources.length > 0
        ? employeesData.filter((emp) => selectedResources.includes(emp.value))
        : employeesData;

    // Datos de cada empleado
    empleadosFiltrados.forEach((employee) => {
      const filaDatos = [
        employee.label,
        employee.position || '',
        employee.sector || '',
        employee.dateOfAdmission ? moment.utc(employee.dateOfAdmission).format('DD/MM/YYYY') : '',
        employee.workDiagram || '',
        employee.costCenter || '',
        employee.category || '',
        employee.covenant || '',
        employee.guild || '',
      ];

      diasMostrados.forEach((day) => {
        const diaNro = day.getDate();
        const mesNro = day.getMonth() + 1;
        const anioNro = day.getFullYear();

        const diagrama = employee.diagrams?.find((d) => d.day === diaNro && d.month === mesNro && d.year === anioNro);

        filaDatos.push(diagrama?.diagram_type.short_description || '');
      });

      datosExcel.push(filaDatos);
    });

    // Crear hoja de cálculo
    const worksheet = XLSX.utils.aoa_to_sheet(datosExcel);

    // Añadir estilos de color según los diagramas
    empleadosFiltrados.forEach((employee, rowIndex) => {
      diasMostrados.forEach((day, colIndex) => {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex + COLUMNAS_FIJAS });
        const diaNro = day.getDate();
        const mesNro = day.getMonth() + 1;
        const anioNro = day.getFullYear();

        const diagrama = employee.diagrams?.find((d) => d.day === diaNro && d.month === mesNro && d.year === anioNro);

        if (diagrama?.diagram_type?.color) {
          const rgbColor = hexToRgb(diagrama.diagram_type.color);
          if (!worksheet[cellAddress]) worksheet[cellAddress] = {};
          worksheet[cellAddress].s = {
            fill: {
              patternType: 'solid',
              fgColor: { rgb: rgbColor },
              bgColor: { rgb: rgbColor },
            },
          };
        }
      });
    });

    // Crear y descargar archivo
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Diagramas');

    const dateStamp = argentinaToday().format('MMDD');
    XLSX.writeFile(workbook, `Diagramas_${dateStamp}.xlsx`, { compression: true });

    toast.success('Archivo Excel generado correctamente');
  }

  // Función auxiliar para convertir colores HEX a RGB (para Excel)
  function hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `FF${result[1]}${result[2]}${result[3]}` : 'FFFFFFFF';
  }

  const [isDescending, setIsDescending] = useState(false);

  return (
    <Card className="p-4">
      {/* Controles superiores (filtros y acciones) */}
      <div className="py-2 w-full flex justify-between gap-4 items-center">
        <div className="flex gap-4">
          {/* Selector de empleados */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="resources"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <MultiSelectCombobox
                      options={employeesData}
                      placeholder="Selecciona al menos 1 recurso"
                      emptyMessage="No hay recursos disponibles"
                      selectedValues={selectedResources}
                      onChange={(values) => {
                        setPickedResources(values);
                        form.setValue('resources', values);
                      }}
                      showSelectAll
                    />
                    <FormDescription>
                      <InfoComponent size="sm" message="Selecciona al menos 1 recurso para ver su diagrama." />
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>

          {/* Selector de rango de fechas */}
          <div className="grid gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  id="date"
                  variant="outline"
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
            <InfoComponent size="sm" message="La selección máxima es de 30 días" />
          </div>
        </div>
      </div>

      {/* Tabla de diagramas */}
      {employeesData.length === 0 ? (
        <div className="p-4 text-center border rounded-md my-4">
          <p>No hay empleados para mostrar</p>
        </div>
      ) : (
        <div className="grid p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="flex items-center gap-2">
                  Empleado
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={
                      isDescending ? 'Ordenar empleados de forma ascendente' : 'Ordenar empleados de forma descendente'
                    }
                    onClick={() => {
                      setIsDescending(!isDescending);
                    }}
                  >
                    {isDescending ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />}
                  </Button>
                </TableHead>
                {diasMostrados.map((dia, idx) => (
                  <TableHead key={`dia-${idx}`} className="text-nowrap p-0">
                    {moment(dia).format('DD/MM')}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedResources.length > 0 ? (
                // Mostrar empleados filtrados
                employeesData
                  .filter((emp) => selectedResources.includes(emp.value))
                  .sort((a, b) => {
                    // Aplicar orden ascendente o descendente según el estado
                    return isDescending
                      ? b.label.localeCompare(a.label) // Orden Z-A
                      : a.label.localeCompare(b.label); // Orden A-Z
                  })
                  .map((empleado, idxEmp) => (
                    <TableRow key={`empleado-${idxEmp}`}>
                      <TableCell
                        className="max-w-[120px] overflow-hidden "
                        style={{
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                        }}
                        title={empleado.label}
                      >
                        {empleado.label}
                      </TableCell>
                      {diasMostrados.map((dia, idxDia) => {
                        const diaNro = dia.getDate();
                        const mesNro = dia.getMonth() + 1;
                        const anioNro = dia.getFullYear();

                        // Buscar diagrama para esta fecha específica
                        const diagrama = empleado.diagrams?.find(
                          (d) => d.day === diaNro && d.month === mesNro && d.year === anioNro
                        );

                        // En la grilla no entra una columna de comentario: se muestra
                        // junto a la novedad en el tooltip de la celda.
                        const nombreNovedad = diagrama?.diagram_type?.name || 'Sin diagrama';
                        const tooltipCelda = diagrama?.comments
                          ? `${nombreNovedad} — ${diagrama.comments}`
                          : nombreNovedad;

                        return (
                          <TableCell
                            key={`celda-${idxEmp}-${idxDia}`}
                            className="text-center border max-w-[10px]"
                            style={{
                              backgroundColor: diagrama?.diagram_type?.color || 'transparent',
                              color: diagrama?.diagram_type?.color ? '#fff' : 'inherit',
                            }}
                            title={tooltipCelda}
                          >
                            {diagrama?.diagram_type?.short_description || ''}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
              ) : (
                <TableRow>
                  <TableCell colSpan={diasMostrados.length + 1} className="text-center">
                    Selecciona al menos un empleado para ver sus diagramas
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Botón para exportar a Excel */}
      <div className="py-2 w-full flex justify-start gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={exportarAExcel}
          disabled={!employeesData?.length || selectedResources.length === 0}
        >
          <FileDown className="mr-2 h-4 w-4" />
          Exportar a Excel
        </Button>
      </div>
    </Card>
  );
}

export default DiagramEmployeeView;
