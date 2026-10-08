'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { getFilteredDailyReportRows } from '@/features/Operaciones/Certificacion/actions/queries.server';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { DataTableDatePicker } from '@/shared/components/data-table/filters/data-table-date-picker';
import { useDailyReportFormStore } from '@/shared/store/useDailyReportFormStore';
import { useQuery } from '@tanstack/react-query';
import { Filter, Search, X } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import { DailyReportRowFormRefactored } from '@/features/Operaciones/Certificacion/components/DailyReportRowFormRefactored';
import EnhancedComercialReportTable from '@/features/Operaciones/Certificacion/components/EnhancedComercialReportTable';
import { useFilterOptions } from '@/features/Operaciones/Certificacion/hooks/useFilterOptions';
import type { ReportFilterableColumn } from '@/features/Operaciones/Certificacion/components/EnhancedComercialReportTable';
import { transformDailyReports, type transformDailyReportsType } from '@/features/Operaciones/Certificacion/lib/transform';

interface ReportFilters {
  customer?: string[];
  service?: string[];
  status?: string[];
  employee?: string[];
  equipment?: string[];
  item?: string[];
  customerEquipment?: string[];
  areas?: string[];
  sectors?: string[];
  dateFrom?: Date | null;
  dateTo?: Date | null;
}

/** Filtros ya normalizados que viajan a la server action. */
type ReportSearchFilters = Parameters<typeof getFilteredDailyReportRows>[0];

/** Fila de la tabla comercial, tal como la deja `transformDailyReports`. */
type TableRow = transformDailyReportsType[number];

interface FilterOption {
  id: string;
  name: string;
  customer_id?: string;
  cuit?: string;
}

interface ItemFilterOption {
  id: string;
  name: string;
  customer_service_id: string;
}

interface FilterOptions {
  customers: FilterOption[];
  services: FilterOption[];
  employees: FilterOption[];
  equipment: FilterOption[];
  items: ItemFilterOption[];
  customerEquipments: FilterOption[];
  areas: FilterOption[];
  sectors: FilterOption[];
}


