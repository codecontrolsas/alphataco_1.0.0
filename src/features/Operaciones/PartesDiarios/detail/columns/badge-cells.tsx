'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import { employeeDeviations, equipmentDeviations } from '../../lib/resource-deviations';
import { ResourceCell } from '../components/ResourceCell';
import type { DailyReportDetailRow } from '../types';
import { buildEmployeeLabel, buildRowDescription } from './helpers';
import type { DeviationGetters } from './types';

// ============================================================================
// EMPLOYEE BADGE CELL (with RPC deviation data)
// ============================================================================

export function renderEmployeeBadge(
  employeeId: string,
  label: string,
  rowId: string,
  deviations: DeviationGetters,
  key: string
): React.ReactNode {
  if (deviations.loadingValidations) {
    return (
      <Badge
        key={key}
        variant="secondary"
        className="text-xs font-normal bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-default"
      >
        {label}
      </Badge>
    );
  }

  const dev = deviations.getEmployeeDeviation(employeeId, rowId);

  if (!dev) {
    // Sin desviaciones — badge default (sólido, igual que prod)
    return (
      <TooltipProvider key={key} delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="default" className="text-xs font-normal select-none text-nowrap cursor-default">
              {label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="bg-black text-white rounded-lg p-2">
            <p className="text-xs">Empleado asignado correctamente</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Desvíos (aditivos: un empleado puede tener varios a la vez) — fuente única de la regla
  // en `lib/resource-deviations.ts` (misma semántica que el SQL `get_daily_report_deviations`).
  const devEntries = employeeDeviations(dev);
  const messages = devEntries.map((entry) => entry.label);
  const kinds = new Set(devEntries.map((entry) => entry.kind));

  // Determinar color según prioridad
  const badgeClass = kinds.has('duplicated')
    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950 dark:border-orange-400'
    : kinds.has('unassigned_to_client') && kinds.has('no_diagram')
      ? 'border-purple-500 bg-purple-50 dark:bg-purple-950 dark:border-purple-400'
      : kinds.has('unassigned_to_client')
        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 dark:border-blue-400'
        : kinds.has('no_diagram')
          ? 'border-red-500 bg-red-50 dark:bg-red-950 dark:border-red-400'
          : kinds.has('non_work_day')
            ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-400'
            : 'dark:text-black';

  return (
    <TooltipProvider key={key} delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn('text-xs font-normal cursor-default', badgeClass)}>
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white rounded-lg p-2 max-w-xs">
          {messages.map((msg, i) => (
            <p key={i} className="text-xs">
              {msg}
            </p>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function EmployeeBadgeCell({ row, deviations }: { row: DailyReportDetailRow; deviations: DeviationGetters }) {
  const relations = row.dailyreportemployeerelations;

  if (!relations || relations.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const items = relations
    .filter((rel) => Boolean(rel.employees))
    .map((rel) =>
      renderEmployeeBadge(
        rel.employee_id ?? '',
        buildEmployeeLabel(rel.employees!),
        row.id,
        deviations,
        rel.employee_id ?? rel.id
      )
    );

  return (
    <ResourceCell items={items} title="Empleados" buttonLabel="Ver empleados" description={buildRowDescription(row)} />
  );
}

// ============================================================================
// EQUIPMENT BADGE CELL (with RPC deviation data)
// ============================================================================

/**
 * Un equipo del parte puede ser un vehiculo o un "otro equipo" (pileta,
 * contenedor): la relacion es polimorfica y ambos tienen los mismos desvios.
 */
export function renderEquipmentBadge(
  equipmentId: string,
  label: string,
  rowId: string,
  deviations: DeviationGetters,
  key: string
): React.ReactNode {
  if (deviations.loadingValidations) {
    return (
      <Badge
        key={key}
        variant="secondary"
        className="text-xs font-normal bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-default"
      >
        {label}
      </Badge>
    );
  }

  const dev = deviations.getEquipmentDeviation(equipmentId, rowId);

  if (!dev) {
    // Sin desviaciones — badge default (sólido, igual que prod)
    return (
      <TooltipProvider key={key} delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="default" className="text-xs font-normal select-none text-nowrap cursor-default">
              {label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="bg-black text-white rounded-lg p-2">
            <p className="text-xs">Equipo asignado correctamente</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Desvíos (aditivos: un equipo puede tener varios a la vez) — fuente única de la regla en
  // `lib/resource-deviations.ts` (misma semántica que el SQL `get_daily_report_deviations`).
  const devEntries = equipmentDeviations(dev);
  const tooltipMessages = devEntries.map((entry) => entry.label);
  const kinds = new Set(devEntries.map((entry) => entry.kind));

  // Determinar color según prioridad y condición
  const badgeClass = kinds.has('duplicated')
    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950 dark:border-orange-400'
    : kinds.has('not_operative')
      ? 'border-red-500 bg-red-50 dark:bg-red-950 dark:border-red-400'
      : kinds.has('under_repair')
        ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-400'
        : kinds.has('unassigned_to_client')
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 dark:border-blue-400'
          : kinds.has('conditioned')
            ? 'border-sky-500 bg-sky-50 dark:bg-sky-950 dark:border-sky-400'
            : kinds.has('in_preparation')
              ? 'border-gray-400 bg-transparent'
              : 'dark:text-black';

  if (tooltipMessages.length === 0) {
    return (
      <Badge key={key} variant="outline" className={cn('text-xs font-normal dark:text-black', badgeClass)}>
        <AlertTriangle className="h-3 w-3 mr-1" />
        {label}
      </Badge>
    );
  }

  return (
    <TooltipProvider key={key} delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn('text-xs font-normal cursor-default', badgeClass)}>
            <AlertTriangle className="h-3 w-3 mr-1" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white rounded-lg p-2 max-w-xs">
          {tooltipMessages.map((msg, i) => (
            <p key={i} className="text-xs">
              {msg}
            </p>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function EquipmentBadgeCell({ row, deviations }: { row: DailyReportDetailRow; deviations: DeviationGetters }) {
  const relations = row.dailyreportequipmentrelations;

  if (!relations || relations.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const items = relations
    .map((rel) => {
      if (rel.vehicles) {
        const v = rel.vehicles;
        const label = `${v.domain ?? v.intern_number ?? 'Equipo'}${v.brand_vehicles?.name ? ` — ${v.brand_vehicles.name}` : ''}`;
        return renderEquipmentBadge(rel.equipment_id ?? '', label, row.id, deviations, rel.id);
      }

      if (rel.other_equipment) {
        // Los otros equipos no tienen patente: se los identifica por interno o serie
        const o = rel.other_equipment;
        const label = o.intern_number ?? o.serial_number ?? 'Equipo';
        return renderEquipmentBadge(rel.other_equipment_id ?? '', label, row.id, deviations, rel.id);
      }

      return null;
    })
    .filter((node): node is NonNullable<React.ReactNode> => node !== null);

  return (
    <ResourceCell items={items} title="Equipos" buttonLabel="Ver equipos" description={buildRowDescription(row)} />
  );
}

// ============================================================================
// CUSTOMER EQUIPMENT BADGE CELL
// ============================================================================

export function CustomerEquipmentBadgeCell({ row }: { row: DailyReportDetailRow }) {
  const relations = row.dailyreport_customer_equipment_relations;

  if (!relations || relations.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const items = relations.map((rel) => (
    <Badge key={rel.id} variant="default" className="select-none text-nowrap text-xs">
      {rel.equipos_clientes?.name}
      {rel.equipos_clientes?.type ? ` (${rel.equipos_clientes.type})` : ''}
    </Badge>
  ));

  return (
    <ResourceCell
      items={items}
      title="Equipos del cliente"
      buttonLabel="Ver equipos"
      description={buildRowDescription(row)}
    />
  );
}
