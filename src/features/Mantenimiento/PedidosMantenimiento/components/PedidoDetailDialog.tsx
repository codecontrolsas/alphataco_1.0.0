'use client';

import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ItemComments } from '@/features/Mantenimiento/components/ItemComments';
import { MaintenanceStatusPill } from '@/features/Mantenimiento/shared/components/MaintenanceStatusPill';
import { RepairGroupBadge } from '@/features/Mantenimiento/shared/components/RepairGroupBadge';
import { RepairItemPhotos } from '@/features/Mantenimiento/shared/components/RepairItemPhotos';
import { PREVENTIVE_TYPES, type PreventiveType } from '@/features/Mantenimiento/shared/preventive-maintenance';
import { formatDateOnly, formatDateTime } from '@/features/Mantenimiento/utils/dateFormat';
import { AlertTriangle, Calendar, Clock, Gauge, Package, Truck } from 'lucide-react';
import {
  getResourceInternNumber,
  getResourceKind,
  getResourceKindLabel,
  getResourceLabel,
} from '../../shared/maintenance-resource';
import { getRepairItemGroupName, getRepairItemImages, getRepairItemLabel } from '../../shared/repair-item-label';
import type { MaintenanceOrderData } from '../actions/actionsServer';

interface PedidoDetailDialogProps {
  order: MaintenanceOrderData;
  open: boolean;
  onClose: () => void;
}

