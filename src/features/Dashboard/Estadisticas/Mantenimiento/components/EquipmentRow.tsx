'use client';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, PackageCheck, Truck, Wrench, XCircle, type LucideIcon } from 'lucide-react';
import type { MaintenanceVehicle, VehicleStatus } from '../types';

interface EquipmentRowProps {
  vehicle: MaintenanceVehicle;
  daysElapsed: number;
}

// ─── Visual mapping de estados ─────────────────────────────────────────────
// Cada estado tiene una "ficha" completa: label, icono, y un set de clases
// para el chip (background tenue + texto fuerte) y para el borde lateral.
type StatusVisual = {
  label: string;
  Icon: LucideIcon;
  chip: string;
  border: string;
  iconColor: string;
};

const STATUS_VISUALS: Record<VehicleStatus, StatusVisual> = {
  operativo: {
    label: 'Operativo',
    Icon: CheckCircle2,
    chip: 'bg-[color-mix(in_oklab,var(--dash-ok)_12%,transparent)] text-foreground border-[color-mix(in_oklab,var(--dash-ok)_40%,transparent)]',
    border: 'border-l-[var(--dash-ok)]',
    iconColor: 'text-[var(--dash-ok)]',
  },
  operativo_condicionado: {
    label: 'Op. condicionado',
    Icon: AlertTriangle,
    chip: 'bg-[color-mix(in_oklab,var(--dash-warn)_12%,transparent)] text-foreground border-[color-mix(in_oklab,var(--dash-warn)_40%,transparent)]',
    border: 'border-l-[var(--dash-warn)]',
    iconColor: 'text-[var(--dash-warn)]',
  },
  en_preparacion: {
    label: 'En preparación',
    Icon: PackageCheck,
    chip: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-900',
    border: 'border-l-sky-500',
    iconColor: 'text-sky-600 dark:text-sky-400',
  },
  no_operativo: {
    label: 'No operativo',
    Icon: XCircle,
    chip: 'bg-[color-mix(in_oklab,var(--dash-danger)_12%,transparent)] text-foreground border-[color-mix(in_oklab,var(--dash-danger)_40%,transparent)]',
    border: 'border-l-[var(--dash-danger)]',
    iconColor: 'text-[var(--dash-danger)]',
  },
  en_reparacion: {
    label: 'En reparación',
    Icon: Wrench,
    chip: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-900',
    border: 'border-l-indigo-500',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
  },
};

/**
 * Color del indicador de la barra de progreso. Para vehiculos no operativos
 * usamos gris porque la "no utilizacion" no es un problema de uso sino de
 * disponibilidad — no tiene sentido mostrar un rojo de "bajo uso".
 */
function getProgressIndicatorClass(workedDays: number, daysElapsed: number, status: VehicleStatus): string {
  if (daysElapsed === 0) return '[&>[data-slot=progress-indicator]]:bg-muted-foreground/30';
  if (status !== 'operativo' && status !== 'operativo_condicionado') {
    return '[&>[data-slot=progress-indicator]]:bg-muted-foreground/40';
  }
  const ratio = workedDays / daysElapsed;
  if (ratio >= 0.7) return '[&>[data-slot=progress-indicator]]:bg-[var(--dash-ok)]';
  if (ratio >= 0.3) return '[&>[data-slot=progress-indicator]]:bg-[var(--dash-warn)]';
  return '[&>[data-slot=progress-indicator]]:bg-[var(--dash-danger)]';
}

