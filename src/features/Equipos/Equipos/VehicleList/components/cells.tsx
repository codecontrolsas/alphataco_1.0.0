'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import moment from 'moment';

/**
 * Celdas compartidas por las tablas de vehículos (activos y dados de baja).
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

/** Identidad compuesta del equipo: Marca Modelo / Tipo · Año · N° interno. */
export function EquipmentCell({ vehicle }: { vehicle: EquipmentCellVehicle }) {
  const title = equipmentTitle(vehicle);
  const details = [
    vehicle.type_vehicles_typeTotype?.name,
    vehicle.year != null ? String(vehicle.year) : null,
    vehicle.intern_number ? `N° ${vehicle.intern_number}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!title && !details) return <EmptyCell />;
  return (
    <div className="min-w-0">
      <div className="font-semibold text-foreground">{title || '-'}</div>
      {details && <div className="truncate text-sm text-muted-foreground">{details}</div>}
    </div>
  );
}

/** Texto plano de las afectaciones (clientes) de un equipo: sirve de `accessorFn` y de valor de export. */
export function contractorNames(contractors: { customers: { name: string | null } | null }[] | undefined): string[] {
  return (contractors ?? []).map((c) => c.customers?.name ?? '').filter(Boolean);
}

/** Afectaciones del equipo: primer cliente y, si hay más, "+N" con el resto en un tooltip. */
export function ContractorsCell({ names }: { names: string[] }) {
  if (names.length === 0) return <EmptyCell />;

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
        <TooltipContent>
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
