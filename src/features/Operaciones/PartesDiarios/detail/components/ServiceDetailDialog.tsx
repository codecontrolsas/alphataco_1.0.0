'use client';

import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  dailyReportRowStatusLabels,
  dailyReportRowStatusTones,
  dailyReportTypeServiceLabels,
} from '@/shared/utils/mappers';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Building2, ExternalLink, FileText, Mail, Phone, User, Wrench } from 'lucide-react';
import Link from 'next/link';
import { DetailField as Field, EmptyValue } from '@/features/Operaciones/shared/components/DetailField';
import { DetailSkeleton } from '@/features/Operaciones/shared/components/DetailSkeleton';
import { remitNumbersOf } from '../../remitManager/lib/remit-numbers';
import { formatRowTime } from '../columns/helpers';
import { DETAIL_QUERY_PREFIX } from '../constants';
import { getDailyReportRowDetail } from '../form-data/row-detail.server';
import { useRestoreFocus } from './hooks/useRestoreFocus';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowId: string | null;
}

// ============================================================================
// CONDITION LABELS
// ============================================================================

// TODO: reemplazar por el mapa compartido de `PartesDiarios/lib/equipment-condition.ts` cuando exista.
const conditionLabels: Record<string, string> = {
  operativo: 'Operativo',
  no_operativo: 'No operativo',
  en_reparacion: 'En reparación',
};

const conditionVariants: Record<string, string> = {
  operativo: 'success',
  no_operativo: 'destructive',
  en_reparacion: 'yellow',
};

// ============================================================================
// COMPONENT
// ============================================================================

