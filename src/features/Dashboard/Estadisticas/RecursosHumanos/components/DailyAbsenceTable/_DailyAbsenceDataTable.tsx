'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig } from '@/shared/components/common/DataTable/types';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import { useMemo, useState } from 'react';
import { DailyAbsenceTimeseriesItem, getCurrentAbsentEmployees } from '../../actions.server';
import { formatAbsencePercent } from '../../lib/absence-level';
import { _EmployeeAbsenceDataTable } from '../EmployeeAbsenceTable/_EmployeeAbsenceDataTable';
import { getDailyAbsenceColumns } from './columns';

// DataTable requires TData extends Record<string, unknown>.
type DailyAbsenceRecord = DailyAbsenceTimeseriesItem & Record<string, unknown>;

interface Props {
  data: DailyAbsenceTimeseriesItem[];
  companyId: string;
}

export function _DailyAbsenceDataTable({ data, companyId }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const handleViewEmployees = (row: DailyAbsenceTimeseriesItem) => {
    setSelectedDate(row.fecha);
    setIsOpen(true);
  };

  const columns = useMemo(() => getDailyAbsenceColumns(handleViewEmployees) as ColumnDef<DailyAbsenceRecord>[], []);

  const castedData = data as DailyAbsenceRecord[];

  // Una columna, un filtro. En modo in-memory no hay rango de fechas: la fecha («DD/MM/YYYY») se filtra
  // por texto (por ejemplo «/08/2026» trae todo agosto) y los números por coincidencia parcial.
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'fecha', title: 'Fecha', type: 'text', placeholder: 'Buscar fecha (DD/MM/AAAA)...' },
      { columnId: 'dotacion', title: 'Dotación', type: 'text', placeholder: 'Buscar dotación...' },
      { columnId: 'altas', title: 'Altas', type: 'text', placeholder: 'Buscar altas...' },
      { columnId: 'bajas', title: 'Bajas', type: 'text', placeholder: 'Buscar bajas...' },
      { columnId: 'vacaciones', title: 'Vacaciones', type: 'text', placeholder: 'Buscar vacaciones...' },
      { columnId: 'totalDotacion', title: 'Total Dotación', type: 'text', placeholder: 'Buscar total dotación...' },
      { columnId: 'totalAusentes', title: 'Total Ausentes', type: 'text', placeholder: 'Buscar total ausentes...' },
      { columnId: 'porcentajeAusentismo', title: '% Ausentismo', type: 'text', placeholder: 'Buscar porcentaje...' },
    ],
    []
  );

  // Se muestran 3 filtros; el resto se activa desde el selector de filtros.
  const initialFilterVisibility = useMemo(
    () => ({
      fecha: true,
      totalAusentes: true,
      porcentajeAusentismo: true,
      dotacion: false,
      altas: false,
      bajas: false,
      vacaciones: false,
      totalDotacion: false,
    }),
    []
  );

  const exportConfig = useMemo(
    () => ({
      fetchAllData: async () => castedData,
      options: {
        filename: 'ausentismo-diario',
        sheetName: 'Ausentismo Diario',
        title: 'Serie Diaria de Ausentismo',
      },
      formatters: {
        porcentajeAusentismo: (val: unknown) => (val == null ? '' : formatAbsencePercent(val as number)),
        altas: (val: unknown) => String(val || 0),
        bajas: (val: unknown) => String(val || 0),
        vacaciones: (val: unknown) => String(val || 0),
      },
    }),
    [castedData]
  );

  // Convertir fecha de DD/MM/YYYY a YYYY-MM-DD para el RPC
  const isoDate = useMemo(() => {
    if (!selectedDate) return null;
    return moment(selectedDate, 'DD/MM/YYYY').format('YYYY-MM-DD');
  }, [selectedDate]);

  // Fetch on-demand: solo se dispara cuando el modal está abierto y hay fecha seleccionada
  const {
    data: absenceDetail,
    isLoading: isLoadingDetail,
    isError: isDetailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['daily-absence-detail', companyId, isoDate],
    queryFn: () => getCurrentAbsentEmployees(isoDate!),
    enabled: isOpen && !!isoDate,
    staleTime: 5 * 60 * 1000,
  });

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSelectedDate(null);
    }
  };

  // Determinar tab activa por defecto según disponibilidad de datos
  const defaultTab = useMemo(() => {
    if (!absenceDetail?.detalles) return 'ausentes';
    const d = absenceDetail.detalles;
    if ((d.bajas_info?.length ?? 0) > 0) return 'bajas';
    if ((d.ausentes_info?.length ?? 0) > 0) return 'ausentes';
    if ((d.altas_info?.length ?? 0) > 0) return 'altas';
    return 'ausentes';
  }, [absenceDetail]);

  const hasDetalles = !!absenceDetail?.detalles;
  const simpleEmployees = !hasDetalles ? absenceDetail?.data ?? [] : [];

  return (
    <>
      <DataTable
        columns={columns}
        data={castedData}
        totalRows={castedData.length}
        facetedFilters={facetedFilters}
        searchPlaceholder="Buscar por fecha, dotación o ausentes..."
        showSearch
        showFilterToggle
        initialFilterVisibility={initialFilterVisibility}
        emptyMessage="No hay datos de ausentismo diario."
        exportConfig={exportConfig}
        tableId="daily-absence"
        paramNamespace="daily-absence"
        inMemory
      />

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Empleados ausentes{selectedDate ? ` el ${selectedDate}` : ''}</DialogTitle>
            <DialogDescription>Detalle de empleados ausentes en la fecha seleccionada.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {isLoadingDetail ? (
              <div className="space-y-3">
                <div className="flex items-center space-x-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-4 w-1/4" />
                  ))}
                </div>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center space-x-4">
                    {[1, 2, 3, 4, 5, 6].map((j) => (
                      <Skeleton key={j} className="h-4 w-1/6" />
                    ))}
                  </div>
                ))}
              </div>
            ) : isDetailError ? (
              <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No se pudo cargar el detalle de ausentes. Esto no significa que no haya ausentes.
                </p>
                <Button type="button" variant="outline" onClick={() => refetchDetail()}>
                  Reintentar
                </Button>
              </div>
            ) : !absenceDetail ? (
              <div className="py-8 text-center text-muted-foreground">No hay datos para esta fecha.</div>
            ) : !hasDetalles ? (
              simpleEmployees.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">No hay empleados ausentes para esta fecha.</div>
              ) : (
                <_EmployeeAbsenceDataTable data={simpleEmployees} tableId="daily-absence-modal" />
              )
            ) : (
              <Tabs defaultValue={defaultTab} className="w-full">
                <TabsList>
                  <TabsTrigger disabled={(absenceDetail.detalles.bajas_info?.length ?? 0) < 1} value="bajas">
                    Bajas ({absenceDetail.detalles.bajas_info?.length ?? 0})
                  </TabsTrigger>
                  <TabsTrigger disabled={(absenceDetail.detalles.ausentes_info?.length ?? 0) < 1} value="ausentes">
                    Ausentes ({absenceDetail.detalles.ausentes_info?.length ?? 0})
                  </TabsTrigger>
                  <TabsTrigger disabled={(absenceDetail.detalles.altas_info?.length ?? 0) < 1} value="altas">
                    Altas ({absenceDetail.detalles.altas_info?.length ?? 0})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="bajas" className="mt-4">
                  {(absenceDetail.detalles.bajas_info?.length ?? 0) > 0 ? (
                    <_EmployeeAbsenceDataTable
                      data={absenceDetail.detalles.bajas_info!}
                      tableId="daily-absence-modal-bajas"
                    />
                  ) : (
                    <div className="py-6 text-center text-muted-foreground">Sin bajas para esta fecha.</div>
                  )}
                </TabsContent>

                <TabsContent value="ausentes" className="mt-4">
                  {(absenceDetail.detalles.ausentes_info?.length ?? 0) > 0 ? (
                    <_EmployeeAbsenceDataTable
                      data={absenceDetail.detalles.ausentes_info!}
                      tableId="daily-absence-modal-ausentes"
                    />
                  ) : (
                    <div className="py-6 text-center text-muted-foreground">Sin ausentes para esta fecha.</div>
                  )}
                </TabsContent>

                <TabsContent value="altas" className="mt-4">
                  {(absenceDetail.detalles.altas_info?.length ?? 0) > 0 ? (
                    <_EmployeeAbsenceDataTable
                      data={absenceDetail.detalles.altas_info!}
                      tableId="daily-absence-modal-altas"
                    />
                  ) : (
                    <div className="py-6 text-center text-muted-foreground">Sin altas para esta fecha.</div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
