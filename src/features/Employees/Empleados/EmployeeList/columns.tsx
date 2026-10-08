'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
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
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Check,
  CircleSlash,
  CreditCard,
  Eye,
  FileSignature,
  Globe,
  GraduationCap,
  Handshake,
  Heart,
  LogOut,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  ShieldX,
  TrendingDown,
  TrendingUp,
  User,
  UserCheck,
  UserCircle,
  UserX,
  Users,
  X,
  XCircle,
  XOctagon,
} from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import type { EmployeeListItem } from './actions.server';

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

// ============================================================================
// STATUS ICONS (exported for use in filters)
// ============================================================================

export const employeeStatusIcons: Record<string, LucideIcon> = {
  Avalado: ShieldCheck,
  No_avalado: ShieldX,
  Incompleto: X,
  Completo: Check,
  Completo_con_doc_vencida: AlertTriangle,
};

export const genderIcons: Record<string, LucideIcon> = {
  Masculino: User,
  Femenino: UserCircle,
  No_Declarado: Users,
};

export const nationalityIcons: Record<string, LucideIcon> = {
  Argentina: Globe,
  Extranjero: Globe,
};

export const documentTypeIcons: Record<string, LucideIcon> = {
  DNI: CreditCard,
  LE: CreditCard,
  LC: CreditCard,
  PASAPORTE: Globe,
};

export const maritalStatusIcons: Record<string, LucideIcon> = {
  Casado: Heart,
  Soltero: User,
  Divorciado: UserX,
  Viudo: UserX,
  Separado: Users,
  Union_de_hecho: Heart,
};

export const levelOfEducationIcons: Record<string, LucideIcon> = {
  Primario: GraduationCap,
  Secundario: GraduationCap,
  Terciario: GraduationCap,
  Universitario: GraduationCap,
  PosGrado: GraduationCap,
};

export const costTypeIcons: Record<string, LucideIcon> = {
  Directo: TrendingUp,
  Indirecto: TrendingDown,
};

export const affiliateStatusIcons: Record<string, LucideIcon> = {
  Dentro_de_convenio: UserCheck,
  Fuera_de_convenio: UserX,
};