export function ServiceDetailDialog({ open, onOpenChange, rowId }: Props) {
  const { onOpenAutoFocus, onCloseAutoFocus } = useRestoreFocus();
  // Fetch enriched data on-demand when dialog opens. Cuelga del prefijo del detalle: `invalidateDetail()` lo refresca.
  const { data: row, isLoading } = useQuery({
    queryKey: [DETAIL_QUERY_PREFIX, 'row-detail', rowId],
    queryFn: () => getDailyReportRowDetail(rowId!),
    enabled: open && rowId !== null,
    staleTime: 30_000,
  });

  if (!rowId) return null;

  const remitNumbers = row ? remitNumbersOf(row) : [];
  const statusLabel = row?.status ? dailyReportRowStatusLabels[row.status] ?? row.status : null;
  const statusVariant = row?.status ? dailyReportRowStatusTones[row.status] ?? 'default' : 'default';
  const typeServiceLabel = row?.type_service
    ? dailyReportTypeServiceLabels[row.type_service] ?? row.type_service
    : null;

  const employees = row?.dailyreportemployeerelations ?? [];
  const equipmentRelations = row?.dailyreportequipmentrelations ?? [];
  const customerEquipmentRelations = row?.dailyreport_customer_equipment_relations ?? [];

  // Columna `Time`: se lee en UTC, igual que la tabla (`formatRowTime`).
  const formatTime = formatRowTime;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>Detalle del Servicio</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <DetailSkeleton />
        ) : !row ? (
          <p className="text-sm text-muted-foreground">No se encontró el registro.</p>
        ) : (
          <div className="space-y-6">
            {/* Preparte section — only when linked */}
            {row.preparte?.numero_pedido && (
              <>
                <div className="rounded-md border border-warn/40 bg-warn-subtle text-warn-subtle-foreground p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">Pedido vinculado:</span>
                    <Link
                      href="/dashboard/operations?tab=preparte"
                      className="text-warn-subtle-foreground underline-offset-2 hover:underline font-semibold inline-flex items-center gap-1"
                    >
                      {row.preparte.numero_pedido}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Información principal */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Cliente">{row.customers?.name ?? <EmptyValue />}</Field>
              <Field label="Servicio">{row.customer_services?.service_name ?? <EmptyValue />}</Field>
              <Field label="Ítem">{row.service_items?.item_name ?? <EmptyValue />}</Field>
              {row.service_items?.item_description && (
                <Field label="Descripción del ítem">
                  <p className="text-sm">{row.service_items.item_description}</p>
                </Field>
              )}
              <Field label="Sector">{row.service_sectors?.sectors?.name ?? <EmptyValue />}</Field>
              <Field label="Área">{row.service_areas?.areas_cliente?.descripcion_corta ?? <EmptyValue />}</Field>
            </div>

            <Separator />

            {/* Detalles de jornada y estado */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Jornada">{row.working_day ?? <EmptyValue />}</Field>
              <Field label="Turno">
                {row.shift_12h ? (
                  <Badge variant="outline">{row.shift_12h === 'noche' ? 'Noche' : 'Día'}</Badge>
                ) : (
                  <EmptyValue />
                )}
              </Field>
              <Field label="Horario inicio">{formatTime(row.start_time) ?? <EmptyValue />}</Field>
              <Field label="Horario fin">{formatTime(row.end_time) ?? <EmptyValue />}</Field>
              <Field label="Estado">
                {statusLabel ? (
                  <Badge variant={statusVariant}>{statusLabel}</Badge>
                ) : (
                  <EmptyValue />
                )}
              </Field>
              <Field label="Tipo servicio">
                {typeServiceLabel ? <Badge variant="outline">{typeServiceLabel}</Badge> : <EmptyValue />}
              </Field>
              <Field label="Remitos">
                {remitNumbers.length > 0 ? (
                  <span className="font-mono tabular-nums">{remitNumbers.join(', ')}</span>
                ) : (
                  <EmptyValue />
                )}
              </Field>
            </div>

            {/* Descripción */}
            {row.description && (
              <>
                <Separator />
                <Field label="Descripción">
                  <p className="text-sm whitespace-pre-wrap">{row.description}</p>
                </Field>
              </>
            )}

            <Separator />

            {/* Empleados — tarjetas detalladas con legajo, CUIL, email, teléfono, cargo */}
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Empleados ({employees.length})
              </h4>
              {employees.length === 0 ? (
                <EmptyValue />
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {employees.map((rel) => {
                    const emp = rel.employees;
                    if (!emp) return null;
                    const fullName = `${emp.lastname ?? ''} ${emp.firstname ?? ''}`.trim();

                    return (
                      <div key={rel.id} className="rounded-md border p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <Link
                            href={`/dashboard/employee/${emp.id}`}
                            className="font-medium text-brand-ink hover:underline inline-flex items-center gap-1"
                          >
                            [{emp.file ?? '?'}] {fullName}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                          {rel.role && (
                            <Badge variant="secondary" className="text-xs capitalize">
                              {rel.role.replace(/_/g, ' ')}
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                          {emp.cuil && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" /> CUIL: {emp.cuil}
                            </span>
                          )}
                          {emp.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {emp.phone}
                            </span>
                          )}
                          {emp.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {emp.email}
                            </span>
                          )}
                          {emp.hierarchy?.name && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" /> {emp.hierarchy.name}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Separator />

            {/* Equipos propios — tarjetas detalladas con tipo, año, marca, modelo, condición */}
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5" />
                Equipos ({equipmentRelations.length})
              </h4>
              {equipmentRelations.length === 0 ? (
                <EmptyValue />
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {equipmentRelations.map((rel) => {
                    if (rel.vehicles) {
                      const v = rel.vehicles;
                      const label = v.domain ?? v.intern_number ?? 'Vehículo';
                      const condLabel = v.condition ? conditionLabels[v.condition] ?? v.condition : null;
                      const condVariant = v.condition ? conditionVariants[v.condition] ?? 'default' : 'default';

                      return (
                        <div key={rel.id} className="rounded-md border p-3 text-sm space-y-1">
                          <div className="flex items-center justify-between">
                            <Link
                              href={`/dashboard/equipment/${v.id}`}
                              className="font-medium text-brand-ink hover:underline inline-flex items-center gap-1"
                            >
                              {label}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                            {condLabel && (
                              <Badge
                                variant={condVariant as Parameters<typeof Badge>[0]['variant']}
                                className="text-xs"
                              >
                                {condLabel}
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                            {v.types_of_vehicles?.name && <span>Tipo: {v.types_of_vehicles.name}</span>}
                            {v.year && <span>Año: {v.year}</span>}
                            {v.brand_vehicles?.name && <span>Marca: {v.brand_vehicles.name}</span>}
                            {v.model_vehicles?.name && <span>Modelo: {v.model_vehicles.name}</span>}
                            {v.intern_number && v.domain && <span>N° Interno: {v.intern_number}</span>}
                          </div>
                          {v.condition && v.condition !== 'operativo' && (
                            <div className="flex items-center gap-1 text-xs text-danger mt-1">
                              <AlertTriangle className="h-3 w-3" />
                              <span>Equipo {conditionLabels[v.condition]?.toLowerCase() ?? v.condition}</span>
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (rel.other_equipment) {
                      const o = rel.other_equipment;
                      return (
                        <div key={rel.id} className="rounded-md border p-3 text-sm">
                          <span className="font-medium">{o.intern_number ?? o.serial_number ?? 'Otro equipo'}</span>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              )}
            </div>

            {/* Equipos de cliente */}
            {customerEquipmentRelations.length > 0 && (
              <>
                <Separator />
                <Field label="Equipos cliente">
                  <div className="flex flex-col gap-1">
                    {customerEquipmentRelations.map((rel) => {
                      const eq = rel.equipos_clientes;
                      return (
                        <Badge key={rel.id} variant="outline" className="w-fit text-xs font-normal">
                          {eq?.name ?? eq?.type ?? 'Equipo cliente'}
                        </Badge>
                      );
                    })}
                  </div>
                </Field>
              </>
            )}

            <Separator />

            {/* Turnos completados */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Completado Día">
                {row.completed_day == null ? (
                  <EmptyValue />
                ) : (
                  <Badge variant={row.completed_day ? 'success' : 'secondary'}>
                    {row.completed_day ? 'Completado' : 'No completado'}
                  </Badge>
                )}
              </Field>
              <Field label="Completado Noche">
                {row.completed_night == null ? (
                  <EmptyValue />
                ) : (
                  <Badge variant={row.completed_night ? 'success' : 'secondary'}>
                    {row.completed_night ? 'Completado' : 'No completado'}
                  </Badge>
                )}
              </Field>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