function formatSectionCode(code: string | null | undefined): string {
  if (!code) return '-';
  return code
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function PedidoDetailDialog({ order, open, onClose }: PedidoDetailDialogProps) {
  // Ticket 596: el pedido puede ser de un vehiculo o de un equipamiento —
  // leer `vehicles.domain` a secas mostraba "Sin identificar" en los equipamientos.
  const isOtherEquipment = getResourceKind(order) === 'other_equipment';
  const resourceLabel = getResourceLabel(order);
  const resourceKindLabel = getResourceKindLabel(order);
  const internNumber = getResourceInternNumber(order);
  const ResourceIcon = isOtherEquipment ? Package : Truck;
  const itemCount = order.maintenance_order_items?.length ?? 0;
  const description = order.description ?? order.maintenance_requests?.description ?? null;

  // Un equipamiento no lleva kilometraje; sus horas de uso viven en `horometer`.
  const kilometer = isOtherEquipment ? null : order.vehicles?.kilometer ?? order.maintenance_requests?.kilometer;
  const engineHours =
    order.other_equipment?.horometer ?? order.vehicles?.engine_hours ?? order.maintenance_requests?.engine_hours;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" aria-describedby={undefined} className="w-full gap-0 overflow-hidden p-0 sm:max-w-[920px]">
        {/*
          Ticket 676: el modal no scrolleaba. Antes solo la lista de items tenia
          su propio ScrollArea: si el pedido no tenia items (o el encabezado era
          alto) el contenido se recortaba contra el `overflow-hidden` y no habia
          forma de llegar al final salvo haciendo zoom out.
          Ahora hay un unico contenedor scrolleable con TODO el contenido: nunca
          queda contenido fuera de alcance, en ninguna resolucion.
        */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* ── Header compacto ──────────────────────────────────────────── */}
          <div className="px-6 pt-6 pb-4 space-y-3">
            <SheetHeader className="space-y-1 p-0 pr-10">
              <div className="flex items-center gap-2">
                <MaintenanceStatusPill entity="order" status={order.status} />
                <SheetTitle className="text-base">
                  {order.order_number ? `Pedido #${order.order_number}` : 'Pedido de Mantenimiento'}
                </SheetTitle>
              </div>
              <SheetDescription className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1">
                  <ResourceIcon className="h-3 w-3" />
                  <span className="text-muted-foreground">{resourceKindLabel}</span>
                  {resourceLabel}
                  {internNumber && <span className="text-muted-foreground">(#{internNumber})</span>}
                </span>
                <span className="text-muted-foreground">·</span>
                <span>Creado {formatDateTime(order.created_at)}</span>
              </SheetDescription>
            </SheetHeader>

            {/* ── Datos clave (fila horizontal) ───────────────────────────── */}
            {(order.scheduled_date || kilometer || engineHours) && (
              <div className="flex flex-wrap gap-4 text-sm">
                {order.scheduled_date && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      Planificado:{' '}
                      <span className="text-foreground font-medium">{formatDateOnly(order.scheduled_date)}</span>
                    </span>
                  </div>
                )}
                {kilometer && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Gauge className="h-3.5 w-3.5" />
                    <span className="text-foreground font-medium">{Number(kilometer).toLocaleString('es-AR')} km</span>
                  </div>
                )}
                {engineHours && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-foreground font-medium">
                      {Number(engineHours).toLocaleString('es-AR')} hs
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── Alert de reprogramación ──────────────────────────────── */}
            {order.date_rejection_reason && (
              <div className="bg-warn-subtle border-warn/40 rounded-md border p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-warn mt-0.5 shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-warn-subtle-foreground">
                      Motivo de reprogramación
                    </span>
                    <p className="text-sm text-warn-subtle-foreground mt-0.5">{order.date_rejection_reason}</p>
                    {order.date_rejected_at && (
                      <p className="text-xs text-warn-subtle-foreground mt-1">
                        Rechazado el {formatDateTime(order.date_rejected_at)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* ── Descripción del pedido ──────────────────────────────────── */}
          {description && (
            <>
              <div className="px-6 pt-3 pb-1">
                <h3 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">Descripción</h3>
              </div>
              <div className="px-6 pb-3">
                <p className="text-sm whitespace-pre-wrap break-words">{description}</p>
              </div>
              <Separator />
            </>
          )}

          {/* ── Tipo de mantenimiento (solo preventivo) ─────────────────── */}
          {order.maintenance_requests?.source === 'preventive' && (
            <>
              <div className="px-6 pt-3 pb-1">
                <h3 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
                  Tipo de mantenimiento
                </h3>
              </div>
              <div className="px-6 pb-3">
                <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium text-sm">Mantenimiento Preventivo</h4>
                  <Badge variant="secondary">
                    {PREVENTIVE_TYPES[order.maintenance_requests?.preventive_type as PreventiveType] ??
                      order.maintenance_requests?.preventive_type ??
                      'Preventivo'}
                  </Badge>
                </div>
              </div>
            </>
          )}

          {/* ── Items / Necesidades — siempre que existan ────────────────── */}
          {itemCount > 0 && (
            <>
              <div className="px-6 pt-3 pb-1">
                <h3 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
                  {order.maintenance_requests?.source === 'preventive' ? 'Necesidades' : 'Items a reparar'}
                  <span className="ml-1.5 text-xs font-normal normal-case">({itemCount})</span>
                </h3>
              </div>

              {/* Sin ScrollArea propio: el scroll es unico y vive en el contenedor
                  de arriba. Anidar dos areas scrolleables era justo lo que dejaba
                  el contenido inalcanzable. */}
              <div className="px-6 pb-6 space-y-3">
                {order.maintenance_order_items?.map((item, index) => {
                  const pivotRepairTypes = item.maintenance_order_item_repair_types ?? [];
                  const repairTypeNames: string[] =
                    pivotRepairTypes.length > 0
                      ? pivotRepairTypes.map((rt) => rt.types_of_repairs?.name).filter((n): n is string => Boolean(n))
                      : item.types_of_repairs?.name
                        ? [item.types_of_repairs.name]
                        : [];

                  // Ticket 592: el item puede venir de un checklist o de una carga
                  // manual (texto libre / tarea del listado) — el helper resuelve los tres casos.
                  const itemLabel = getRepairItemLabel(item, 'Sin título');
                  const sectionCode = item.maintenance_request_items?.checklist_deviations?.section_code;
                  const itemImages = getRepairItemImages(item);

                  return (
                    <div key={item.id} className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="text-xs font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0 mt-0.5">
                            #{index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium leading-snug">{itemLabel}</p>
                            <RepairGroupBadge groupName={getRepairItemGroupName(item)} className="mt-1" />
                            {sectionCode && (
                              <p className="text-xs text-muted-foreground mt-0.5">{formatSectionCode(sectionCode)}</p>
                            )}
                          </div>
                        </div>
                        {repairTypeNames.length > 0 && (
                          <div className="flex flex-wrap gap-1 justify-end shrink-0">
                            {repairTypeNames.map((name, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <ItemComments
                        item={item}
                        source={order.maintenance_requests?.source}
                        fallbackAuthorName={
                          order.maintenance_requests?.profile_maintenance_requests_supervisor_idToprofile?.fullname
                        }
                      />

                      {/* Ticket 592: las fotos son el contexto que el taller necesita para dimensionar el trabajo */}
                      <RepairItemPhotos images={itemImages} label={itemLabel} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
