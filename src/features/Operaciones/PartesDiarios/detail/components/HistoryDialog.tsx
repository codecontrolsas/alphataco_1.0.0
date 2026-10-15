'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Computer,
  ExternalLink,
  FileText,
  History,
  Info,
  LinkIcon,
  PlusCircle,
  RotateCcw,
  Truck,
  UserCircle,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import moment from 'moment';
import { useState } from 'react';
import { getDailyReportRowHistory } from '../history.server';
import type { DailyReportHistoryEntry } from '../types';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowId: string | null;
}

// ============================================================================
// HELPERS — Action type display
// ============================================================================

type ActionType = string;

function getActionIcon(actionType: ActionType) {
  switch (actionType) {
    case 'UPDATE':
      return <RotateCcw className="h-5 w-5" />;
    case 'LINK':
      return <LinkIcon className="h-5 w-5" />;
    case 'UNLINK':
      return <X className="h-5 w-5" />;
    case 'CREATE':
      return <PlusCircle className="h-5 w-5" />;
    default:
      return <Info className="h-5 w-5" />;
  }
}

function getActionColor(actionType: ActionType) {
  switch (actionType) {
    case 'UPDATE':
      return 'bg-blue-600 text-white';
    case 'LINK':
      return 'bg-purple-600 text-white';
    case 'UNLINK':
      return 'bg-orange-600 text-white';
    case 'CREATE':
      return 'bg-emerald-600 text-white';
    case 'DELETE':
      return 'bg-red-600 text-white';
    default:
      return 'bg-slate-600 text-white';
  }
}

function getActionName(actionType: ActionType) {
  switch (actionType) {
    case 'UPDATE':
      return 'Actualización';
    case 'LINK':
      return 'Vinculación';
    case 'UNLINK':
      return 'Desvinculación';
    case 'CREATE':
      return 'Creación';
    case 'DELETE':
      return 'Eliminación';
    default:
      return actionType;
  }
}

// ============================================================================
// HELPERS — Field translations
// ============================================================================

const fieldTranslations: Record<string, string> = {
  completed_night: 'Completado Nocturno',
  completed_day: 'Completado Diurno',
  status: 'Estado',
  description: 'Descripción',
  start_time: 'Hora de Inicio',
  end_time: 'Hora de Fin',
  type_service: 'Tipo de Servicio',
  service_type: 'Tipo de Servicio',
  working_day: 'Jornada Laboral',
  customer: 'Cliente',
  customer_name: 'Cliente',
  service: 'Servicio',
  service_name: 'Servicio',
  item: 'Ítem',
  item_name: 'Ítem',
  remit_number: 'Nro Remito',
  cancel_reason: 'Motivo de Cancelación',
  sector_name: 'Sector',
  area_name: 'Área',
};

const statusTranslations: Record<string, string> = {
  pendiente: 'Pendiente',
  sin_recursos_asignados: 'Sin Recursos Asignados',
  ejecutado: 'Ejecutado',
  reprogramado: 'Reprogramado',
  cancelado: 'Cancelado',
  en_certificacion: 'En Certificación',
};

function getFieldDisplayName(field: string) {
  return fieldTranslations[field] ?? field.replace(/_/g, ' ');
}

const typeServiceTranslations: Record<string, string> = {
  mensual: 'Mensual',
  adicional: 'Adicional',
  adicional_permanente: 'Adicional Permanente',
};

function getValueDisplay(value: unknown, field: string): string {
  if (value === null || value === undefined) return 'Sin valor';
  if (field === 'completed_night' || field === 'completed_day') {
    return value === true || value === 'true' ? 'Completado' : 'No completado';
  }
  if (field === 'status') {
    return statusTranslations[String(value)] ?? String(value).replace(/_/g, ' ');
  }
  if (field === 'type_service') {
    return typeServiceTranslations[String(value)] ?? String(value).replace(/_/g, ' ');
  }
  return String(value);
}

// ============================================================================
// HELPERS — Determine relation type from raw DB data
// ============================================================================

