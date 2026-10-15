'use client';

import type { BadgeProps } from '@/components/ui/badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { MaintenanceStatusPill } from '@/features/Mantenimiento/shared/components/MaintenanceStatusPill';
import {
  getResourceKindLabel,
  getResourceLabel,
  type WithMaintenanceResource,
} from '@/features/Mantenimiento/shared/maintenance-resource';
import { ArrowLeft, Calendar, Lock, Pause, Play } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

const priorityVariants: Record<string, BadgeVariant> = {
  urgent: 'destructive',
  high: 'warning',
  medium: 'info',
  low: 'secondary',
};

const priorityLabels: Record<string, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

/**
 * Recurso de la OT: vehiculo o equipamiento (ticket 596).
 *
 * Se recibe la fila cruda con las dos relaciones y los helpers compartidos
 * resuelven cual esta cargada, para no duplicar aca la logica del modulo.
 */
type WorkOrderResource = WithMaintenanceResource & {
  vehicles?: {
    domain?: string | null;
    serie?: string | null;
    intern_number?: string | null;
    kilometer?: string | null;
    engine_hours?: string | null;
    sub_type?: { name: string | null } | null;
  } | null;
  other_equipment?: {
    serial_number?: string | null;
    intern_number?: string | null;
    horometer?: number | string | null;
    sub_type?: { name: string | null } | null;
  } | null;
};

/** Km y horas llegan como texto desde la BD: se muestran con separador de miles */
function formatMeter(value: number | string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString('es-AR') : String(value);
}

/** Dato suelto de la barra de identificacion del recurso */
type ResourceField = { label: string; value: string; strong?: boolean };

/**
 * Arma la barra de identificacion segun el tipo de recurso: un vehiculo se
 * reconoce por dominio + serie y mide kilometros; un equipamiento no tiene
 * dominio ni odometro, se reconoce por numero de serie y mide horometro.
 */
function buildResourceFields(resource: WorkOrderResource): ResourceField[] {
  const equipment = resource.other_equipment;

  if (equipment) {
    const fields: ResourceField[] = [{ label: 'N° Serie', value: getResourceLabel(resource), strong: true }];
    if (equipment.sub_type?.name) fields.push({ label: 'Tipo', value: equipment.sub_type.name });
    if (equipment.intern_number) fields.push({ label: 'Int.', value: `#${equipment.intern_number}` });
    if (equipment.horometer != null) fields.push({ label: 'Hs', value: formatMeter(equipment.horometer) });
    return fields;
  }

  const vehicle = resource.vehicles;
  if (!vehicle) return [];

  const fields: ResourceField[] = [
    { label: 'Dominio', value: getResourceLabel(resource), strong: true },
    { label: 'Serie', value: vehicle.serie || '-' },
  ];
  if (vehicle.sub_type?.name) fields.push({ label: 'Tipo', value: vehicle.sub_type.name });
  if (vehicle.intern_number) fields.push({ label: 'Int.', value: `#${vehicle.intern_number}` });
  if (vehicle.kilometer) fields.push({ label: 'Km', value: formatMeter(vehicle.kilometer) });
  if (vehicle.engine_hours) fields.push({ label: 'Hs', value: formatMeter(vehicle.engine_hours) });
  return fields;
}

interface WorkOrderHeaderProps {
  orderNumber: string;
  maintenanceOrderNumber: string;
  status: string;
  priority: string | null;
  /** Prisma devuelve `Date` para las columnas de fecha; moment acepta las dos formas. */
  plannedStartDate: string | Date | null;
  resource: WorkOrderResource | null;
  completedCount: number;
  totalCount: number;
  onStart: () => void;
  isStarting: boolean;
  onPause?: () => void;
  isPausing?: boolean;
  onResume?: () => void;
  isResuming?: boolean;
  isBlockedByOtherSector?: boolean;
  blockedBySectorName?: string | null;
}

