'use client';

import { Button } from '@/components/ui/button';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import {
  affiliate_status_enum,
  cost_type_enum,
  document_type_enum,
  gender_enum,
  level_of_education_enum,
  marital_status_enum,
  nationality_enum,
  reason_for_termination_enum,
  status_type,
} from '@/generated/prisma/enums';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import {
  affiliateStatusLabels,
  costTypeLabels,
  documentTypeLabels,
  employeeStatusLabels,
  genderLabels,
  getEnumLabel,
  levelOfEducationLabels,
  maritalStatusLabels,
  nationalityLabels,
  reasonForTerminationLabels,
} from '@/shared/utils/mappers';
import type { LucideIcon } from 'lucide-react';
import { CircleOff, Plus } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import {
  getAllEmployeesForExport,
  getEmployeeSingleFacet,
  getEmployeesPaginated,
  type EmployeeListItem,
} from '../actions.server';
import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  affiliateStatusIcons,
  costTypeIcons,
  documentTypeIcons,
  employeeStatusIcons,
  genderIcons,
  getColumns,
  levelOfEducationIcons,
  maritalStatusIcons,
  nationalityIcons,
  reasonForTerminationIcons,
} from '../columns';

// ============================================================================
// TYPES
// ============================================================================

interface EmployeeDataTableProps {
  data: EmployeeListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  isActive: boolean;
  tableId: string;
  /** Flat permissions map from server: "module:tab:action" → boolean */
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// HELPERS — builders para reducir boilerplate en fetchFacet
// ============================================================================

/** Construye FacetResult para enums: opciones estáticas + counts del servidor */
function buildEnumFacetResult(
  enumValues: string[],
  labels: Record<string, string>,
  icons: Record<string, LucideIcon | undefined>,
  counts: Map<string, number>
): FacetResult {
  return {
    options: [
      ...enumValues.map((value) => ({
        value,
        label: labels[value] ?? value,
        icon: icons[value],
      })),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }] : []),
    ],
    counts,
  };
}

