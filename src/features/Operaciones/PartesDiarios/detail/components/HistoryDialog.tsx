'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Timeline, type TimelineItem, type TimelineTone } from '@/shared/components/common/Timeline';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { dailyReportRowStatusLabels, dailyReportTypeServiceLabels } from '@/shared/utils/mappers';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Computer,
  ExternalLink,
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
import { useState, type ReactNode } from 'react';
import { DETAIL_QUERY_PREFIX } from '../constants';
import { getDailyReportRowHistory } from '../history.server';
import type { DailyReportHistoryEntry } from '../types';
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
// HELPERS — Action type display
// ============================================================================

type ActionType = string;

function getActionIcon(actionType: ActionType) {
  switch (actionType) {
    case 'UPDATE':
      return <RotateCcw className="h-4 w-4" aria-hidden="true" />;
    case 'LINK':
      return <LinkIcon className="h-4 w-4" aria-hidden="true" />;
    case 'UNLINK':
      return <X className="h-4 w-4" aria-hidden="true" />;
    case 'CREATE':
      return <PlusCircle className="h-4 w-4" aria-hidden="true" />;
    default:
      return <Info className="h-4 w-4" aria-hidden="true" />;
  }
}

function getActionTone(actionType: ActionType): TimelineTone {
  switch (actionType) {
    case 'CREATE':
      return 'ok';
    case 'UNLINK':
      return 'warn';
    case 'DELETE':
      return 'danger';
    default:
      return 'brand';
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
  customer_id: 'Cliente',
  customer_name: 'Cliente',
  service: 'Servicio',
  service_id: 'Servicio',
  service_name: 'Servicio',
  item: 'Ítem',
  item_id: 'Ítem',
  item_name: 'Ítem',
  remit_number: 'Nro Remito',
  cancel_reason: 'Motivo de Cancelación',
  sector_name: 'Sector',
  area_name: 'Área',
};

function getFieldDisplayName(field: string) {
  return fieldTranslations[field] ?? field.replace(/_/g, ' ');
}

function getValueDisplay(value: unknown, field: string): string {
  if (value === null || value === undefined) return 'Sin valor';
  if (field === 'completed_night' || field === 'completed_day') {
    return value === true || value === 'true' ? 'Completado' : 'No completado';
  }
  if (field === 'status') {
    return dailyReportRowStatusLabels[String(value)] ?? String(value).replace(/_/g, ' ');
  }
  if (field === 'type_service') {
    return dailyReportTypeServiceLabels[String(value)] ?? String(value).replace(/_/g, ' ');
  }
  return String(value);
}

// ============================================================================
// HELPERS — Determine relation type from raw DB data
// ============================================================================

type RelationType = 'employee' | 'vehicle' | 'other_equipment' | 'customer_equipment' | 'unknown';

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
    default:
      return 'Recurso';
  }
}

function getRelationIcon(relType: RelationType) {
  switch (relType) {
    case 'employee':
      return <Users className="h-3 w-3 mr-1" aria-hidden="true" />;
    case 'vehicle':
      return <Truck className="h-3 w-3 mr-1" aria-hidden="true" />;
    case 'other_equipment':
      return <Wrench className="h-3 w-3 mr-1" aria-hidden="true" />;
    default:
      return null;
  }
}

// ============================================================================
// SKELETON
// ============================================================================

function HistoryDialogSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando historial">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// ENTRY ITEM
// ============================================================================
//
// `Timeline` renderiza el título y el meta dentro de un <p>, así que ahí solo van elementos en línea
// (span). El detalle expandible (botón + paneles) va como `children` del ítem, fuera del <p>.

/** Tarjeta de detalle (bloque gris con título) */
function DetailPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <span className="bg-muted/40 text-foreground block space-y-3 rounded-lg border p-3 text-sm">
      <span className="text-foreground block text-sm font-medium">{title}</span>
      {children}
    </span>
  );
}

/** Celda con etiqueta y valor */
function DetailCell({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <span className="bg-card relative block overflow-hidden rounded-md border p-3">
      <span className="text-muted-foreground mb-1 flex items-center gap-1 text-xs">{label}</span>
      <span className="text-foreground block text-sm font-medium">{children}</span>
    </span>
  );
}

function SnapshotGrid({ data, translate }: { data: Record<string, unknown>; translate: boolean }) {
  return (
    <span className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Object.entries(data).map(([key, value]) => (
        <DetailCell key={key} label={translate ? getFieldDisplayName(key) : key.replace(/_/g, ' ')}>
          {translate ? getValueDisplay(value, key) : String(value ?? '—')}
        </DetailCell>
      ))}
    </span>
  );
}

