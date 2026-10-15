'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SheetClose, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { buildOrderStages } from '@/features/Mantenimiento/lib/order-stages';
import { MaintenanceStatusPill } from '@/features/Mantenimiento/shared/components/MaintenanceStatusPill';
import { ResourceCell, toResourceCellResource } from '@/features/Mantenimiento/shared/components/ResourceCell';
import { StageBar } from '@/features/Mantenimiento/shared/components/StageBar';
import {
  getResourceCondition,
  getResourceKindLabel,
} from '@/features/Mantenimiento/shared/maintenance-resource';
import {
  PREVENTIVE_TYPES,
  PREVENTIVE_TYPE_ICONS,
  type PreventiveType,
} from '@/features/Mantenimiento/shared/preventive-maintenance';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { X } from 'lucide-react';
import type { MaintenanceOrderData } from '../../actions/queries.server';

const SOURCE_LABELS: Record<string, string> = {
  checklist: 'Checklist',
  preventive: 'Preventivo',
};

/** El km al ingreso se guarda como texto: se agrupa en miles solo si es un número. */
function formatKilometers(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString('es-AR') : value;
}

function KeyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 p-3 sm:p-4">
      <dt className="text-muted-foreground text-xs sm:text-sm">{label}</dt>
      <dd className="font-mono text-base font-semibold tabular-nums sm:text-xl">{value}</dd>
    </div>
  );
}

interface OrderDetailHeaderProps {
  order: MaintenanceOrderData;
  /** Título del panel: "Detalle de Orden" o "Validación de Jefe de Taller". */
  panelTitle: string;
}

/** Cabecera del panel: recurso, N° Orden, estado, condición, barra de etapas y datos clave. */
export function OrderDetailHeader({ order, panelTitle }: OrderDetailHeaderProps) {
  const vehicle = order.vehicles;
  const subtitle = vehicle?.vehicle_type?.name ?? getResourceKindLabel(order);
  const condition = getResourceCondition(order);
  const isInoperative = condition === 'no_operativo';

  const request = !Array.isArray(order.maintenance_requests) ? order.maintenance_requests : null;
  const description = order.description ?? request?.description ?? null;
  const preventiveKey = (order.source === 'preventive' ? request?.preventive_type : undefined) as
    | PreventiveType
    | undefined;
  const PreventiveIcon = preventiveKey ? PREVENTIVE_TYPE_ICONS[preventiveKey] : undefined;

  const stages = buildOrderStages({ ...order, maintenance_requests: request });
  const daysInWorkshop = stages.find((stage) => stage.key === 'workshop')?.meta;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <SheetDescription className="text-xs">{panelTitle}</SheetDescription>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <ResourceCell resource={toResourceCellResource(order, subtitle)} />
            <SheetTitle className="min-w-0 text-base leading-snug break-words sm:text-lg">
              {order.order_number ? (
                <span className="font-mono">{order.order_number}</span>
              ) : (
                <span className="text-muted-foreground font-normal">Se asigna al ingresar</span>
              )}
              {description && <span className="font-normal"> · {description}</span>}
            </SheetTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MaintenanceStatusPill entity="order" status={order.status} />
            {condition && (
              <Badge variant={isInoperative ? 'destructive' : 'secondary'} className="capitalize">
                {condition.replace(/_/g, ' ')}
              </Badge>
            )}
            {order.source && (
              <span className="text-muted-foreground text-sm">
                Origen: {SOURCE_LABELS[order.source] ?? 'Manual'}
              </span>
            )}
            {preventiveKey && PREVENTIVE_TYPES[preventiveKey] && (
              <Badge variant="secondary" className="gap-1">
                {PreventiveIcon && <PreventiveIcon aria-hidden="true" className="h-3 w-3" />}
                {PREVENTIVE_TYPES[preventiveKey]}
              </Badge>
            )}
          </div>
        </div>
        <SheetClose asChild>
          <Button type="button" variant="outline" size="icon" aria-label="Cerrar detalle de la orden">
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </SheetClose>
      </div>

      <StageBar stages={stages} />

      <dl className="divide-y overflow-hidden rounded-lg border sm:grid sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <KeyFact
          label="Ingreso a taller"
          value={order.workshop_entry_date ? formatArgentinaDay(order.workshop_entry_date) : '—'}
        />
        <KeyFact
          label="Km al ingreso"
          value={formatKilometers(order.kilometer_at_entry)}
        />
        <KeyFact
          label="Horómetro"
          value={order.engine_hours_at_entry != null ? `${order.engine_hours_at_entry} hs` : '—'}
        />
        <KeyFact label="Días en taller" value={daysInWorkshop ? daysInWorkshop.split(' ')[0]! : '—'} />
      </dl>
    </div>
  );
}