export const reasonForTerminationIcons: Record<string, LucideIcon> = {
  Despido_sin_causa: XOctagon,
  Renuncia: LogOut,
  Despido_con_causa: XCircle,
  Acuerdo_de_partes: Handshake,
  Fin_de_contrato: FileSignature,
  Fallecimiento: CircleSlash,
};

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = [
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

    // --- Full Name (visible) ---
    {
      id: 'fullName',
      accessorFn: (row) => `${row.lastname ?? ''} ${row.firstname ?? ''}`.trim(),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre completo" />,
      enableSorting: false,
      cell: ({ row }) => {
        const pic = row.original.picture;
        const fallback = (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
        );

        return (
          <div className="inline-flex items-center gap-2">
            {pic ? (
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 cursor-pointer rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <img src={pic} alt="" className="h-7 w-7 rounded-full object-cover" />
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-sm p-2">
                  <img
                    src={pic}
                    alt={`${row.original.lastname} ${row.original.firstname}`}
                    className="h-auto w-full rounded-lg"
                  />
                </DialogContent>
              </Dialog>
            ) : (
              fallback
            )}
            <Link
              href={`/dashboard/employee/action?action=view&employee_id=${row.original.id}`}
              className="font-medium text-blue-600 hover:underline"
            >
              {row.original.lastname} {row.original.firstname}
            </Link>
          </div>
        );
      },
      meta: { title: 'Nombre completo', mobile: { role: 'title', priority: 2, label: 'Nombre completo' } },
    },

    // --- Email (visible) ---
    {
      id: 'email',
      accessorKey: 'email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      cell: ({ row }) => <div>{row.original.email ?? '-'}</div>,
      meta: { title: 'Email' },
    },

    // --- File / Legajo (visible) ---
    {
      id: 'file',
      accessorKey: 'file',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Legajo" />,
      cell: ({ row }) => <div>{row.original.file ?? '-'}</div>,
      meta: { title: 'Legajo', mobile: { role: 'title', priority: 1 } },
    },

    // --- Status (visible) ---
    {
      id: 'status',
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
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
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      meta: { title: 'Estado', mobile: { role: 'status' } },
    },

    // --- Hierarchy / Sector (visible) ---
    {
      id: 'hierarchy',
      accessorFn: (row) => row.hierarchy?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sector" />,
      cell: ({ row }) => <div>{row.original.hierarchy?.name ?? '-'}</div>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.hierarchy?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
      meta: { title: 'Sector', mobile: { role: 'field', priority: 1 } },
    },

    // --- Company Position (visible) ---
    {
      id: 'company_positions',
      accessorFn: (row) => row.company_positions?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Puesto" />,
      cell: ({ row }) => <div>{row.original.company_positions?.name ?? '-'}</div>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.company_positions?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
      meta: { title: 'Puesto', mobile: { role: 'subtitle' } },
    },

    // --- Date of Admission (visible) ---
    {
      id: 'date_of_admission',
      accessorKey: 'date_of_admission',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de ingreso" />,
      cell: ({ row }) => (
        <div>
          {row.original.date_of_admission ? moment.utc(row.original.date_of_admission).format('DD/MM/YYYY') : '-'}
        </div>
      ),
      meta: { title: 'Fecha de ingreso', mobile: { role: 'field', priority: 3, label: 'Ingreso' } },
    },

    // --- Contractor Employee / Afectaciones (visible) ---
    {
      id: 'contractor_employee',
      accessorFn: (row) =>
        (row.contractor_employee ?? [])
          .map((c) => c.customers?.name ?? '')
          .filter(Boolean)
          .join(', '),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Afectaciones" />,
      cell: ({ row }) => {
        const contractors = row.original.contractor_employee ?? [];
        if (contractors.length === 0) return <Badge variant="outline">Sin afectar</Badge>;

        const names = contractors.map((c) => c.customers?.name ?? '').filter(Boolean);
        const first = names[0] ?? '-';

        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-flex">
                  <Badge variant="outline">
                    {first}
                    {names.length > 1 && ` +${names.length - 1}`}
                  </Badge>
                </div>
              </TooltipTrigger>
              {names.length > 1 && (
                <TooltipContent className="rounded-lg bg-black p-2 text-white">
                  <div className="flex flex-col gap-1">
                    {names.map((name, index) => (
                      <span key={index}>{name}</span>
                    ))}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        if (!value?.length) return true;
        const contractors = row.original.contractor_employee ?? [];
        if (contractors.length === 0) return value.includes(NULL_FILTER_VALUE);
        const matchesReal = contractors.some((c) => c.customers && value.includes(c.customers.id));
        return matchesReal;
      },
      enableSorting: false,
      meta: { title: 'Afectaciones', mobile: { role: 'field', priority: 2, label: 'Afectaciones' } },
    },

    // =========================================================================
    // HIDDEN COLUMNS (ocultas por defecto)
    // =========================================================================

    // --- Nationality ---
    {
      id: 'nationality',
      accessorKey: 'nationality',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nacionalidad" />,
      cell: ({ row }) => {
        const val = row.original.nationality;
        if (!val) return <div>-</div>;
        return (
          <div className="inline-flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            {getEnumLabel(val, nationalityLabels)}
          </div>
        );
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      meta: { title: 'Nacionalidad' },
    },

    // --- Born Date ---
    {
      id: 'born_date',
      accessorKey: 'born_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nacimiento" />,
      cell: ({ row }) => {
        const d = row.original.born_date;
        if (!d) return <div>-</div>;
        const parsed = moment(d, ['YYYY-MM-DD', 'DD/MM/YYYY'], true);
        return <div>{parsed.isValid() ? parsed.format('DD/MM/YYYY') : d}</div>;
      },
      meta: { title: 'Nacimiento' },
    },

    // --- CUIL ---
    {
      id: 'cuil',
      accessorKey: 'cuil',
      header: ({ column }) => <DataTableColumnHeader column={column} title="CUIL" />,
      cell: ({ row }) => <div>{row.original.cuil ?? '-'}</div>,
      meta: { title: 'CUIL' },
    },

    // --- Document Type ---
    {
      id: 'document_type',
      accessorKey: 'document_type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de Documento" />,
      cell: ({ row }) => {
        const val = row.original.document_type;
        if (!val) return <div>-</div>;
        const Icon = documentTypeIcons[val];
        return (
          <div className="inline-flex items-center gap-1.5">
            {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
            {getEnumLabel(val, documentTypeLabels)}
          </div>
        );
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      meta: { title: 'Tipo de Documento' },
    },

    // --- Document Number ---
    {
      id: 'document_number',
      accessorKey: 'document_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Documento" />,
      cell: ({ row }) => <div>{row.original.document_number ?? '-'}</div>,
      meta: { title: 'Documento' },
    },

    // --- Gender ---
    {
      id: 'gender',
      accessorKey: 'gender',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Genero" />,
      cell: ({ row }) => {
        const val = row.original.gender;
        if (!val) return <div>-</div>;
        const Icon = genderIcons[val];
        return (
          <div className="inline-flex items-center gap-1.5">
            {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
            {getEnumLabel(val, genderLabels)}
          </div>
        );
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      meta: { title: 'Genero' },
    },

    // --- Marital Status ---
    {
      id: 'marital_status',
      accessorKey: 'marital_status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado Civil" />,
      cell: ({ row }) => {
        const val = row.original.marital_status;
        if (!val) return <div>-</div>;
        const Icon = maritalStatusIcons[val];
        return (
          <div className="inline-flex items-center gap-1.5">
            {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
            {getEnumLabel(val, maritalStatusLabels)}
          </div>
        );
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      meta: { title: 'Estado Civil' },
    },

    // --- Level of Education ---
    {
      id: 'level_of_education',
      accessorKey: 'level_of_education',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nivel de Educacion" />,
      cell: ({ row }) => {
        const val = row.original.level_of_education;
        if (!val) return <div>-</div>;
        return (
          <div className="inline-flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
            {getEnumLabel(val, levelOfEducationLabels)}
          </div>
        );
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      meta: { title: 'Nivel de Educacion' },
    },

    // --- Street ---
    {
      id: 'street',
      accessorKey: 'street',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Calle" />,
      cell: ({ row }) => <div>{row.original.street ?? '-'}</div>,
      meta: { title: 'Calle' },
    },

    // --- Street Number ---
    {
      id: 'street_number',
      accessorKey: 'street_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Altura" />,
      cell: ({ row }) => <div>{row.original.street_number ?? '-'}</div>,
      meta: { title: 'Altura' },
    },

    // --- Province ---
    {
      id: 'province',
      accessorFn: (row) => row.provinces?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Provincia" />,
      cell: ({ row }) => <div>{row.original.provinces?.name ?? '-'}</div>,
      filterFn: (row, _id, value: string[]) => {
        const val = row.original.province;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(String(val));
      },
      meta: { title: 'Provincia' },
    },

    // --- City ---
    {
      id: 'city',
      accessorFn: (row) => row.cities?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ciudad" />,
      cell: ({ row }) => <div>{row.original.cities?.name ?? '-'}</div>,
      filterFn: (row, _id, value: string[]) => {
        const val = row.original.city;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(String(val));
      },
      meta: { title: 'Ciudad' },
    },

    // --- Postal Code ---
    {
      id: 'postal_code',
      accessorKey: 'postal_code',
      header: ({ column }) => <DataTableColumnHeader column={column} title="CP" />,
      cell: ({ row }) => <div>{row.original.postal_code ?? '-'}</div>,
      meta: { title: 'CP' },
    },

    // --- Phone ---
    {
      id: 'phone',
      accessorKey: 'phone',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Telefono" />,
      cell: ({ row }) => <div>{row.original.phone ?? '-'}</div>,
      meta: { title: 'Telefono' },
    },

    // --- Normal Hours ---
    {
      id: 'normal_hours',
      accessorKey: 'normal_hours',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Horas" />,
      cell: ({ row }) => <div>{row.original.normal_hours ?? '-'}</div>,
      meta: { title: 'Horas' },
    },

    // --- Types of Contract ---
    {
      id: 'types_of_contract',
      accessorFn: (row) => row.types_of_contract?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de Contrato" />,
      cell: ({ row }) => <div>{row.original.types_of_contract?.name ?? '-'}</div>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.types_of_contract?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
      meta: { title: 'Tipo de Contrato' },
    },

    // --- Work Diagram ---
    {
      id: 'work_diagram',
      accessorFn: (row) => row.work_diagram?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Diagrama" />,
      cell: ({ row }) => <div>{row.original.work_diagram?.name ?? '-'}</div>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.work_diagram?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
      meta: { title: 'Diagrama' },
    },

    // --- Cost Center ---
    {
      id: 'cost_center',
      accessorFn: (row) => row.cost_center?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Centro de costo" />,
      cell: ({ row }) => <div>{row.original.cost_center?.name ?? '-'}</div>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.cost_center?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
      meta: { title: 'Centro de costo' },
    },

    // --- Cost Type ---
    {
      id: 'cost_type',
      accessorKey: 'cost_type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de costo" />,
      cell: ({ row }) => {
        const val = row.original.cost_type;
        if (!val) return <div>-</div>;
        const Icon = costTypeIcons[val];
        return (
          <Badge variant="outline" className="gap-1">
            {Icon && <Icon className="h-3 w-3" />}
            {getEnumLabel(val, costTypeLabels)}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      meta: { title: 'Tipo de costo' },
    },

    // --- Affiliate Status ---
    {
      id: 'affiliate_status',
      accessorKey: 'affiliate_status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado de afiliacion" />,
      cell: ({ row }) => {
        const val = row.original.affiliate_status;
        if (!val) return <div>-</div>;
        const Icon = affiliateStatusIcons[val];
        return (
          <div className="inline-flex items-center gap-1.5">
            {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
            {getEnumLabel(val, affiliateStatusLabels)}
          </div>
        );
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      meta: { title: 'Estado de afiliacion' },
    },

    // --- Empleado Aptitudes (M:M) ---
    {
      id: 'empleado_aptitudes',
      accessorFn: (row) =>
        (row.empleado_aptitudes ?? [])
          .map((a) => a.aptitudes_tecnicas?.nombre ?? '')
          .filter(Boolean)
          .join(', '),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Aptitudes tecnicas" />,
      cell: ({ row }) => {
        const aptitudes = row.original.empleado_aptitudes ?? [];
        if (aptitudes.length === 0) return <div>-</div>;

        const names = aptitudes.map((a) => a.aptitudes_tecnicas?.nombre ?? '').filter(Boolean);
        const first = names[0] ?? '-';

        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-flex">
                  <Badge variant="outline">
                    {first}
                    {names.length > 1 && ` +${names.length - 1}`}
                  </Badge>
                </div>
              </TooltipTrigger>
              {names.length > 1 && (
                <TooltipContent className="rounded-lg bg-black p-2 text-white">
                  <div className="flex flex-col gap-1">
                    {names.map((name, index) => (
                      <span key={index}>{name}</span>
                    ))}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        if (!value?.length) return true;
        const aptitudes = row.original.empleado_aptitudes ?? [];
        if (aptitudes.length === 0) return value.includes(NULL_FILTER_VALUE);
        return aptitudes.some((a) => a.aptitudes_tecnicas && value.includes(a.aptitudes_tecnicas.id));
      },
      enableSorting: false,
      meta: { title: 'Aptitudes tecnicas' },
    },

    // --- Category ---
    {
      id: 'category',
      accessorFn: (row) => row.category?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Categoria" />,
      cell: ({ row }) => <div>{row.original.category?.name ?? '-'}</div>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.category?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
      meta: { title: 'Categoria' },
    },

    // --- Covenant ---
    {
      id: 'covenant',
      accessorFn: (row) => row.covenant?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Convenio" />,
      cell: ({ row }) => <div>{row.original.covenant?.name ?? '-'}</div>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.covenant?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
      meta: { title: 'Convenio' },
    },

    // --- Guild ---
    {
      id: 'guild',
      accessorFn: (row) => row.guild?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sindicato" />,
      cell: ({ row }) => <div>{row.original.guild?.name ?? '-'}</div>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.guild?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
      meta: { title: 'Sindicato' },
    },

    // --- Workshop Sectors (M:M) ---
    {
      id: 'workshop_sectors',
      accessorFn: (row) =>
        row.employee_workshop_sectors
          ?.map((ews) => ews.workshop_sectors?.name)
          .filter(Boolean)
          .join(', ') ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sectores de taller" />,
      cell: ({ row }) => {
        const names =
          row.original.employee_workshop_sectors?.map((ews) => ews.workshop_sectors?.name).filter(Boolean) ?? [];
        return <div>{names.length > 0 ? names.join(', ') : '-'}</div>;
      },
      enableSorting: false,
      filterFn: (row, _id, value: string[]) => {
        const ids =
          (row.original.employee_workshop_sectors
            ?.map((ews) => ews.workshop_sectors?.id)
            .filter(Boolean) as string[]) ?? [];
        if (ids.length === 0) return value.includes(NULL_FILTER_VALUE);
        return ids.some((id) => value.includes(id));
      },
      meta: { title: 'Sectores de taller' },
    },

    // --- Countries (birthplace) ---
    {
      id: 'countries',
      accessorFn: (row) => row.countries?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Pais de nacimiento" />,
      cell: ({ row }) => <div>{row.original.countries?.name ?? '-'}</div>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.countries?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
      meta: { title: 'Pais de nacimiento' },
    },

    // --- Reason for Termination (solo inactivos) ---
    ...(!isActive
      ? [
          {
            id: 'reason_for_termination',
            accessorKey: 'reason_for_termination',
            header: ({ column }: { column: import('@tanstack/react-table').Column<EmployeeListItem> }) => (
              <DataTableColumnHeader column={column} title="Motivo de baja" />
            ),
            cell: ({ row }: { row: import('@tanstack/react-table').Row<EmployeeListItem> }) => {
              const val = row.original.reason_for_termination;
              if (!val) return <div>-</div>;
              const Icon = reasonForTerminationIcons[val];
              return (
                <div className="inline-flex items-center gap-1.5">
                  {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                  {getEnumLabel(val, reasonForTerminationLabels)}
                </div>
              );
            },
            filterFn: (row: import('@tanstack/react-table').Row<EmployeeListItem>, id: string, value: string[]) => {
              const val = row.getValue(id) as string | null;
              if (val == null) return value.includes(NULL_FILTER_VALUE);
              return value.includes(val);
            },
            meta: { title: 'Motivo de baja' },
          } satisfies ColumnDef<EmployeeListItem>,
          {
            id: 'termination_date',
            accessorKey: 'termination_date',
            header: ({ column }: { column: import('@tanstack/react-table').Column<EmployeeListItem> }) => (
              <DataTableColumnHeader column={column} title="Fecha de baja" />
            ),
            cell: ({ row }: { row: import('@tanstack/react-table').Row<EmployeeListItem> }) => (
              <div>
                {row.original.termination_date ? moment.utc(row.original.termination_date).format('DD/MM/YYYY') : '-'}
              </div>
            ),
            meta: { title: 'Fecha de baja', mobile: { role: 'field', priority: 0, label: 'Baja' } },
          } satisfies ColumnDef<EmployeeListItem>,
        ]
      : []),

    // --- Created At ---
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de creacion" />,
      cell: ({ row }) => (
        <div>{row.original.created_at ? moment(row.original.created_at).format('DD/MM/YYYY') : '-'}</div>
      ),
      meta: { title: 'Fecha de creacion' },
    },

    // --- Is Active ---
    {
      id: 'is_active',
      accessorKey: 'is_active',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Activo" />,
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
            <Button variant="ghost" className="h-8 w-8 p-0">
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