function HistoryEntryTitle({ entry }: { entry: DailyReportHistoryEntry }) {
  const actionType = entry.action_type ?? 'UNKNOWN';
  const changedFields = (entry.changed_fields ?? {}) as Record<string, { old?: unknown; new?: unknown }>;
  const relationType = getRelationType(entry);
  const updateFieldCount = Object.keys(changedFields).length;

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5">
        {getActionIcon(actionType)}
        {getActionName(actionType)}
      </span>
      <Badge variant="outline" className="text-xs font-normal">
        {actionType === 'CREATE' && 'Nuevo registro'}
        {actionType === 'UPDATE' && `${updateFieldCount} cambio${updateFieldCount !== 1 ? 's' : ''}`}
        {(actionType === 'LINK' || actionType === 'UNLINK') && (
          <>
            {getRelationIcon(relationType)}
            {getRelationBadgeLabel(relationType)}
          </>
        )}
        {actionType === 'DELETE' && 'Eliminación'}
      </Badge>
    </span>
  );
}

/** Cuándo y quién (solo elementos en línea: se renderiza dentro de un <p>). */
function HistoryEntryMeta({ entry }: { entry: DailyReportHistoryEntry }) {
  return (
    <span className="block">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1 tabular-nums">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {formatArgentinaDateTime(entry.created_at)}
        </span>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="bg-muted flex items-center gap-1 rounded-full px-2 py-0.5">
                {entry.profile ? (
                  <>
                    <UserCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{entry.profile.fullname ?? entry.profile.email ?? 'Usuario'}</span>
                    {entry.profile.credential_id && (
                      <a
                        href="/dashboard/configuration?tab=general&subtab=users"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 inline-flex"
                        aria-label="Ver usuarios (se abre en una pestaña nueva)"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="hover:text-brand-ink h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    <Computer className="text-warn-subtle-foreground h-3.5 w-3.5" aria-hidden="true" />
                    <span>El Sistema</span>
                  </>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {entry.profile ? <p>{entry.profile.email}</p> : <p>Cambio realizado automáticamente</p>}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </span>
    </span>
  );
}

/** Motivo de reasignación y detalle expandible (fuera del <p> del Timeline). */
function HistoryEntryDetails({ entry }: { entry: DailyReportHistoryEntry }) {
  const [expanded, setExpanded] = useState(false);

  const actionType = entry.action_type ?? 'UNKNOWN';
  const changedData = (entry.changed_data ?? {}) as Record<string, unknown>;
  const changedFields = (entry.changed_fields ?? {}) as Record<string, { old?: unknown; new?: unknown }>;
  const relationType = getRelationType(entry);
  const updateFieldCount = Object.keys(changedFields).length;
  // Las filas históricas de "otro equipo" traen los datos con prefijo `otro_equipo_` (función SQL vieja).
  const otherEquipmentType = changedData.equipo_tipo ?? changedData.otro_equipo_tipo;
  const otherEquipmentNumber = (changedData.equipo_numero_interno ??
    changedData.otro_equipo_numero_interno ??
    changedData.equipo_serie ??
    changedData.otro_equipo_numero_serie) as string | null | undefined;

  return (
    <div className="text-muted-foreground mt-2 space-y-2 text-xs">
      {/* Motivo de reasignación — visible siempre, para cualquier tipo de acción */}
      {entry.reassignment_reason && (
        <span className="bg-warn-subtle text-warn-subtle-foreground border-warn/40 flex items-start gap-1 rounded-md border p-2 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Motivo:</strong> {entry.reassignment_reason}
          </span>
        </span>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="bg-muted hover:bg-muted/70 w-full justify-between"
        aria-expanded={expanded}
        onClick={() => setExpanded((p) => !p)}
      >
        <span className="text-sm font-medium">{expanded ? 'Ocultar detalles' : 'Ver detalles'}</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>

      {expanded && (
        <span className="block space-y-3">
          {/* ── CREATE: snapshot de changed_data ─────────────────────── */}
          {actionType === 'CREATE' && (
            <DetailPanel title="Detalles del registro creado:">
              <SnapshotGrid data={changedData} translate />
            </DetailPanel>
          )}

          {/* ── UPDATE: changed_fields (anterior → nuevo) ────────────── */}
          {actionType === 'UPDATE' && updateFieldCount > 0 && (
            <span className="block space-y-3">
              {Object.entries(changedFields).map(([field, change]) => (
                <DetailPanel key={field} title={getFieldDisplayName(field)}>
                  <span className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DetailCell
                      label={
                        <>
                          <X className="text-danger h-3 w-3" aria-hidden="true" />
                          Valor anterior
                        </>
                      }
                    >
                      <span className="bg-danger absolute top-0 left-0 h-full w-1" aria-hidden="true" />
                      <span className="capitalize">{getValueDisplay(change.old, field)}</span>
                    </DetailCell>
                    <DetailCell
                      label={
                        <>
                          <CheckCircle2 className="text-ok h-3 w-3" aria-hidden="true" />
                          Valor nuevo
                        </>
                      }
                    >
                      <span className="bg-ok absolute top-0 left-0 h-full w-1" aria-hidden="true" />
                      <span className="capitalize">{getValueDisplay(change.new, field)}</span>
                    </DetailCell>
                  </span>
                </DetailPanel>
              ))}
            </span>
          )}

          {/* ── UPDATE fallback: si changed_fields está vacío, snapshot de changed_data ── */}
          {actionType === 'UPDATE' && updateFieldCount === 0 && Object.keys(changedData).length > 0 && (
            <DetailPanel title="Estado del registro al momento de la actualización:">
              <SnapshotGrid data={changedData} translate />
            </DetailPanel>
          )}

          {/* ── LINK/UNLINK: empleado ───────────────────────────────── */}
          {(actionType === 'LINK' || actionType === 'UNLINK') && relationType === 'employee' && (
            <DetailPanel title={actionType === 'LINK' ? 'Empleado vinculado:' : 'Empleado desvinculado:'}>
              <span className="bg-card flex items-center gap-2 rounded-md border p-3">
                <Users className="text-brand-ink h-4 w-4" aria-hidden="true" />
                <Badge variant="default">{(changedData.empleado_nombre as string) ?? '—'}</Badge>
              </span>
            </DetailPanel>
          )}

          {/* ── LINK/UNLINK: vehículo ───────────────────────────────── */}
          {(actionType === 'LINK' || actionType === 'UNLINK') && relationType === 'vehicle' && (
            <DetailPanel title={actionType === 'LINK' ? 'Vehículo vinculado:' : 'Vehículo desvinculado:'}>
              <span className="bg-card flex flex-col gap-2 rounded-md border p-3">
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">Dominio:</span>
                  <Badge variant="info">
                    <Truck className="mr-1 h-3 w-3" aria-hidden="true" />
                    {(changedData.vehiculo_dominio as string) ?? '—'}
                  </Badge>
                </span>
                {typeof changedData.vehiculo_numero_interno === 'string' && (
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">Número interno:</span>
                    <span className="text-sm font-medium">{changedData.vehiculo_numero_interno}</span>
                  </span>
                )}
              </span>
            </DetailPanel>
          )}

          {/* ── LINK/UNLINK: otro equipo ────────────────────────────── */}
          {(actionType === 'LINK' || actionType === 'UNLINK') && relationType === 'other_equipment' && (
            <DetailPanel title={actionType === 'LINK' ? 'Otro equipo vinculado:' : 'Otro equipo desvinculado:'}>
              <span className="bg-card flex flex-col gap-2 rounded-md border p-3">
                {typeof otherEquipmentType === 'string' && (
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">Tipo:</span>
                    <Badge variant="pending">
                      <Wrench className="mr-1 h-3 w-3" aria-hidden="true" />
                      {otherEquipmentType}
                    </Badge>
                  </span>
                )}
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">Número interno:</span>
                  <span className="text-sm font-medium">
                    {otherEquipmentNumber ?? '—'}
                  </span>
                </span>
              </span>
            </DetailPanel>
          )}

          {/* ── LINK/UNLINK: equipo del cliente ─────────────────────── */}
          {(actionType === 'LINK' || actionType === 'UNLINK') && relationType === 'customer_equipment' && (
            <DetailPanel title={actionType === 'LINK' ? 'Equipo cliente vinculado:' : 'Equipo cliente desvinculado:'}>
              <span className="bg-card block rounded-md border p-3">
                <span className="text-sm font-medium">{(changedData.equipo_cliente_nombre as string) ?? (changedData.equipo_nombre as string) ?? '—'}</span>
              </span>
            </DetailPanel>
          )}

          {/* ── LINK/UNLINK: relación desconocida — datos crudos ────── */}
          {(actionType === 'LINK' || actionType === 'UNLINK') && relationType === 'unknown' && (
            <DetailPanel title={actionType === 'LINK' ? 'Recurso vinculado:' : 'Recurso desvinculado:'}>
              <SnapshotGrid data={changedData} translate={false} />
            </DetailPanel>
          )}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function HistoryDialog({ open, onOpenChange, rowId }: Props) {
  const { onOpenAutoFocus, onCloseAutoFocus } = useRestoreFocus();
  const {
    data: historyData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    // Cuelga del prefijo del detalle: `invalidateDetail()` refresca el historial tras editar la línea.
    queryKey: [DETAIL_QUERY_PREFIX, 'row-history', rowId],
    queryFn: () => getDailyReportRowHistory(rowId!),
    enabled: open && rowId != null,
    staleTime: 5 * 60 * 1000,
  });

  const sorted = [...(historyData ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const timelineItems: TimelineItem[] = sorted.map((entry) => ({
    tone: getActionTone(entry.action_type ?? 'UNKNOWN'),
    title: <HistoryEntryTitle entry={entry} />,
    meta: <HistoryEntryMeta entry={entry} />,
    children: <HistoryEntryDetails entry={entry} />,
  }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <SheetHeader className="border-b px-6 py-4 text-left">
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" aria-hidden="true" />
            Historial de cambios
          </SheetTitle>
          <SheetDescription className="sr-only">
            Cambios registrados sobre esta línea del parte, del más reciente al más antiguo.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <HistoryDialogSkeleton />
          ) : isError ? (
            <StateBlock
              variant="error"
              title="No se pudo cargar el historial"
              description="Intentá de nuevo en unos segundos."
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                  Reintentar
                </Button>
              }
            />
          ) : sorted.length === 0 ? (
            <StateBlock variant="empty" icon={Info} title="No hay registros de cambios para este ítem." />
          ) : (
            <Timeline items={timelineItems} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