type RelationType =
  | 'employee'
  | 'vehicle'
  | 'other_equipment'
  | 'customer_equipment'
  | 'remito'
  | 'remito_document'
  | 'unknown';

function getRelationType(entry: DailyReportHistoryEntry): RelationType {
  const table = entry.related_table;
  if (table === 'dailyreportemployeerelations') return 'employee';
  if (table === 'dailyreportequipmentrelations') {
    // Distinguish vehicle vs other_equipment via changed_data
    const data = entry.changed_data as Record<string, unknown> | null;
    if (data?.tipo_equipo === 'other_equipment') return 'other_equipment';
    return 'vehicle';
  }
  if (table === 'dailyreport_customer_equipment_relations') return 'customer_equipment';
  if (table === 'remitos') return 'remito';
  if (table === 'remito_documents') return 'remito_document';
  return 'unknown';
}

function getRelationBadgeLabel(relType: RelationType): string {
  switch (relType) {
    case 'employee':
      return 'Empleado';
    case 'vehicle':
      return 'Vehículo';
    case 'other_equipment':
      return 'Otro Equipo';
    case 'customer_equipment':
      return 'Equipo Cliente';
    case 'remito':
      return 'Remito';
    case 'remito_document':
      return 'Documento de remito';
    default:
      return 'Recurso';
  }
}

function getRelationIcon(relType: RelationType) {
  switch (relType) {
    case 'employee':
      return <Users className="h-3 w-3 mr-1" />;
    case 'vehicle':
      return <Truck className="h-3 w-3 mr-1" />;
    case 'other_equipment':
      return <Wrench className="h-3 w-3 mr-1" />;
    case 'remito':
    case 'remito_document':
      return <FileText className="h-3 w-3 mr-1" />;
    default:
      return null;
  }
}

// ============================================================================
// SKELETON
// ============================================================================

function HistoryDialogSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-11 w-11 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// ENTRY ITEM
// ============================================================================

