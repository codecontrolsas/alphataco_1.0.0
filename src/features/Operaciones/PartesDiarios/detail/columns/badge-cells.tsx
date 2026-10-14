'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import { employeeDeviations, equipmentDeviations } from '../../lib/resource-deviations';
import { ResourceCell } from '../components/ResourceCell';
import type { DailyReportDetailRow } from '../types';
import { DEVIATION_BADGE_CLASSES, type DeviationTone } from './deviation-styles';
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
        className="text-muted-foreground cursor-default text-xs font-normal"
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
          <TooltipContent>
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
  const tone: DeviationTone | null = kinds.has('duplicated')
    ? 'orange'
    : kinds.has('unassigned_to_client') && kinds.has('no_diagram')
      ? 'purple'
      : kinds.has('unassigned_to_client')
        ? 'blue'
        : kinds.has('no_diagram')
          ? 'red'
          : kinds.has('non_work_day')
            ? 'yellow'
            : null;
  const badgeClass = tone ? DEVIATION_BADGE_CLASSES[tone] : '';

  return (
    <TooltipProvider key={key} delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn('text-xs font-normal cursor-default', badgeClass)}>
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
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
    return <span className="text-muted-foreground">-</span>;
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
        className="text-muted-foreground cursor-default text-xs font-normal"
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
          <TooltipContent>
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
  const tone: DeviationTone | null = kinds.has('duplicated')
    ? 'orange'
    : kinds.has('not_operative')
      ? 'red'
      : kinds.has('under_repair')
        ? 'yellow'
        : kinds.has('unassigned_to_client')
          ? 'blue'
          : kinds.has('conditioned')
            ? 'sky'
            : kinds.has('in_preparation')
              ? 'gray'
              : null;
  const badgeClass = tone ? DEVIATION_BADGE_CLASSES[tone] : '';

  if (tooltipMessages.length === 0) {
    return (
      <Badge key={key} variant="outline" className={cn('text-xs font-normal', badgeClass)}>
        <AlertTriangle aria-hidden="true" />
        {label}
      </Badge>
    );
  }

  return (
    <TooltipProvider key={key} delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn('text-xs font-normal cursor-default', badgeClass)}>
            <AlertTriangle aria-hidden="true" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
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
    return <span className="text-muted-foreground">-</span>;
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
    return <span className="text-muted-foreground">-</span>;
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
