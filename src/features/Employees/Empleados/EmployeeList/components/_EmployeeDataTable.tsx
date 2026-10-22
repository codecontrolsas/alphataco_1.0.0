'use client';

import { Button } from '@/components/ui/button';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { usePermissionChecker } from '@/features/Permissions/hooks/usePermissionChecker';
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
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import {
  createFacetFilters,
  dateRangeFilter,
  enumFilterOptions,
  textFilter,
} from '@/shared/components/common/DataTable/facet-filters';
import type { DataTableFacetedFilterConfig, DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
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
import { Plus } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import {
  getAllEmployeesForExport,
  getEmployeeSingleFacet,
  getEmployeesPaginated,
  type EmployeeListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';
import {
  affiliateStatusIcons,
  costTypeIcons,
  documentTypeIcons,
  employeeStatusIcons,
  genderIcons,
  levelOfEducationIcons,
  maritalStatusIcons,
  nationalityIcons,
  reasonForTerminationIcons,
} from '../lib/employee-icons';

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

// Filtros visibles de entrada (distintos para activos e inactivos); el resto se activa desde el toggle.
const DEFAULT_VISIBLE_FILTERS_ACTIVE = ['status', 'hierarchy', 'company_positions'];
const DEFAULT_VISIBLE_FILTERS_INACTIVE = ['reason_for_termination', 'status', 'hierarchy'];

const WITHOUT_ASSIGNMENT = { label: 'Sin afectar' };
const UNASSIGNED = { label: 'Sin asignar' };

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
  const permissions = usePermissionChecker(permissionsMap);

  // queryFn para fetch client-side de datos de tabla
  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getEmployeesPaginated(params, isActive),
    [isActive]
  );

  // Columns
  const columns = useMemo(() => getColumns(permissions, isActive), [permissions, isActive]);

  // ─── Filtros facetados con lazy-load ───────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    const facets = createFacetFilters((columnId, params) => getEmployeeSingleFacet(columnId, isActive, params));
    const enumFacet = (
      columnId: string,
      title: string,
      values: Record<string, string>,
      labels: Record<string, string>,
      icons: Record<string, LucideIcon | undefined>
    ) => facets.fixed(columnId, title, enumFilterOptions(Object.values(values), labels, icons), UNASSIGNED);

    return [
      // ── Enums ──────────────────────────────────────────────────────────────
      enumFacet('status', 'Estado', status_type, employeeStatusLabels, employeeStatusIcons),
      enumFacet('gender', 'Genero', gender_enum, genderLabels, genderIcons),
      enumFacet('nationality', 'Nacionalidad', nationality_enum, nationalityLabels, nationalityIcons),
      enumFacet('document_type', 'Tipo de Documento', document_type_enum, documentTypeLabels, documentTypeIcons),
      enumFacet('marital_status', 'Estado Civil', marital_status_enum, maritalStatusLabels, maritalStatusIcons),
      enumFacet(
        'level_of_education',
        'Nivel de Educacion',
        level_of_education_enum,
        levelOfEducationLabels,
        levelOfEducationIcons
      ),
      enumFacet('cost_type', 'Tipo de costo', cost_type_enum, costTypeLabels, costTypeIcons),
      enumFacet(
        'affiliate_status',
        'Estado de afiliacion',
        affiliate_status_enum,
        affiliateStatusLabels,
        affiliateStatusIcons
      ),
      enumFacet(
        'reason_for_termination',
        'Motivo de baja',
        reason_for_termination_enum,
        reasonForTerminationLabels,
        reasonForTerminationIcons
      ),

      // ── FK UUID ────────────────────────────────────────────────────────────
      facets.lookup('hierarchy', 'Sector', undefined, UNASSIGNED),
      facets.lookup('company_positions', 'Puesto', undefined, UNASSIGNED),
      facets.lookup('types_of_contract', 'Tipo de Contrato', undefined, UNASSIGNED),
      facets.lookup('work_diagram', 'Diagrama', undefined, UNASSIGNED),
      facets.lookup('workshop_sectors', 'Sectores de taller', undefined, UNASSIGNED),
      facets.lookup('category', 'Categoria', undefined, UNASSIGNED),
      facets.lookup('covenant', 'Convenio', undefined, UNASSIGNED),
      facets.lookup('guild', 'Sindicato', undefined, UNASSIGNED),
      facets.lookup('cost_center', 'Centro de costo', undefined, UNASSIGNED),
      facets.lookup('countries', 'Pais de nacimiento', undefined, UNASSIGNED),

      // ── FK BigInt ──────────────────────────────────────────────────────────
      facets.lookup('province', 'Provincia', undefined, UNASSIGNED),
      facets.lookup('city', 'Ciudad', undefined, UNASSIGNED),

      // ── M:M ────────────────────────────────────────────────────────────────
      facets.lookup('contractor_employee', 'Afectaciones', undefined, WITHOUT_ASSIGNMENT),
      facets.lookup('empleado_aptitudes', 'Aptitudes tecnicas', undefined, WITHOUT_ASSIGNMENT),

      // ── Filtros de texto libre ─────────────────────────────────────────────
      textFilter('fullName', 'Nombre', 'Buscar por nombre...'),
      textFilter('email', 'Email', 'Buscar por email...'),
      textFilter('cuil', 'CUIL', 'Buscar por CUIL...'),
      textFilter('document_number', 'Documento', 'Buscar por documento...'),
      textFilter('phone', 'Telefono', 'Buscar por telefono...'),
      textFilter('street', 'Calle', 'Buscar por calle...'),
      textFilter('street_number', 'Altura', 'Buscar por altura...'),
      textFilter('postal_code', 'CP', 'Buscar por CP...'),
      textFilter('file', 'Legajo', 'Buscar legajo...'),
      textFilter('normal_hours', 'Horas', 'Buscar por horas...'),
      textFilter('born_date', 'Nacimiento', 'Buscar por nacimiento...'),

      // ── Filtros de rango de fechas ─────────────────────────────────────────
      dateRangeFilter('date_of_admission', 'Fecha de ingreso'),
      dateRangeFilter('created_at', 'Fecha de creacion'),
      dateRangeFilter('termination_date', 'Fecha de baja'),
    ];
  }, [isActive]);

  // Las preferencias guardadas tienen prioridad; el resto de filtros arranca oculto.
  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: isActive ? DEFAULT_VISIBLE_FILTERS_ACTIVE : DEFAULT_VISIBLE_FILTERS_INACTIVE,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

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
      {...tableProps}
      toolbarActions={toolbarActions}
      showSearch
      mobileCards
      searchPlaceholder="Buscar por legajo, nombre o CUIL"
      // Client-side navigation: fetch instantáneo via React Query, sin router.push
      queryFn={tableQueryFn}
      queryKey={['employees-paginated', isActive]}
      enableRowSelection
      showRowSelection
      emptyMessage="No se encontraron empleados"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllEmployeesForExport(currentParams, isActive)),
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
          created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '-'),
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
