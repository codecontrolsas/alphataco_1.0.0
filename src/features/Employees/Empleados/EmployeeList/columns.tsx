'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import {
  affiliateStatusLabels,
  costTypeLabels,
  documentTypeLabels,
  employeeStatusBadges,
  employeeStatusLabels,
  genderLabels,
  getEnumLabel,
  levelOfEducationLabels,
  maritalStatusLabels,
  nationalityLabels,
  reasonForTerminationLabels,
} from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, Globe, GraduationCap, MoreHorizontal, Pencil, X } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import type { EmployeeListItem } from './actions.server';
import { EmployeeAvatarCell } from './components/EmployeeAvatarCell';
import {
  EMPTY,
  NamesBadge,
  dateColumn,
  enumColumn,
  enumFilterFn,
  fkColumn,
  formatUtcDate,
  manyColumn,
  renderHeader,
  textColumn,
} from './components/column-factories';
import {
  affiliateStatusIcons,
  costTypeIcons,
  documentTypeIcons,
  employeeStatusIcons,
  genderIcons,
  maritalStatusIcons,
  reasonForTerminationIcons,
} from './lib/employee-icons';

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = [
  'email', // se muestra bajo el nombre en la columna fullName
  'nationality',
  'born_date',
  'document_type',
  'gender',
  'marital_status',
  'level_of_education',
  'street',
  'street_number',
  'province',
  'city',
  'postal_code',
  'phone',
  'normal_hours',
  'types_of_contract',
  'work_diagram',
  'cost_center',
  'cost_type',
  'affiliate_status',
  'empleado_aptitudes',
  'category',
  'covenant',
  'guild',
  'workshop_sectors',
  'countries',
  'created_at',
  'is_active',
];

// ============================================================================
// COLUMNS
// ============================================================================

type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