export function WorkOrderHeader({
  orderNumber,
  maintenanceOrderNumber,
  status,
  priority,
  plannedStartDate,
  resource,
  completedCount,
  totalCount,
  onStart,
  isStarting,
  onPause,
  isPausing,
  onResume,
  isResuming,
  isBlockedByOtherSector,
  blockedBySectorName,
}: WorkOrderHeaderProps) {
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const resourceFields = resource ? buildResourceFields(resource) : [];

  return (
    <div className="flex-none border-b bg-card">
      <div className="p-4 sm:p-5 space-y-3.5">
        {/* Row 1: Back + Title + Start */}
        <div className="flex items-center gap-3">
          <Link href="/operator/dashboard" aria-label="Volver a las órdenes de trabajo">
            <Button type="button" variant="ghost" size="icon" className="size-11 flex-shrink-0 rounded-xl" tabIndex={-1}>
              <ArrowLeft aria-hidden="true" className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate sm:text-xl tracking-tight">{orderNumber}</h1>
            <p className="text-sm text-muted-foreground font-mono">OM {maintenanceOrderNumber}</p>
          </div>
          {status === 'pending' && (
            <Button type="button" onClick={onStart} disabled={isStarting} size="default" className="gap-2 h-11 rounded-xl">
              <Play aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">Iniciar OT</span>
              <span className="sm:hidden">Iniciar</span>
            </Button>
          )}
          {status === 'in_progress' && onPause && (
            <Button
              type="button"
              onClick={onPause}
              disabled={isPausing}
              variant="outline"
              size="default"
              className="gap-2 h-11 rounded-xl"
            >
              <Pause aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">Pausar OT</span>
              <span className="sm:hidden">Pausar</span>
            </Button>
          )}
          {status === 'paused' && onResume && (
            <Button
              type="button"
              onClick={onResume}
              disabled={isResuming || isBlockedByOtherSector}
              size="default"
              className="gap-2 h-11 rounded-xl"
              title={
                isBlockedByOtherSector
                  ? `Bloqueada: ${blockedBySectorName || 'otro sector'} tiene una OT en progreso`
                  : undefined
              }
            >
              <Play aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">{isBlockedByOtherSector ? 'Bloqueada' : 'Reanudar OT'}</span>
              <span className="sm:hidden">{isBlockedByOtherSector ? 'Bloqueada' : 'Reanudar'}</span>
            </Button>
          )}
        </div>

        {/* Blocked banner */}
        {status === 'paused' && isBlockedByOtherSector && (
          <div role="status" className="flex items-center gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
            <Lock className="h-4 w-4 shrink-0" />
            <p className="text-sm font-medium">
              No se puede reanudar: el sector <span className="font-bold">{blockedBySectorName || 'otro sector'}</span>{' '}
              tiene una OT en progreso para esta orden de mantenimiento.
            </p>
          </div>
        )}

        {/* Paused banner */}
        {status === 'paused' && !isBlockedByOtherSector && (
          <div className="flex items-center gap-2.5 p-3 rounded-lg bg-warn-subtle border border-warn/30 text-warn-subtle-foreground">
            <Pause className="h-4 w-4 shrink-0" />
            <p className="text-sm font-medium">Orden de trabajo pausada. Reanude para poder completar tareas.</p>
          </div>
        )}

        {/* Row 2: barra de identificacion del recurso (vehiculo o equipamiento) */}
        {resourceFields.length > 0 && (
          <div className="flex items-center gap-3 text-sm bg-muted/50 rounded-lg px-3.5 py-2.5 overflow-x-auto">
            <Badge variant="outline" className="text-xs px-2 py-0.5 flex-shrink-0">
              {resource ? getResourceKindLabel(resource) : ''}
            </Badge>
            {resourceFields.map((field, index) => (
              <div key={field.label} className="flex items-center gap-3 flex-shrink-0">
                {index > 0 && <span className="text-muted-foreground/40">|</span>}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{field.label}</span>
                  <span className={field.strong ? 'font-bold' : 'font-semibold'}>{field.value}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Row 3: Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <MaintenanceStatusPill entity="workOrder" status={status} size="sm" />
          {priority && (
            <Badge variant={priorityVariants[priority] || 'default'} className="text-xs px-2 py-0.5">
              {priorityLabels[priority] || priority}
            </Badge>
          )}
          {plannedStartDate && (
            <Badge variant="outline" className="text-xs px-2 py-0.5 gap-1 tabular-nums">
              <Calendar aria-hidden="true" className="h-3 w-3" />
              {/* @db.Date: medianoche UTC; moment.utc evita que el día se corra en hora argentina */}
              {moment.utc(plannedStartDate).format('DD/MM/YYYY')}
            </Badge>
          )}
        </div>

        {/* Row 4: Progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">Progreso</span>
            <span className="font-bold tabular-nums">
              {completedCount}/{totalCount} tareas
            </span>
          </div>
          <Progress
            value={progressPercentage}
            className="h-2"
            aria-label={`Progreso de la orden de trabajo: ${completedCount} de ${totalCount} tareas`}
          />
        </div>
      </div>
    </div>
  );
}
