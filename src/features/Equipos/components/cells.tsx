'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { FilterFn } from '@tanstack/react-table';
import { Eye, MoreHorizontal } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { conditionIcons, conditionVariants } from '../lib/condition-config';

/**
 * Celdas y filtros compartidos por las tablas de equipos (vehículos y otros equipos, activos y dados de baja).
 */

export function EmptyCell() {
  return <span className="text-muted-foreground">-</span>;
}

/**
 * Fecha de una columna `@db.Date` (contrato, certificación, baja): llega como medianoche UTC, se lee en UTC
 * para no correrla un día en un navegador de Argentina.
 */
export function DateCell({ value }: { value: Date | string | null | undefined }) {
  if (!value) return <EmptyCell />;
  return <span className="font-mono tabular-nums">{moment.utc(value).format('DD/MM/YYYY')}</span>;
}

/** Timestamp (`created_at`, fecha del último checklist): el día en hora argentina. */
export function TimestampCell({ value }: { value: Date | string | null | undefined }) {
  if (!value) return <EmptyCell />;
  return <span className="font-mono tabular-nums">{formatArgentinaDay(value)}</span>;
}

/** Texto identificador (serie, motor, N° de contrato…) en monoespaciada. */
export function MonoCell({ value }: { value: string | number | null | undefined }) {
  if (value == null || value === '') return <EmptyCell />;
  return <span className="font-mono tabular-nums">{value}</span>;
}

interface EquipmentCellVehicle {
  brand_vehicles?: { name: string | null } | null;
  model_vehicles?: { name: string | null } | null;
  type_vehicles_typeTotype?: { name: string | null } | null;
  year?: number | string | null;
  intern_number?: string | null;
}

/** Texto de la columna virtual "Equipo": Marca Modelo (lo que también ordena y exporta el `accessorFn`). */
export function equipmentTitle(vehicle: EquipmentCellVehicle): string {
  return [vehicle.brand_vehicles?.name, vehicle.model_vehicles?.name].filter(Boolean).join(' ');
}

/** Identidad compuesta: título (Marca Modelo) y, debajo, el detalle (Tipo · Año · N° interno). */
export function EquipmentIdentity({ title, details }: { title: string; details: string }) {
  if (!title && !details) return <EmptyCell />;
  return (
    <div className="min-w-0">
      <div className="font-semibold text-foreground">{title || '-'}</div>
      {details && <div className="truncate text-sm text-muted-foreground">{details}</div>}
    </div>
  );
}

/** Identidad compuesta del vehículo: Marca Modelo / Tipo · Año · N° interno. */
export function EquipmentCell({ vehicle }: { vehicle: EquipmentCellVehicle }) {
  const details = [
    vehicle.type_vehicles_typeTotype?.name,
    vehicle.year != null ? String(vehicle.year) : null,
    vehicle.intern_number ? `N° ${vehicle.intern_number}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return <EquipmentIdentity title={equipmentTitle(vehicle)} details={details} />;
}

/** Nombre de una relación (marca, propietario…) o "-" si no tiene. */
export function NameCell({ name }: { name: string | null | undefined }) {
  return <span>{name ?? <span className="text-muted-foreground">-</span>}</span>;
}

/** Nombre de una relación como badge (tipo, subtipo, sector) o "-" si no tiene. */
export function NameBadgeCell({
  name,
  variant,
}: {
  name: string | null | undefined;
  variant?: ComponentProps<typeof Badge>['variant'];
}) {
  if (!name) return <span className="text-muted-foreground">-</span>;
  return <Badge variant={variant}>{name}</Badge>;
}

/** Valor de un enum como badge con la etiqueta del mapper (estado, moneda, tipo de costo…) o "-" si no tiene. */
export function LabelBadgeCell({
  value,
  labels,
  variant = 'outline',
}: {
  value: string | null | undefined;
  labels: Record<string, string>;
  variant?: ComponentProps<typeof Badge>['variant'];
}) {
  if (!value) return <span className="text-muted-foreground">-</span>;
  return <Badge variant={variant}>{labels[value] ?? value}</Badge>;
}

/** Condición del equipo: badge con el ícono y el color de su estado. */
export function ConditionCell({
  condition,
  labels,
}: {
  condition: string | null | undefined;
  labels: Record<string, string>;
}) {
  if (!condition) return <span className="text-muted-foreground">-</span>;
  const IconComponent = conditionIcons[condition];
  return (
    <Badge variant={(conditionVariants[condition] ?? 'default') as ComponentProps<typeof Badge>['variant']}>
      {IconComponent && <IconComponent className="mr-1 size-3 inline" />}
      {labels[condition] ?? condition}
    </Badge>
  );
}

/** Menú de acciones de las filas de dados de baja: solo "Ver ficha". */
export function ViewRecordMenu({ href }: { href: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Acciones del equipo">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={href}>
            <Eye className="mr-2 size-4" />
            Ver ficha
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Filtro de afectaciones (M:M con clientes): sin filtro pasa todo; sin afectaciones coincide con "Sin afectar". */
export const matchesContractor =
  <TData,>(
    getContractors: (row: TData) => { customers: { id: string } | null }[] | null | undefined
  ): FilterFn<TData> =>
  (row, _id, filterValue) => {
    if (!filterValue || !Array.isArray(filterValue) || filterValue.length === 0) return true;
    const contractors = getContractors(row.original) ?? [];
    if (contractors.length === 0) {
      return (filterValue as string[]).includes(NULL_FILTER_VALUE);
    }
    return contractors.some((c) => {
      const id = c.customers?.id;
      return id && (filterValue as string[]).includes(id);
    });
  };

/** Texto plano de las afectaciones (clientes) de un equipo: sirve de `accessorFn` y de valor de export. */
export function contractorNames(contractors: { customers: { name: string | null } | null }[] | undefined): string[] {
  return (contractors ?? []).map((c) => c.customers?.name ?? '').filter(Boolean);
}

/**
 * Afectaciones del equipo: primer cliente y, si hay más, "+N" con el resto en un tooltip. `emptyText` y
 * `tooltipClassName` conservan la presentación propia de cada tabla (otros equipos activos y de baja).
 */
export function ContractorsCell({
  names,
  emptyText,
  tooltipClassName,
}: {
  names: string[];
  emptyText?: string;
  tooltipClassName?: string;
}) {
  if (names.length === 0) return emptyText ? <span className="text-muted-foreground">{emptyText}</span> : <EmptyCell />;

  const [first, ...rest] = names;

  if (rest.length === 0) {
    return <Badge variant="default">{first}</Badge>;
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex">
            <Badge variant="default" className="cursor-pointer select-none">
              {first} +{rest.length}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent className={tooltipClassName}>
          <div className="flex flex-col gap-1">
            {rest.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