export function EquipmentRow({ vehicle, daysElapsed }: EquipmentRowProps) {
  const ratio = daysElapsed > 0 ? Math.min(100, (vehicle.workedDays / daysElapsed) * 100) : 0;
  const indicatorClass = getProgressIndicatorClass(vehicle.workedDays, daysElapsed, vehicle.status);
  const displayName = vehicle.domain ?? 'Sin patente';
  const subtitle = [vehicle.brand, vehicle.model].filter(Boolean).join(' ');
  const visual = STATUS_VISUALS[vehicle.status];
  const StatusIcon = visual.Icon;
  const { workflows } = vehicle;

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'group flex items-center gap-4 px-6 py-3 border-b last:border-b-0 border-l-4 border-l-transparent',
          'transition-colors hover:bg-muted/40',
          visual.border
        )}
      >
        {/* Truck icon — sin dot, el borde lateral ya da el codigo de color */}
        <div className="h-10 w-10 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 group-hover:bg-muted">
          <Truck className="h-4.5 w-4.5 text-muted-foreground" />
        </div>

        {/* Info column: nombre, tipo, subtipo, brand/model, workflow badge */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold tabular-nums tracking-wide">{displayName}</span>
            {vehicle.typeName && (
              <Badge variant="outline" className="text-[10px] font-normal py-0 px-1.5">
                {vehicle.typeName}
              </Badge>
            )}
            {vehicle.subTypeName && (
              <Badge variant="secondary" className="text-[10px] font-normal py-0 px-1.5">
                {vehicle.subTypeName}
              </Badge>
            )}
            {workflows.total > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-normal py-0 px-1.5 gap-1 border-[color-mix(in_oklab,var(--dash-warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--dash-warn)_12%,transparent)] text-foreground cursor-default"
                  >
                    <Wrench className="h-2.5 w-2.5" />
                    {workflows.total}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px]">
                  <p className="font-semibold mb-1">
                    {workflows.total} proceso{workflows.total === 1 ? '' : 's'} abierto
                    {workflows.total === 1 ? '' : 's'}
                  </p>
                  <ul className="space-y-0.5 text-xs">
                    {workflows.requests > 0 && (
                      <li>
                        · {workflows.requests} solicitud{workflows.requests === 1 ? '' : 'es'} de mantenimiento
                      </li>
                    )}
                    {workflows.orders > 0 && (
                      <li>
                        · {workflows.orders} orden{workflows.orders === 1 ? '' : 'es'} de mantenimiento
                      </li>
                    )}
                    {workflows.workOrders > 0 && (
                      <li>
                        · {workflows.workOrders} orden{workflows.workOrders === 1 ? '' : 'es'} de trabajo
                      </li>
                    )}
                  </ul>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>}
        </div>

        {/* Status chip — slot dedicado, ancho fijo para alinear verticalmente entre filas */}
        <div className="hidden md:flex w-[170px] shrink-0 justify-center">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
              visual.chip
            )}
          >
            <StatusIcon className={cn('h-3.5 w-3.5 shrink-0', visual.iconColor)} />
            <span className="whitespace-nowrap">{visual.label}</span>
          </span>
        </div>

        {/* Mobile: solo el icono coloreado en una caja minima (el chip completo no entra) */}
        <div className="md:hidden shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn('inline-flex h-7 w-7 items-center justify-center rounded-full border', visual.chip)}
                aria-label={visual.label}
              >
                <StatusIcon className={cn('h-3.5 w-3.5', visual.iconColor)} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">{visual.label}</TooltipContent>
          </Tooltip>
        </div>

        {/* Progress bar */}
        <div className="hidden sm:flex items-center gap-2 w-[180px] shrink-0">
          <Progress
            value={ratio}
            className={cn('h-2', indicatorClass)}
            aria-label={`Días trabajados de ${displayName}: ${Math.min(vehicle.workedDays, daysElapsed)} de ${daysElapsed}`}
          />
        </div>

        {/* Days count */}
        <div className="text-right shrink-0 w-[88px]">
          <span className="text-sm font-semibold tabular-nums">
            {/* Cap visual: si el equipo aparece en reports con fecha futura del mes en curso,
                workedDays puede exceder daysElapsed. Mostramos min para no confundir. */}
            {Math.min(vehicle.workedDays, daysElapsed)}
            <span className="text-muted-foreground font-normal"> / {daysElapsed}</span>
          </span>
          <p className="text-[10px] text-muted-foreground">días</p>
        </div>
      </div>
    </TooltipProvider>
  );
}