export default function DailyReportWrapper() {
  const [filters, setFilters] = useState<ReportFilters>({
    customer: [],
    service: [],
    status: [],
    employee: [],
    equipment: [],
    item: [],
    customerEquipment: [],
    areas: [],
    sectors: [],
    dateFrom: null,
    dateTo: null,
  });

  const [hasSearched, setHasSearched] = useState(false);
  const [searchFilters, setSearchFilters] = useState<ReportSearchFilters | null>(null);

  // Usar el hook de filtros con useQuery
  const filterOptions = useFilterOptions();

  // useQuery para obtener los datos de la tabla
  const {
    data: rawTableData = [],
    isLoading: loading,
    refetch: refetchTableData,
  } = useQuery({
    queryKey: ['filtered-daily-report-rows', searchFilters],
    queryFn: async () => {
      if (!searchFilters) return [];
      const data = await getFilteredDailyReportRows(searchFilters);
      return data || [];
    },
    enabled: !!searchFilters, // Solo ejecutar si hay filtros
    staleTime: 0, // Sin caché
    gcTime: 0, // Sin caché en memoria
  });

  // Usar el store para manejar el formulario
  const { openForCreate, openForEdit } = useDailyReportFormStore();

  const handleEditRow = useCallback(
    (row: TableRow) => {
      openForEdit(row);
    },
    [openForEdit]
  );

  const handleCreateRow = useCallback(() => {
    openForCreate();
  }, [openForCreate]);

  const handleSearch = useCallback(() => {
    if (loading) return;

    setHasSearched(true);

    const cleanFilters: ReportSearchFilters = {};

    // Ahora pasamos los arrays directamente al servidor
    if (filters.customer?.length) cleanFilters.customer = filters.customer;
    if (filters.service?.length) cleanFilters.service = filters.service;
    if (filters.status?.length) cleanFilters.status = filters.status;
    if (filters.employee?.length) cleanFilters.employee = filters.employee;
    if (filters.equipment?.length) cleanFilters.equipment = filters.equipment;
    if (filters.item?.length) cleanFilters.item = filters.item;
    if (filters.customerEquipment?.length) cleanFilters.customerEquipment = filters.customerEquipment;
    if (filters.areas?.length) cleanFilters.areas = filters.areas;
    if (filters.sectors?.length) cleanFilters.sectors = filters.sectors;

    if (filters.dateFrom instanceof Date) {
      const y = filters.dateFrom.getFullYear();
      const m = String(filters.dateFrom.getMonth() + 1).padStart(2, '0');
      const d = String(filters.dateFrom.getDate()).padStart(2, '0');
      cleanFilters.dateFrom = `${y}-${m}-${d}`;
    }
    if (filters.dateTo instanceof Date) {
      const y = filters.dateTo.getFullYear();
      const m = String(filters.dateTo.getMonth() + 1).padStart(2, '0');
      const d = String(filters.dateTo.getDate()).padStart(2, '0');
      cleanFilters.dateTo = `${y}-${m}-${d}`;
    }

    // Actualizar los filtros de búsqueda para que useQuery haga el fetch
    setSearchFilters(cleanFilters);
  }, [filters, loading]);

  const refetchDailyReport = useCallback(async () => {
    await refetchTableData();
  }, [refetchTableData]);

  const handleViewRow = useCallback((row: TableRow) => {
    toast('Detalle del servicio', { description: `${row.customer} - ${row.services}` });
  }, []);

  const handleViewHistory = useCallback((row: TableRow) => {
    toast('Historial del servicio', { description: `${row.customer} - ${row.services}` });
  }, []);

  // Ya no necesitamos este useEffect, los datos se cargan automáticamente con useQuery

  const handleMultiSelectChange = useCallback((key: keyof ReportFilters, values: string[]) => {
    setFilters((prev) => ({ ...prev, [key]: values }));
  }, []);

  const handleCustomerChange = useCallback((values: string[]) => {
    setFilters((prev) => ({
      ...prev,
      customer: values,
      service: [],
      item: [],
      customerEquipment: [],
      areas: [],
      sectors: [],
    }));

    // Sin clientes seleccionados se vuelven a pedir todas las opciones; con clientes,
    // el filtrado lo resuelven los useMemo de las opciones sobre los datos del hook.
    if (values.length === 0) {
      filterOptions.refetch.customers();
      filterOptions.refetch.services();
      filterOptions.refetch.equipment();
      filterOptions.refetch.items();
      filterOptions.refetch.customerEquipments();
      filterOptions.refetch.areas();
      filterOptions.refetch.sectors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleServiceChange = useCallback((values: string[]) => {
    setFilters((prev) => ({ ...prev, service: values, item: [] }));
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters({
      customer: [],
      service: [],
      status: [],
      employee: [],
      equipment: [],
      item: [],
      customerEquipment: [],
      areas: [],
      sectors: [],
      dateFrom: null,
      dateTo: null,
    });
    setSearchFilters(null);
    setHasSearched(false);

    // Refetch de todas las opciones con useQuery
    filterOptions.refetch.customers();
    filterOptions.refetch.services();
    filterOptions.refetch.employees();
    filterOptions.refetch.equipment();
    filterOptions.refetch.items();
    filterOptions.refetch.customerEquipments();
    filterOptions.refetch.areas();
    filterOptions.refetch.sectors();
  }, [filterOptions]);

  const handleCustomerEquipmentChange = useCallback((values: string[]) => {
    setFilters((prev) => ({ ...prev, customerEquipment: values }));
  }, []);

  const handleAreaChange = useCallback((values: string[]) => {
    setFilters((prev) => ({ ...prev, areas: values }));
  }, []);

  const handleSectorChange = useCallback((values: string[]) => {
    setFilters((prev) => ({ ...prev, sectors: values }));
  }, []);

  const hasActiveFilters = Object.values(filters).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value)
  );

  const customerOptions = useMemo(
    () =>
      filterOptions.customers.map((customer) => ({
        label: customer.name,
        value: customer.id,
        cuit: customer.cuit,
      })),
    [filterOptions.customers]
  );

  const serviceOptions = useMemo(
    () =>
      filterOptions.services.map((service) => ({
        label: service.name,
        value: service.id,
      })),
    [filterOptions.services]
  );

  const statusOptions = useMemo(
    () => [
      { value: 'pendiente', label: 'Pendiente' },
      { value: 'en_certificacion', label: 'En Certificación' },
      { value: 'ejecutado', label: 'Ejecutado' },
      { value: 'reprogramado', label: 'Reprogramado' },
      { value: 'cancelado', label: 'Cancelado' },
      { value: 'sin_recursos_asignados', label: 'Sin Recursos Asignados' },
    ],
    []
  );

  const employeeOptions = useMemo(
    () =>
      filterOptions.employees.map((employee) => ({
        label: employee.name,
        value: employee.id,
      })),
    [filterOptions.employees]
  );

  const equipmentOptions = useMemo(
    () =>
      filterOptions.equipment.map((eq) => ({
        label: eq.name,
        value: eq.id,
      })),
    [filterOptions.equipment]
  );

  const memoizedCustomerEquipmentOptions = useMemo(
    () =>
      filterOptions.customerEquipments.map((eq) => ({
        label: eq.name,
        value: eq.id,
      })),
    [filterOptions.customerEquipments]
  );

  const memoizedAreaOptions = useMemo(
    () =>
      filterOptions.areas.map((area) => ({
        label: area.name,
        value: area.id,
      })),
    [filterOptions.areas]
  );

  const memoizedSectorOptions = useMemo(
    () =>
      filterOptions.sectors.map((sector) => ({
        label: sector.name,
        value: sector.id,
      })),
    [filterOptions.sectors]
  );

  const itemOptions = useMemo(() => {
    const allItems = filterOptions.items;
    const selectedServices = filters.service || [];
    if (!selectedServices.length) return [] as { label: string; value: string }[];
    const filtered = allItems.filter((it) => selectedServices.includes(it.customer_service_id));
    return filtered.map((it) => ({ label: it.name, value: it.id }));
  }, [filterOptions.items, filters.service]);

  // Memoizar los datos transformados para evitar re-renders innecesarios
  const formattedData = useMemo(() => {
    return transformDailyReports(rawTableData);
  }, [rawTableData]);

  /** Valores únicos no vacíos, listos para usar como opciones del filtro. */
  const toOptions = (values: (string | null | undefined)[]) =>
    Array.from(new Set(values.filter((value): value is string => Boolean(value)))).map((value) => ({
      value,
      label: value,
    }));

  const filterableColumns = useMemo<ReportFilterableColumn[]>(() => {
    // Si no hay datos, no se crean filtros
    if (!formattedData.length) return [];

    return [
      {
        columnId: 'date',
        title: 'Rango de Fechas',
        type: 'date-range' as const,
        showFrom: true,
        showTo: true,
        fromPlaceholder: 'Desde',
        toPlaceholder: 'Hasta',
        defaultValues: { from: null, to: null },
      },
      {
        columnId: 'customer',
        title: 'Cliente',
        type: 'select' as const,
        options: toOptions(formattedData.map((d) => d.customer)),
      },
      {
        columnId: 'services',
        title: 'Servicio',
        type: 'select' as const,
        options: toOptions(formattedData.map((d) => d.services)),
      },
      {
        columnId: 'item',
        title: 'Ítem',
        type: 'select' as const,
        options: toOptions(formattedData.map((d) => d.item)),
      },
      {
        columnId: 'type_service',
        title: 'Tipo de Servicio',
        type: 'select' as const,
        options: toOptions(formattedData.map((d) => d.type_service)),
      },
      {
        columnId: 'status',
        title: 'Estado',
        type: 'select' as const,
        options: toOptions(formattedData.map((d) => d.status)).map((option) => ({
          ...option,
          label: option.label.replace(/_/g, ' '),
        })),
      },
      {
        columnId: 'employees',
        title: 'Empleados',
        type: 'select' as const,
        options: toOptions(formattedData.flatMap((d) => d.employees)),
      },
      {
        columnId: 'equipment',
        title: 'Equipo Empresa',
        type: 'select' as const,
        options: toOptions(formattedData.flatMap((d) => d.equipment)),
      },
      {
        columnId: 'customer_equipment',
        title: 'Equipo Cliente',
        type: 'select' as const,
        options: toOptions(formattedData.flatMap((d) => d.customer_equipment.map((eq) => eq.name))).map((option) => ({
          value: option.value,
          label: option.label,
        })),
      },
      {
        columnId: 'area',
        title: 'Área',
        type: 'select' as const,
        options: toOptions(formattedData.map((d) => d.area)),
      },
      {
        columnId: 'sector',
        title: 'Sector',
        type: 'select' as const,
        options: toOptions(formattedData.map((d) => d.sector)),
      },
      {
        columnId: 'remit_number',
        title: 'N° de Remito',
        type: 'select' as const,
        options: Array.from(
          new Set(
            formattedData.flatMap((d) => {
              // Obtener remitos del array remit_numbers si existe, o del string remit_number
              if (d.remit_numbers && d.remit_numbers.length > 0) {
                return d.remit_numbers.filter(Boolean);
              }
              if (d.remit_number) {
                // Si es string, separar por comas
                return d.remit_number
                  .split(',')
                  .map((r: string) => r.trim())
                  .filter(Boolean);
              }
              return [];
            })
          )
        )
          .sort()
          .map((remit) => ({
            value: remit,
            label: remit,
          })),
      },
      {
        columnId: 'working_day',
        title: 'Jornada',
        type: 'select' as const,
        options: toOptions(formattedData.map((d) => d.working_day)),
      },
    ];
  }, [formattedData]);

  return (
    <Card className="space-y-6 p-6">
      <Card>
        <CardContent className="pt-6">
          <Accordion type="single" collapsible defaultValue="filters">
            <AccordionItem value="filters">
              <AccordionTrigger>
                <div className="flex items-center">
                  <Filter className="mr-2 h-5 w-5" />
                  <span className="text-xl font-semibold">Filtros de Reportes</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Cliente</label>
                    <MultiSelectCombobox
                      options={customerOptions}
                      placeholder="Seleccionar clientes"
                      emptyMessage="No se encontraron clientes"
                      selectedValues={filters.customer || []}
                      onChange={handleCustomerChange}
                      maxSelections={null}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Servicio</label>
                    <MultiSelectCombobox
                      options={serviceOptions}
                      placeholder={
                        filters.customer?.length ? 'Seleccionar servicios' : 'Seleccione al menos un cliente'
                      }
                      emptyMessage="No se encontraron servicios"
                      selectedValues={filters.service || []}
                      onChange={handleServiceChange}
                      disabled={!filters.customer?.length}
                      maxSelections={null}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Ítem</label>
                    <MultiSelectCombobox
                      options={itemOptions}
                      placeholder="Seleccionar ítems"
                      emptyMessage="No se encontraron ítems"
                      selectedValues={filters.item || []}
                      onChange={(values) => handleMultiSelectChange('item', values)}
                      maxSelections={null}
                      disabled={!((filters.service && filters.service.length) || 0)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Equipos del Cliente</label>
                    <MultiSelectCombobox
                      options={memoizedCustomerEquipmentOptions}
                      placeholder={filters.customer?.length ? 'Seleccionar equipos' : 'Seleccione un cliente primero'}
                      emptyMessage="No se encontraron equipos"
                      selectedValues={filters.customerEquipment || []}
                      onChange={handleCustomerEquipmentChange}
                      maxSelections={null}
                      disabled={!filters.customer?.length}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Áreas</label>
                    <MultiSelectCombobox
                      options={memoizedAreaOptions}
                      placeholder={filters.customer?.length ? 'Seleccionar áreas' : 'Seleccione un cliente primero'}
                      emptyMessage="No se encontraron áreas"
                      selectedValues={filters.areas || []}
                      onChange={handleAreaChange}
                      maxSelections={null}
                      disabled={!filters.customer?.length}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Sectores</label>
                    <MultiSelectCombobox
                      options={memoizedSectorOptions}
                      placeholder={filters.customer?.length ? 'Seleccionar sectores' : 'Seleccione un cliente primero'}
                      emptyMessage="No se encontraron sectores"
                      selectedValues={filters.sectors || []}
                      onChange={handleSectorChange}
                      maxSelections={null}
                      disabled={!filters.customer?.length}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Empleado</label>
                    <MultiSelectCombobox
                      options={employeeOptions}
                      placeholder="Seleccionar empleados"
                      emptyMessage="No se encontraron empleados"
                      selectedValues={filters.employee || []}
                      onChange={(values) => handleMultiSelectChange('employee', values)}
                      maxSelections={null}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Equipo</label>
                    <MultiSelectCombobox
                      options={equipmentOptions}
                      placeholder="Seleccionar equipos"
                      emptyMessage="No se encontraron equipos"
                      selectedValues={filters.equipment || []}
                      onChange={(values) => handleMultiSelectChange('equipment', values)}
                      maxSelections={null}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Estado</label>
                    <MultiSelectCombobox
                      options={statusOptions}
                      placeholder="Seleccionar estados"
                      emptyMessage="No se encontraron estados"
                      selectedValues={filters.status || []}
                      onChange={(values) => handleMultiSelectChange('status', values)}
                      maxSelections={null}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Fecha Desde</label>
                    <DataTableDatePicker
                      date={filters.dateFrom ?? null}
                      setDate={(date) => setFilters((prev) => ({ ...prev, dateFrom: date }))}
                      label="Desde"
                      clearFilter={() => setFilters((prev) => ({ ...prev, dateFrom: null }))}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Fecha Hasta</label>
                    <DataTableDatePicker
                      date={filters.dateTo ?? null}
                      setDate={(date) => setFilters((prev) => ({ ...prev, dateTo: date }))}
                      label="Hasta"
                      clearFilter={() => setFilters((prev) => ({ ...prev, dateTo: null }))}
                    />
                  </div>
                </div>

                <div className="flex justify-between mt-4">
                  <PermissionGuard module="comercial" tab="daily_reports" action="create">
                    <Button variant="default" onClick={handleCreateRow}>
                      Crear Línea
                    </Button>
                  </PermissionGuard>
                  <div className="flex space-x-2">
                    <Button variant="outline" onClick={handleClearFilters} disabled={!hasActiveFilters}>
                      <X className="mr-2 h-4 w-4" />
                      Limpiar
                    </Button>
                    <Button onClick={handleSearch} disabled={loading}>
                      {loading ? (
                        <>
                          <svg
                            className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          Buscando...
                        </>
                      ) : (
                        <>
                          <Search className="mr-2 h-4 w-4" />
                          Buscar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : hasSearched ? (
            rawTableData.length > 0 ? (
              <EnhancedComercialReportTable
                dailyReports={formattedData}
                onEdit={handleEditRow}
                onView={handleViewRow}
                onViewHistory={handleViewHistory}
                showActions={true}
                filterableColumns={filterableColumns}
                refetchDailyReports={refetchDailyReport}
              />
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No se encontraron resultados para los filtros seleccionados.</p>
              </div>
            )
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Utilice los filtros para buscar reportes.</p>
            </div>
          )}
        </CardContent>
        {/* Componente sin props, se auto-gestiona con el store */}
        <DailyReportRowFormRefactored />
      </Card>
    </Card>
  );
}
