'use client';

import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import type { DataTableFacetedFilterConfig, DataTableFilterOption, DataTableSearchParams, FacetResult } from '@/shared/components/common/DataTable/types';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { Ban, CheckCircle2, CircleOff, Shield } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { getAllCompanyUsersForExport, getCompanyUsersPaginated } from '../actions.server';
import { CreateUserModal } from '../components/create-user-modal';
import { getCompanyUserSingleFacet } from '../facets.server';
import type { CompanyUserListItem } from '../lib/users-types';
import { getCompanyUsersColumns } from './columns';

const TABLE_ID = 'company-users';

const DEFAULT_VISIBLE_FILTERS = ['is_active', 'role', 'linked_employee'];

interface UsersDataTableProps {
  data: CompanyUserListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  companyId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
  permissionsMap: Record<string, boolean>;
}

export function _UsersDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  companyId,
  initialColumnVisibility,
  initialFilterVisibility,
  permissionsMap,
}: UsersDataTableProps) {
  // ── State para client-side navigation ─────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // ── queryFn para client-side navigation ───────────────────────────────────
  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getCompanyUsersPaginated(companyId, params),
    [companyId]
  );

  // ── Permisos (construidos desde el map del servidor) ──────────────────────
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  const canCreate = permissionsMap['configuracion:usuarios-empleados:create'] === true;

  // ── Columnas (con permisos) ───────────────────────────────────────────────
  const columns = useMemo(() => getCompanyUsersColumns(permissions), [permissions]);

  // ── Lazy-load facets helpers ──────────────────────────────────────────────
  const fetchIsActiveFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getCompanyUserSingleFacet('is_active', companyId, params);
      if (!result) return { options: [], counts: new Map() };

      const options = [
        { value: 'true', label: 'Activo', icon: CheckCircle2 },
        { value: 'false', label: 'Baneado', icon: Ban },
      ];

      return { options, counts: result.counts };
    },
    [companyId]
  );

  const fetchRoleFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getCompanyUserSingleFacet('role', companyId, params);
      if (!result) return { options: [], counts: new Map() };

      const options: DataTableFilterOption[] = (result.resolvedOptions ?? []).map((o) => ({
        ...o,
        icon: Shield,
      }));

      // Agregar "Sin rol" si existe
      if (result.counts.has(NULL_FILTER_VALUE)) {
        options.push({
          value: NULL_FILTER_VALUE,
          label: 'Sin rol',
          icon: CircleOff,
        });
      }

      return { options, counts: result.counts };
    },
    [companyId]
  );

  const fetchLinkedEmployeeFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getCompanyUserSingleFacet('linked_employee', companyId, params);
      if (!result) return { options: [], counts: new Map() };

      const options: DataTableFilterOption[] = [...(result.resolvedOptions ?? [])];

      if (result.counts.has(NULL_FILTER_VALUE)) {
        options.push({
          value: NULL_FILTER_VALUE,
          label: 'Sin vincular',
          icon: CircleOff,
        });
      }

      return { options, counts: result.counts };
    },
    [companyId]
  );

  // ── Configuracion de filtros facetados (lazy-load) ────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'is_active',
        title: 'Estado',
        fetchFacet: fetchIsActiveFacet,
      },
      {
        columnId: 'role',
        title: 'Rol',
        fetchFacet: fetchRoleFacet,
      },
      {
        columnId: 'linked_employee',
        title: 'Empleado vinculado',
        fetchFacet: fetchLinkedEmployeeFacet,
      },
      {
        columnId: 'created_at',
        title: 'Fecha de alta',
        type: 'dateRange' as const,
      },
      {
        columnId: 'fullname',
        title: 'Nombre',
        type: 'text' as const,
      },
      {
        columnId: 'email',
        title: 'Correo',
        type: 'text' as const,
      },
    ],
    [fetchIsActiveFacet, fetchRoleFacet, fetchLinkedEmployeeFacet]
  );

  // ── Boton de crear usuario ────────────────────────────────────────────────
  const toolbarActions = canCreate ? (
    <PermissionGuard module="configuracion" tab="usuarios-empleados" action="create">
      <CreateUserModal />
    </PermissionGuard>
  ) : undefined;

  // ── Visibilidad de filtros ────────────────────────────────────────────────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  // ── Export config (usa currentParams para respetar filtros activos) ────────
  const exportConfig = useMemo(
    () => ({
      options: {
        filename: 'usuarios-empresa',
        sheetName: 'Usuarios',
        title: 'Usuarios de la Empresa',
      },
      fetchAllData: async () => unwrapExportResult(await getAllCompanyUsersForExport(companyId, currentParams)),
      formatters: {
        fullname: (_val: unknown, row: CompanyUserListItem) => row.profile?.fullname ?? '',
        email: (_val: unknown, row: CompanyUserListItem) => row.profile?.email ?? '',
        is_active: (_val: unknown, row: CompanyUserListItem) => (row.is_active ? 'Activo' : 'Baneado'),
        role: (_val: unknown, row: CompanyUserListItem) => {
          const roles = row.profile?.user_roles ?? [];
          if (row.isOwner && roles.length === 0) return 'Propietario';
          if (roles.length === 0) return 'Sin rol';
          return roles
            .map((ur) => ur.roles?.name ?? '')
            .filter(Boolean)
            .join(', ');
        },
        linked_employee: (_val: unknown, row: CompanyUserListItem) => {
          const emp = row.profile?.employees;
          if (!emp) return 'Sin vincular';
          return `[${emp.file}] ${emp.lastname ?? ''} ${emp.firstname ?? ''}`.trim();
        },
        created_at: (_val: unknown, row: CompanyUserListItem) =>
          row.created_at && row.created_at.getTime() !== 0 ? formatArgentinaDay(row.created_at) : '',
      } as Record<string, (value: unknown, row: CompanyUserListItem) => string>,
    }),
    [companyId, currentParams]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['company-users', companyId]}
      onStateChange={handleStateChange}
      tableId={tableId}
      paramNamespace={TABLE_ID}
      facetedFilters={facetedFilters}
      exportConfig={exportConfig}
      initialColumnVisibility={initialColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      searchPlaceholder="Buscar por nombre o correo..."
      emptyMessage="No hay usuarios registrados"
      showFilterToggle={true}
      toolbarActions={toolbarActions}
    />
  );
}
