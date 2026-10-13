'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import type { Column, ColumnDef } from '@tanstack/react-table';
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
import type { ReactNode } from 'react';
import type { EmployeeListItem } from './actions.server';

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
// COLUMN HELPERS
// ============================================================================

type Col = ColumnDef<EmployeeListItem>;
type EmployeeKey = keyof EmployeeListItem & string;

const EMPTY = '-';

const renderHeader =
  (title: string) =>
  ({ column }: { column: Column<EmployeeListItem, unknown> }) => (
    <DataTableColumnHeader column={column} title={title} />
  );

/** filterFn para enums (null → "Sin asignar") */
const enumFilterFn: Col['filterFn'] = (row, id, value: string[]) => {
  const val = row.getValue(id) as string | null;
  if (val == null) return value.includes(NULL_FILTER_VALUE);
  return value.includes(val);
};

/** Columna de texto/numero simple (accessor directo al campo) */
function textColumn(key: EmployeeKey, title: string, className?: string): Col {
  return {
    id: key,
    accessorFn: (row) => row[key],
    header: renderHeader(title),
    cell: ({ row }) => {
      const val = row.original[key];
      return <div className={className}>{val == null ? EMPTY : String(val)}</div>;
    },
    meta: { title },
  };
}

/** Columna de fecha: `format` recibe el valor no nulo y devuelve el texto a mostrar */
function dateColumn<K extends EmployeeKey>(
  key: K,
  title: string,
  format: (value: NonNullable<EmployeeListItem[K]>) => string
): Col {
  return {
    id: key,
    accessorFn: (row) => row[key],
    header: renderHeader(title),
    cell: ({ row }) => {
      const val = row.original[key];
      return (
        <div className="font-mono tabular-nums">{val ? format(val as NonNullable<EmployeeListItem[K]>) : EMPTY}</div>
      );
    },
    meta: { title },
  };
}

type EnumColumnOptions = {
  /** Icono por valor del enum */
  icons?: Record<string, LucideIcon>;
  /** Icono fijo para todos los valores (cuando no hay mapa por valor) */
  fixedIcon?: LucideIcon;
  /** Mostrar como Badge outline en vez de texto con icono */
  badge?: boolean;
};

/** Columna de enum con label del mapper, icono opcional y filtro con NULL_FILTER_VALUE */
function enumColumn(
  key: EmployeeKey,
  title: string,
  labels: Record<string, string>,
  { icons, fixedIcon, badge }: EnumColumnOptions = {}
): Col {
  return {
    id: key,
    accessorFn: (row) => row[key],
    header: renderHeader(title),
    cell: ({ row }) => {
      const raw = row.original[key];
      if (!raw) return <div>{EMPTY}</div>;
      const val = String(raw);
      const Icon = fixedIcon ?? icons?.[val];
      const label = getEnumLabel(val, labels);
      if (badge) {
        return (
          <Badge variant="outline" className="gap-1">
            {Icon && <Icon className="h-3 w-3" />}
            {label}
          </Badge>
        );
      }
      return (
        <div className="inline-flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          {label}
        </div>
      );
    },
    filterFn: enumFilterFn,
    meta: { title },
  };
}

/**
 * Columna FK: muestra el nombre de la relacion y filtra por la key de la FK
 * (id UUID, o id numerico convertido a string).
 */
function fkColumn(
  id: string,
  title: string,
  getName: (row: EmployeeListItem) => string | null | undefined,
  getKey: (row: EmployeeListItem) => string | null | undefined
): Col {
  return {
    id,
    accessorFn: (row) => getName(row) ?? '',
    header: renderHeader(title),
    cell: ({ row }) => <div>{getName(row.original) ?? EMPTY}</div>,
    filterFn: (row, _id, value: string[]) => {
      const key = getKey(row.original);
      if (key == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(key);
    },
    meta: { title },
  };
}

/** Columna M:M: texto exportable = nombres unidos; filtra si algun id coincide */
function manyColumn(
  id: string,
  title: string,
  getItems: (row: EmployeeListItem) => Array<{ id: string; name: string }>,
  renderCell: (items: Array<{ id: string; name: string }>) => ReactNode
): Col {
  return {
    id,
    accessorFn: (row) =>
      getItems(row)
        .map((i) => i.name)
        .join(', '),
    header: renderHeader(title),
    cell: ({ row }) => renderCell(getItems(row.original)),
    filterFn: (row, _id, value: string[]) => {
      if (!value?.length) return true;
      const items = getItems(row.original);
      if (items.length === 0) return value.includes(NULL_FILTER_VALUE);
      return items.some((i) => value.includes(i.id));
    },
    enableSorting: false,
    meta: { title },
  };
}

/** Badge con el primer nombre y "+N"; tooltip con la lista completa */
function NamesBadge({ names }: { names: string[] }) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex">
            <Badge variant="outline">
              {names[0] ?? EMPTY}
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
}

const formatUtcDate = (value: string | Date) => moment.utc(value).format('DD/MM/YYYY');

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

    // --- Full Name: avatar + nombre (link) + email debajo ---
    {
      id: 'fullName',
      accessorFn: (row) => `${row.lastname ?? ''} ${row.firstname ?? ''}`.trim(),
      header: renderHeader('Nombre completo'),
      enableSorting: false,
      cell: ({ row }) => {
        const { id, picture, lastname, firstname, email } = row.original;
        const name = `${lastname ?? ''} ${firstname ?? ''}`.trim();
        const initials = `${lastname?.[0] ?? ''}${firstname?.[0] ?? ''}`.toUpperCase();

        const avatar = (
          <Avatar>
            {picture && <AvatarImage src={picture} alt="" />}
            <AvatarFallback>{initials || <User className="h-4 w-4" />}</AvatarFallback>
          </Avatar>
        );

        return (
          <div className="inline-flex items-center gap-3">
            {picture ? (
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Ver foto de ${name}`}
                    className="shrink-0 cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {avatar}
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-sm p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={picture} alt={name} className="h-auto w-full rounded-lg" />
                </DialogContent>
              </Dialog>
            ) : (
              avatar
            )}
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

    // --- Legajo (siempre visible y filtrable) ---
    textColumn('file', 'Legajo', 'font-mono tabular-nums text-muted-foreground'),

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

    // --- Created At (hora local, como antes) ---
    dateColumn('created_at', 'Fecha de creacion', (d) => moment(d).format('DD/MM/YYYY')),

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