/** Construye FacetResult para FK/M:M: opciones del servidor + counts */
function buildFkFacetResult(
  resolvedOptions: Array<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>,
  nullLabel = 'Sin asignar'
): FacetResult {
  return {
    options: [
      ...(resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '' })) ?? []),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }] : []),
    ],
    counts,
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function _EmployeeDataTable({
  data,
  totalRows,
  searchParams,
  isActive,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: EmployeeDataTableProps) {
  // Build hasPermission helper from serializable map (inside client component)
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  // ─── Client-side navigation: estado reactivo para queries dependientes ──────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn para fetch client-side de datos de tabla
  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getEmployeesPaginated(params, isActive),
    [isActive]
  );

  // Columns
  const columns = useMemo(() => getColumns(permissions, isActive), [permissions, isActive]);

  // Initial column visibility: merge defaults with saved preferences
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) {
      defaults[col] = false;
    }
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // ─── fetchFacet factories: cada filtro tiene su fetchFacet lazy ────────────

  // Helper genérico para enum facets
  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      enumValues: string[],
      labels: Record<string, string>,
      icons: Record<string, LucideIcon | undefined>
    ) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getEmployeeSingleFacet(columnId, isActive, params);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, icons, result.counts);
      };
    },
    [isActive]
  );

  // Helper genérico para FK/M:M facets
  const makeFkFetchFacet = useCallback(
    (columnId: string, nullLabel = 'Sin asignar') => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getEmployeeSingleFacet(columnId, isActive, params);
        if (!result) return { options: [], counts: new Map() };
        return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel);
      };
    },
    [isActive]
  );

  // ─── Filtros facetados con lazy-load ───────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── Enums ──────────────────────────────────────────────────────────────
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet('status', Object.values(status_type), employeeStatusLabels, employeeStatusIcons),
      },
      {
        columnId: 'gender',
        title: 'Genero',
        fetchFacet: makeEnumFetchFacet('gender', Object.values(gender_enum), genderLabels, genderIcons),
      },
      {
        columnId: 'nationality',
        title: 'Nacionalidad',
        fetchFacet: makeEnumFetchFacet(
          'nationality',
          Object.values(nationality_enum),
          nationalityLabels,
          nationalityIcons
        ),
      },
      {
        columnId: 'document_type',
        title: 'Tipo de Documento',
        fetchFacet: makeEnumFetchFacet(
          'document_type',
          Object.values(document_type_enum),
          documentTypeLabels,
          documentTypeIcons
        ),
      },
      {
        columnId: 'marital_status',
        title: 'Estado Civil',
        fetchFacet: makeEnumFetchFacet(
          'marital_status',
          Object.values(marital_status_enum),
          maritalStatusLabels,
          maritalStatusIcons
        ),
      },
      {
        columnId: 'level_of_education',
        title: 'Nivel de Educacion',
        fetchFacet: makeEnumFetchFacet(
          'level_of_education',
          Object.values(level_of_education_enum),
          levelOfEducationLabels,
          levelOfEducationIcons
        ),
      },
      {
        columnId: 'cost_type',
        title: 'Tipo de costo',
        fetchFacet: makeEnumFetchFacet('cost_type', Object.values(cost_type_enum), costTypeLabels, costTypeIcons),
      },
      {
        columnId: 'affiliate_status',
        title: 'Estado de afiliacion',
        fetchFacet: makeEnumFetchFacet(
          'affiliate_status',
          Object.values(affiliate_status_enum),
          affiliateStatusLabels,
          affiliateStatusIcons
        ),
      },
      {
        columnId: 'reason_for_termination',
        title: 'Motivo de baja',
        fetchFacet: makeEnumFetchFacet(
          'reason_for_termination',
          Object.values(reason_for_termination_enum),
          reasonForTerminationLabels,
          reasonForTerminationIcons
        ),
      },
      {
        columnId: 'is_active',
        title: 'Activo',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getEmployeeSingleFacet('is_active', isActive, params);
          if (!result) return { options: [], counts: new Map() };
          return {
            options: [
              { value: 'true', label: 'Activo' },
              { value: 'false', label: 'Inactivo' },
            ],
            counts: result.counts,
          };
        },
      },

      // ── FK UUID ────────────────────────────────────────────────────────────
      { columnId: 'hierarchy', title: 'Sector', fetchFacet: makeFkFetchFacet('hierarchy') },
      { columnId: 'company_positions', title: 'Puesto', fetchFacet: makeFkFetchFacet('company_positions') },
      { columnId: 'types_of_contract', title: 'Tipo de Contrato', fetchFacet: makeFkFetchFacet('types_of_contract') },
      { columnId: 'work_diagram', title: 'Diagrama', fetchFacet: makeFkFetchFacet('work_diagram') },
      { columnId: 'workshop_sectors', title: 'Sectores de taller', fetchFacet: makeFkFetchFacet('workshop_sectors') },
      { columnId: 'category', title: 'Categoria', fetchFacet: makeFkFetchFacet('category') },
      { columnId: 'covenant', title: 'Convenio', fetchFacet: makeFkFetchFacet('covenant') },
      { columnId: 'guild', title: 'Sindicato', fetchFacet: makeFkFetchFacet('guild') },
      { columnId: 'cost_center', title: 'Centro de costo', fetchFacet: makeFkFetchFacet('cost_center') },
      { columnId: 'countries', title: 'Pais de nacimiento', fetchFacet: makeFkFetchFacet('countries') },

      // ── FK BigInt ──────────────────────────────────────────────────────────
      { columnId: 'province', title: 'Provincia', fetchFacet: makeFkFetchFacet('province') },
      { columnId: 'city', title: 'Ciudad', fetchFacet: makeFkFetchFacet('city') },

      // ── M:M ────────────────────────────────────────────────────────────────
      {
        columnId: 'contractor_employee',
        title: 'Afectaciones',
        fetchFacet: makeFkFetchFacet('contractor_employee', 'Sin afectar'),
      },
      {
        columnId: 'empleado_aptitudes',
        title: 'Aptitudes tecnicas',
        fetchFacet: makeFkFetchFacet('empleado_aptitudes', 'Sin afectar'),
      },

      // ── Filtros de texto libre ─────────────────────────────────────────────
      { columnId: 'fullName', title: 'Nombre', type: 'text' as const, placeholder: 'Buscar por nombre...' },
      { columnId: 'email', title: 'Email', type: 'text' as const, placeholder: 'Buscar por email...' },
      { columnId: 'cuil', title: 'CUIL', type: 'text' as const, placeholder: 'Buscar por CUIL...' },
      {
        columnId: 'document_number',
        title: 'Documento',
        type: 'text' as const,
        placeholder: 'Buscar por documento...',
      },
      { columnId: 'phone', title: 'Telefono', type: 'text' as const, placeholder: 'Buscar por telefono...' },
      { columnId: 'street', title: 'Calle', type: 'text' as const, placeholder: 'Buscar por calle...' },
      { columnId: 'street_number', title: 'Altura', type: 'text' as const, placeholder: 'Buscar por altura...' },
      { columnId: 'postal_code', title: 'CP', type: 'text' as const, placeholder: 'Buscar por CP...' },
      { columnId: 'file', title: 'Legajo', type: 'text' as const, placeholder: 'Buscar por legajo...' },
      { columnId: 'normal_hours', title: 'Horas', type: 'text' as const, placeholder: 'Buscar por horas...' },

      // ── Filtros de rango de fechas ─────────────────────────────────────────
      { columnId: 'born_date', title: 'Nacimiento', type: 'dateRange' as const },
      { columnId: 'date_of_admission', title: 'Fecha de ingreso', type: 'dateRange' as const },
      { columnId: 'created_at', title: 'Fecha de creacion', type: 'dateRange' as const },
      { columnId: 'termination_date', title: 'Fecha de baja', type: 'dateRange' as const },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet, isActive]
  );

  // Filtros visibles por defecto: solo los 3 más comunes (distintos para activos/inactivos).
  // Las preferencias guardadas tienen prioridad; el resto de filtros arranca oculto.
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const defaultVisible = isActive
      ? ['status', 'hierarchy', 'company_positions']
      : ['reason_for_termination', 'status', 'hierarchy'];
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, defaultVisible.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters, isActive]);

  // ─── Botón de creación protegido por permisos (solo en tab activos) ─────────
  const toolbarActions = isActive ? (
    <PermissionGuard module="empleados" tab="employees" action="create">
      <Button asChild variant="brand" size="sm">
        <Link href="/dashboard/employee/action?action=new">
          <Plus className="mr-2 size-4" />
          Agregar empleado
        </Link>
      </Button>
    </PermissionGuard>
  ) : undefined;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      toolbarActions={toolbarActions}
      showSearch
      mobileCards
      searchPlaceholder="Buscar por legajo, nombre o CUIL"
      showFilterToggle
      // Client-side navigation: fetch instantáneo via React Query, sin router.push
      queryFn={tableQueryFn}
      queryKey={['employees-paginated', isActive]}
      onStateChange={handleStateChange}
      enableRowSelection
      showRowSelection
      emptyMessage="No se encontraron empleados"
      exportConfig={{
        fetchAllData: () => getAllEmployeesForExport(currentParams, isActive),
        options: {
          filename: isActive ? 'empleados-activos' : 'empleados-inactivos',
          sheetName: isActive ? 'Empleados Activos' : 'Empleados Inactivos',
          title: isActive ? 'Listado de Empleados Activos' : 'Listado de Empleados Inactivos',
        },
        formatters: {
          status: (value) => getEnumLabel(value as string, employeeStatusLabels),
          gender: (value) => getEnumLabel(value as string, genderLabels),
          nationality: (value) => getEnumLabel(value as string, nationalityLabels),
          document_type: (value) => getEnumLabel(value as string, documentTypeLabels),
          marital_status: (value) => getEnumLabel(value as string, maritalStatusLabels),
          level_of_education: (value) => getEnumLabel(value as string, levelOfEducationLabels),
          cost_type: (value) => getEnumLabel(value as string, costTypeLabels),
          affiliate_status: (value) => getEnumLabel(value as string, affiliateStatusLabels),
          reason_for_termination: (value) => getEnumLabel(value as string, reasonForTerminationLabels),
          date_of_admission: (value) => (value ? moment.utc(value as string | Date).format('DD/MM/YYYY') : '-'),
          created_at: (value) => (value ? moment(value as string | Date).format('DD/MM/YYYY') : '-'),
          termination_date: (value) => (value ? moment.utc(value as string | Date).format('DD/MM/YYYY') : '-'),
          born_date: (value) => {
            if (!value) return '-';
            const parsed = moment(value as string, ['YYYY-MM-DD', 'DD/MM/YYYY'], true);
            return parsed.isValid() ? parsed.format('DD/MM/YYYY') : String(value);
          },
          province: (_value, row) => row.provinces?.name ?? '-',
          city: (_value, row) => row.cities?.name ?? '-',
          is_active: (value) => (value ? 'Activo' : 'Inactivo'),
          contractor_employee: (_value, row) => {
            const contractors = row.contractor_employee ?? [];
            const names = contractors.map((c) => c.customers?.name ?? '').filter(Boolean);
            return names.length > 0 ? names.join(', ') : 'Sin afectar';
          },
          empleado_aptitudes: (_value, row) => {
            const aptitudes = row.empleado_aptitudes ?? [];
            const names = aptitudes.map((a) => a.aptitudes_tecnicas?.nombre ?? '').filter(Boolean);
            return names.length > 0 ? names.join(', ') : '-';
          },
        },
      }}
    />
  );
}