export function getColumns(permissions: Permissions, isActive: boolean): ColumnDef<EmployeeListItem>[] {
  const canUpdate = permissions.hasPermission('empleados', 'employees', 'update');

  return [
    // --- Select ---
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todo"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Seleccionar fila"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { excludeFromExport: true },
    },

    // --- Legajo: SIEMPRE antes del nombre (así identifican los usuarios a las personas) ---
    textColumn('file', 'Legajo', 'font-mono font-semibold tabular-nums'),

    // --- Full Name: avatar + nombre (link) + email debajo ---
    {
      id: 'fullName',
      accessorFn: (row) => `${row.lastname ?? ''} ${row.firstname ?? ''}`.trim(),
      header: renderHeader('Nombre completo'),
      enableSorting: false,
      cell: ({ row }) => {
        const { id, lastname, firstname, email } = row.original;
        const initials = `${lastname?.[0] ?? ''}${firstname?.[0] ?? ''}`.toUpperCase();

        return (
          <div className="inline-flex items-center gap-3">
            <EmployeeAvatarCell
              employeeId={id}
              name={`${lastname ?? ''} ${firstname ?? ''}`.trim()}
              initials={initials}
            />
            <div className="flex min-w-0 flex-col">
              <Link
                href={`/dashboard/employee/action?action=view&employee_id=${id}`}
                className="font-semibold text-foreground hover:text-brand-ink hover:underline"
              >
                {lastname} {firstname}
              </Link>
              {email && <span className="text-sm text-muted-foreground">{email}</span>}
            </div>
          </div>
        );
      },
      meta: { title: 'Nombre completo' },
    },

    // --- Email (oculta por defecto: se ve bajo el nombre) ---
    textColumn('email', 'Email'),

    // --- Status ---
    {
      id: 'status',
      accessorKey: 'status',
      header: renderHeader('Estado'),
      cell: ({ row }) => {
        const status = row.original.status;
        if (!status) return <Badge variant="default">Sin estado</Badge>;
        const Icon = employeeStatusIcons[status];
        return (
          <Badge variant={employeeStatusBadges[status] ?? 'default'} className="gap-1">
            {Icon && <Icon className="h-3 w-3" />}
            {getEnumLabel(status, employeeStatusLabels)}
          </Badge>
        );
      },
      filterFn: enumFilterFn,
      meta: { title: 'Estado' },
    },

    // --- Sector / Puesto ---
    fkColumn(
      'hierarchy',
      'Sector',
      (r) => r.hierarchy?.name,
      (r) => r.hierarchy?.id
    ),
    fkColumn(
      'company_positions',
      'Puesto',
      (r) => r.company_positions?.name,
      (r) => r.company_positions?.id
    ),

    // --- Fecha de ingreso ---
    dateColumn('date_of_admission', 'Fecha de ingreso', formatUtcDate),

    // --- Afectaciones (M:M) ---
    manyColumn(
      'contractor_employee',
      'Afectaciones',
      (r) =>
        (r.contractor_employee ?? []).flatMap((c) =>
          c.customers ? [{ id: c.customers.id, name: c.customers.name ?? '' }] : []
        ),
      (items) => {
        if (items.length === 0) return <Badge variant="outline">Sin afectar</Badge>;
        return <NamesBadge names={items.map((i) => i.name).filter(Boolean)} />;
      }
    ),

    // =========================================================================
    // HIDDEN COLUMNS (ocultas por defecto)
    // =========================================================================

    enumColumn('nationality', 'Nacionalidad', nationalityLabels, { fixedIcon: Globe }),
    dateColumn('born_date', 'Nacimiento', (d) => {
      const parsed = moment(d, ['YYYY-MM-DD', 'DD/MM/YYYY'], true);
      return parsed.isValid() ? parsed.format('DD/MM/YYYY') : String(d);
    }),
    textColumn('cuil', 'CUIL'),
    enumColumn('document_type', 'Tipo de Documento', documentTypeLabels, { icons: documentTypeIcons }),
    textColumn('document_number', 'Documento'),
    enumColumn('gender', 'Genero', genderLabels, { icons: genderIcons }),
    enumColumn('marital_status', 'Estado Civil', maritalStatusLabels, { icons: maritalStatusIcons }),
    enumColumn('level_of_education', 'Nivel de Educacion', levelOfEducationLabels, { fixedIcon: GraduationCap }),
    textColumn('street', 'Calle'),
    textColumn('street_number', 'Altura'),
    fkColumn(
      'province',
      'Provincia',
      (r) => r.provinces?.name,
      (r) => (r.province == null ? null : String(r.province))
    ),
    fkColumn(
      'city',
      'Ciudad',
      (r) => r.cities?.name,
      (r) => (r.city == null ? null : String(r.city))
    ),
    textColumn('postal_code', 'CP'),
    textColumn('phone', 'Telefono'),
    textColumn('normal_hours', 'Horas'),
    fkColumn(
      'types_of_contract',
      'Tipo de Contrato',
      (r) => r.types_of_contract?.name,
      (r) => r.types_of_contract?.id
    ),
    fkColumn(
      'work_diagram',
      'Diagrama',
      (r) => r.work_diagram?.name,
      (r) => r.work_diagram?.id
    ),
    fkColumn(
      'cost_center',
      'Centro de costo',
      (r) => r.cost_center?.name,
      (r) => r.cost_center?.id
    ),
    enumColumn('cost_type', 'Tipo de costo', costTypeLabels, { icons: costTypeIcons, badge: true }),
    enumColumn('affiliate_status', 'Estado de afiliacion', affiliateStatusLabels, { icons: affiliateStatusIcons }),

    // --- Aptitudes tecnicas (M:M) ---
    manyColumn(
      'empleado_aptitudes',
      'Aptitudes tecnicas',
      (r) =>
        (r.empleado_aptitudes ?? []).flatMap((a) =>
          a.aptitudes_tecnicas ? [{ id: a.aptitudes_tecnicas.id, name: a.aptitudes_tecnicas.nombre ?? '' }] : []
        ),
      (items) => {
        if (items.length === 0) return <div>{EMPTY}</div>;
        return <NamesBadge names={items.map((i) => i.name).filter(Boolean)} />;
      }
    ),

    fkColumn(
      'category',
      'Categoria',
      (r) => r.category?.name,
      (r) => r.category?.id
    ),
    fkColumn(
      'covenant',
      'Convenio',
      (r) => r.covenant?.name,
      (r) => r.covenant?.id
    ),
    fkColumn(
      'guild',
      'Sindicato',
      (r) => r.guild?.name,
      (r) => r.guild?.id
    ),

    // --- Sectores de taller (M:M) ---
    manyColumn(
      'workshop_sectors',
      'Sectores de taller',
      (r) =>
        (r.employee_workshop_sectors ?? []).flatMap((ews) =>
          ews.workshop_sectors ? [{ id: ews.workshop_sectors.id, name: ews.workshop_sectors.name ?? '' }] : []
        ),
      (items) => <div>{items.length > 0 ? items.map((i) => i.name).join(', ') : EMPTY}</div>
    ),

    fkColumn(
      'countries',
      'Pais de nacimiento',
      (r) => r.countries?.name,
      (r) => r.countries?.id
    ),

    // --- Motivo y fecha de baja (solo inactivos) ---
    ...(!isActive
      ? [
          enumColumn('reason_for_termination', 'Motivo de baja', reasonForTerminationLabels, {
            icons: reasonForTerminationIcons,
          }),
          dateColumn('termination_date', 'Fecha de baja', formatUtcDate),
        ]
      : []),

    // --- Created At (timestamp: día en hora argentina) ---
    dateColumn('created_at', 'Fecha de creacion', (d) => formatArgentinaDay(d)),

    // --- Is Active ---
    {
      id: 'is_active',
      accessorKey: 'is_active',
      header: renderHeader('Activo'),
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'destructive'} className="gap-1">
          {row.original.is_active ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {row.original.is_active ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
      meta: { title: 'Activo' },
    },

    // --- Actions ---
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0" aria-label="Abrir menu de acciones">
              <span className="sr-only">Abrir menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/employee/action?action=view&employee_id=${row.original.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                Ver
              </Link>
            </DropdownMenuItem>
            {canUpdate && (
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/employee/action?action=edit&employee_id=${row.original.id}`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { title: '', excludeFromExport: true },
    },
  ];
}