function HistoryEntryItem({ entry, isLast }: { entry: DailyReportHistoryEntry; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const actionType = entry.action_type ?? 'UNKNOWN';
  const changedData = (entry.changed_data ?? {}) as Record<string, unknown>;
  const changedFields = (entry.changed_fields ?? {}) as Record<string, { old?: unknown; new?: unknown }>;
  const relationType = getRelationType(entry);

  // Count meaningful changes for UPDATE badge
  const updateFieldCount = Object.keys(changedFields).length;

  return (
    <div className="relative">
      {!isLast && (
        <div className="absolute left-[22px] top-12 bottom-0 w-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
      )}

      <div className="flex gap-4">
        {/* Timeline node */}
        <div
          className={cn(
            'w-11 h-11 rounded-full flex items-center justify-center shrink-0 z-10',
            getActionColor(actionType)
          )}
        >
          {getActionIcon(actionType)}
        </div>

        <div className="flex-1 pb-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-slate-900 dark:text-slate-100">{getActionName(actionType)}</h3>
              <Badge variant="outline" className="font-normal text-xs">
                {actionType === 'CREATE' && 'Nuevo registro'}
                {actionType === 'UPDATE' && `${updateFieldCount} cambio${updateFieldCount !== 1 ? 's' : ''}`}
                {(actionType === 'LINK' || actionType === 'UNLINK') && (
                  <span className="flex items-center">
                    {getRelationIcon(relationType)}
                    {getRelationBadgeLabel(relationType)}
                  </span>
                )}
                {actionType === 'DELETE' && 'Eliminación'}
              </Badge>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {moment(entry.created_at).format('DD MMM YYYY, HH:mm')}
              </span>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs">
                      {entry.profile ? (
                        <>
                          <UserCircle className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                          <span className="text-slate-700 dark:text-slate-300">{entry.profile.email ?? 'Usuario'}</span>
                          {entry.profile.credential_id && (
                            <a
                              href="/dashboard/configuration?tab=general&subtab=users"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex ml-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3 text-slate-500 hover:text-blue-500" />
                            </a>
                          )}
                        </>
                      ) : (
                        <>
                          <Computer className="h-3.5 w-3.5 text-orange-600" />
                          <span className="text-slate-700 dark:text-slate-300">El Sistema</span>
                        </>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {entry.profile ? <p>{entry.profile.email}</p> : <p>Cambio realizado automáticamente</p>}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Toggle button */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between mb-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
            onClick={() => setExpanded((p) => !p)}
          >
            <span className="font-medium text-sm">{expanded ? 'Ocultar detalles' : 'Ver detalles'}</span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {/* Expandable content */}
          {expanded && (
            <div className="space-y-3">
              {/* Reassignment reason — shown for any action type */}
              {entry.reassignment_reason && (
                <div className="bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 p-2 rounded-md">
                  <p className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-1">
                    <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong>Motivo:</strong> {entry.reassignment_reason}
                    </span>
                  </p>
                </div>
              )}

              {/* ── CREATE: show changed_data snapshot ──────────────────── */}
              {actionType === 'CREATE' && (
                <div className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-800">
                  <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                    Detalles del registro creado:
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(changedData).map(([key, value]) => (
                      <div key={key} className="bg-white dark:bg-slate-900 p-3 rounded-md border">
                        <span className="text-xs text-muted-foreground block mb-1">{getFieldDisplayName(key)}</span>
                        <span className="font-medium text-slate-900 dark:text-slate-200 text-sm">
                          {getValueDisplay(value, key)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── UPDATE: show changed_fields (old → new) ────────────── */}
              {actionType === 'UPDATE' && updateFieldCount > 0 && (
                <div className="space-y-3">
                  {Object.entries(changedFields).map(([field, change]) => (
                    <div key={field} className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-800">
                      <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                        {getFieldDisplayName(field)}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-white dark:bg-slate-900 p-3 rounded-md border relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-red-400" />
                          <span className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <X className="h-3 w-3 text-red-500" />
                            Valor anterior
                          </span>
                          <span className="font-medium text-sm capitalize block mt-1">
                            {getValueDisplay(change.old, field)}
                          </span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-3 rounded-md border relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-green-400" />
                          <span className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                            Valor nuevo
                          </span>
                          <span className="font-medium text-sm capitalize block mt-1">
                            {getValueDisplay(change.new, field)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── UPDATE fallback: if changed_fields is empty, show changed_data snapshot ── */}
              {actionType === 'UPDATE' && updateFieldCount === 0 && Object.keys(changedData).length > 0 && (
                <div className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-800">
                  <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                    Estado del registro al momento de la actualización:
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(changedData).map(([key, value]) => (
                      <div key={key} className="bg-white dark:bg-slate-900 p-3 rounded-md border">
                        <span className="text-xs text-muted-foreground block mb-1">{getFieldDisplayName(key)}</span>
                        <span className="font-medium text-slate-900 dark:text-slate-200 text-sm">
                          {getValueDisplay(value, key)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── LINK/UNLINK: employee ───────────────────────────────── */}
              {(actionType === 'LINK' || actionType === 'UNLINK') && relationType === 'employee' && (
                <div className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-800">
                  <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                    {actionType === 'LINK' ? 'Empleado vinculado:' : 'Empleado desvinculado:'}
                  </h4>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-md border">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-200">
                        {(changedData.empleado_nombre as string) ?? '—'}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}

              {/* ── LINK/UNLINK: vehicle ────────────────────────────────── */}
              {(actionType === 'LINK' || actionType === 'UNLINK') && relationType === 'vehicle' && (
                <div className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-800">
                  <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                    {actionType === 'LINK' ? 'Vehículo vinculado:' : 'Vehículo desvinculado:'}
                  </h4>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-md border flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Dominio:</span>
                      <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 dark:bg-purple-900 dark:text-purple-200">
                        <Truck className="h-3 w-3 mr-1" />
                        {(changedData.vehiculo_dominio as string) ?? '—'}
                      </Badge>
                    </div>
                    {typeof changedData.vehiculo_numero_interno === 'string' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Número interno:</span>
                        <span className="font-medium text-sm">{changedData.vehiculo_numero_interno}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── LINK/UNLINK: other equipment ───────────────────────── */}
              {(actionType === 'LINK' || actionType === 'UNLINK') && relationType === 'other_equipment' && (
                <div className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-800">
                  <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                    {actionType === 'LINK' ? 'Otro equipo vinculado:' : 'Otro equipo desvinculado:'}
                  </h4>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-md border flex flex-col gap-2">
                    {typeof changedData.equipo_tipo === 'string' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Tipo:</span>
                        <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-100 dark:bg-teal-900 dark:text-teal-200">
                          <Wrench className="h-3 w-3 mr-1" />
                          {changedData.equipo_tipo}
                        </Badge>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Número interno:</span>
                      <span className="font-medium text-sm">
                        {(changedData.equipo_numero_interno as string) ?? (changedData.equipo_serie as string) ?? '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── LINK/UNLINK: customer equipment ────────────────────── */}
              {(actionType === 'LINK' || actionType === 'UNLINK') && relationType === 'customer_equipment' && (
                <div className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-800">
                  <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                    {actionType === 'LINK' ? 'Equipo cliente vinculado:' : 'Equipo cliente desvinculado:'}
                  </h4>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-md border">
                    <span className="font-medium text-sm">{(changedData.equipo_cliente_nombre as string) ?? '—'}</span>
                  </div>
                </div>
              )}

              {/* ── LINK/UNLINK: remito (alta o baja) ───────────────────── */}
              {(actionType === 'LINK' || actionType === 'UNLINK') && relationType === 'remito' && (
                <div className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-800">
                  <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                    {actionType === 'LINK'
                      ? changedData.vinculado
                        ? 'Remito vinculado desde otra línea:'
                        : 'Remito cargado:'
                      : changedData.vinculado
                        ? 'Remito desvinculado:'
                        : 'Remito eliminado:'}
                  </h4>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-md border">
                    <span className="font-mono font-medium text-sm tabular-nums">
                      {(changedData.remito_numero as string) ?? '—'}
                    </span>
                  </div>
                </div>
              )}

              {/* ── LINK/UNLINK: documento de un remito ─────────────────── */}
              {(actionType === 'LINK' || actionType === 'UNLINK') && relationType === 'remito_document' && (
                <div className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-800">
                  <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                    {actionType === 'LINK' ? 'Documento agregado al remito:' : 'Documento quitado del remito:'}
                  </h4>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-md border flex flex-col gap-1">
                    <span className="font-medium text-sm">{(changedData.documento_nombre as string) ?? '—'}</span>
                    <span className="text-xs text-muted-foreground">
                      Remito <span className="font-mono tabular-nums">{(changedData.remito_numero as string) ?? '—'}</span>
                    </span>
                  </div>
                </div>
              )}

              {/* ── LINK/UNLINK: unknown relation type — show raw data ── */}
              {(actionType === 'LINK' || actionType === 'UNLINK') && relationType === 'unknown' && (
                <div className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-800">
                  <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                    {actionType === 'LINK' ? 'Recurso vinculado:' : 'Recurso desvinculado:'}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(changedData).map(([key, value]) => (
                      <div key={key} className="bg-white dark:bg-slate-900 p-3 rounded-md border">
                        <span className="text-xs text-muted-foreground block mb-1">{key.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-slate-900 dark:text-slate-200 text-sm">
                          {String(value ?? '—')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function HistoryDialog({ open, onOpenChange, rowId }: Props) {
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['daily-report-row-history', rowId],
    queryFn: () => getDailyReportRowHistory(rowId!),
    enabled: open && rowId != null,
    staleTime: 5 * 60 * 1000,
  });

  const sorted = [...(historyData ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[850px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historial de Cambios
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto max-h-[70vh]">
          {isLoading ? (
            <HistoryDialogSkeleton />
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Info className="h-12 w-12 mb-2 opacity-50" />
              <p>No hay registros de cambios para este ítem.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sorted.map((entry, index) => (
                <HistoryEntryItem key={entry.id} entry={entry} isLast={index === sorted.length - 1} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
