'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { OperatorWorkOrder } from '@/features/OperatorPanel/actions/queries.server';
import {
  getCompletedWorkOrdersForOperator,
  getWorkOrdersForOperator,
} from '@/features/OperatorPanel/actions/queries.server';
import { useOperatorContext } from '@/features/OperatorPanel/components/operator-layout-provider';
import { Logger } from '@/lib/logger';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Lock, Search, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { WorkOrderCard } from './WorkOrderCard';

const logger = new Logger('WorkOrderList');

type FilterStatus = 'active' | 'blocked' | 'completed';

interface WorkOrderListProps {
  initialData: OperatorWorkOrder[];
}

const PAGE_SIZE = 10;

/**
 * Busqueda libre sobre una OT.
 *
 * Ticket 596: el recurso puede ser un vehiculo (dominio/serie) o un equipamiento
 * (numero de serie), asi que se contemplan los identificadores de los dos.
 */
function matchesQuery(workOrder: OperatorWorkOrder, query: string): boolean {
  const haystack = [
    workOrder.order_number,
    workOrder.vehicles?.domain,
    workOrder.vehicles?.serie,
    workOrder.vehicles?.intern_number,
    workOrder.other_equipment?.serial_number,
    workOrder.other_equipment?.intern_number,
    workOrder.work_order_items?.[0]?.maintenance_order_items?.maintenance_orders?.order_number,
  ];

  return haystack.some((value) => value?.toString().toLowerCase().includes(query));
}

export function WorkOrderList({ initialData }: WorkOrderListProps) {
  const { sectorId } = useOperatorContext();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('active');
  const [completedPage, setCompletedPage] = useState(0);

  // Query for active work orders (pending, in_progress, paused)
  const {
    data: activeWorkOrders = [],
    isLoading: isLoadingActive,
    isError: hasActiveError,
    refetch: refetchActive,
  } = useQuery({
    queryKey: ['operator-work-orders', sectorId, false],
    queryFn: () => getWorkOrdersForOperator(sectorId, false),
    initialData,
  });

  // Query for completed work orders (paginated, only fetched when needed)
  const {
    data: completedResult,
    isLoading: isLoadingCompleted,
    isError: hasCompletedError,
    refetch: refetchCompleted,
  } = useQuery({
    queryKey: ['operator-work-orders-completed', sectorId, completedPage],
    queryFn: () => getCompletedWorkOrdersForOperator(sectorId, completedPage, PAGE_SIZE),
    enabled: statusFilter === 'completed',
  });

  const isCompletedStatus = (status: string | null) => status === 'completed' || status === 'completed_partial';

  logger.debug('Rendering work order list', { data: { activeCount: activeWorkOrders.length } });

  // Filter active orders (search + status filter)
  const filteredActiveOrders = useMemo(() => {
    let orders = activeWorkOrders;

    orders =
      statusFilter === 'blocked'
        ? orders.filter((wo) => wo.is_blocked)
        : orders.filter((wo) => !wo.is_blocked && !isCompletedStatus(wo.status));

    if (search.trim()) {
      const query = search.toLowerCase().trim();
      orders = orders.filter((wo) => matchesQuery(wo, query));
    }

    return orders;
  }, [activeWorkOrders, statusFilter, search]);

  // Filter completed orders (search only, server-side pagination)
  const filteredCompletedOrders = useMemo(() => {
    const orders = completedResult?.data || [];
    if (!search.trim()) return orders;

    const query = search.toLowerCase().trim();
    return orders.filter((wo) => matchesQuery(wo, query));
  }, [completedResult, search]);

  // Counts for badges
  const activeCount = activeWorkOrders.filter((wo) => !wo.is_blocked && !isCompletedStatus(wo.status)).length;
  const blockedCount = activeWorkOrders.filter((wo) => wo.is_blocked).length;
  const completedCount = completedResult?.totalCount ?? 0;

  const isLoading = statusFilter === 'completed' ? isLoadingCompleted : isLoadingActive;
  const displayOrders = statusFilter === 'completed' ? filteredCompletedOrders : filteredActiveOrders;
  // Con datos ya cargados una falla de refresco no oculta la lista; el error solo reemplaza a una lista vacía
  const hasError = (statusFilter === 'completed' ? hasCompletedError : hasActiveError) && displayOrders.length === 0;
  const retry = () => void (statusFilter === 'completed' ? refetchCompleted() : refetchActive());

  // Completadas solo se pide al abrir la pestaña: antes de eso no hay número, y un "0" afirmaría que no hay ninguna
  const tabs: { value: FilterStatus; label: string; count: number | null; icon: typeof Zap }[] = [
    { value: 'active', label: 'Activas', count: activeCount, icon: Zap },
    { value: 'blocked', label: 'Bloqueadas', count: blockedCount, icon: Lock },
    { value: 'completed', label: 'Completadas', count: completedResult ? completedCount : null, icon: CheckCircle2 },
  ];

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    setStatusFilter(next.value);
    if (next.value === 'completed') setCompletedPage(0);
    document.getElementById(`operator-tab-${next.value}`)?.focus();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ordenes de Trabajo</h1>
        <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">
          {activeCount} activa{activeCount !== 1 ? 's' : ''} · {blockedCount} bloqueada{blockedCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          aria-hidden="true"
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
        />
        <Input
          type="search"
          inputMode="search"
          aria-label="Buscar órdenes de trabajo"
          placeholder="Buscar por OT, OM, dominio, N° de serie o interno..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-12 rounded-xl text-base"
        />
      </div>

      {/* Pestañas: Activas / Bloqueadas / Completadas */}
      <div
        role="tablist"
        aria-label="Estado de las órdenes de trabajo"
        className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
      >
        {tabs.map((option, index) => {
          const isActive = statusFilter === option.value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              id={`operator-tab-${option.value}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="operator-tabpanel"
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              onClick={() => {
                setStatusFilter(option.value);
                if (option.value === 'completed') setCompletedPage(0);
              }}
              className={cn(
                'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-sm font-medium outline-none transition-colors sm:flex-row sm:gap-1.5',
                'focus-visible:ring-[3px] focus-visible:ring-ring/50',
                isActive ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                {option.label}
              </span>
              {option.count !== null && (
                <span className="text-xs tabular-nums text-muted-foreground">{option.count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div
        id="operator-tabpanel"
        role="tabpanel"
        aria-labelledby={`operator-tab-${statusFilter}`}
        className="space-y-5"
      >
      {/* Loading skeleton */}
      {isLoading && <WorkOrderListSkeleton />}

      {/* Error: no se afirma "sin órdenes" cuando en realidad falló la carga */}
      {!isLoading && hasError && (
        <Card role="alert" className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-danger-subtle text-danger-subtle-foreground">
              <AlertCircle aria-hidden="true" className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium">No se pudieron cargar las órdenes de trabajo.</p>
              <p className="text-sm text-muted-foreground">Revisá la conexión y probá de nuevo.</p>
            </div>
            <Button type="button" variant="outline" className="h-11" onClick={retry}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !hasError && displayOrders.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              {statusFilter === 'completed' ? (
                <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
              ) : statusFilter === 'blocked' ? (
                <Lock className="h-8 w-8 text-muted-foreground" />
              ) : (
                <ClipboardList className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <h3 className="text-lg font-semibold">
              {statusFilter === 'completed'
                ? 'Sin ordenes completadas'
                : statusFilter === 'blocked'
                  ? 'Sin ordenes bloqueadas'
                  : 'Sin ordenes de trabajo'}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-[280px]">
              {search.trim()
                ? 'No se encontraron resultados para tu busqueda'
                : statusFilter === 'completed'
                  ? 'No hay ordenes completadas en tu sector'
                  : 'No hay ordenes asignadas a tu sector en este momento'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Work order list - Active view with sections */}
      {!isLoading && !hasError && displayOrders.length > 0 && statusFilter !== 'completed' && (
        <div className="space-y-3">
          {filteredActiveOrders.map((workOrder) => (
            <WorkOrderCard key={workOrder.id} workOrder={workOrder} />
          ))}
        </div>
      )}

      {/* Work order list - Completed view with pagination */}
      {!isLoading && !hasError && statusFilter === 'completed' && filteredCompletedOrders.length > 0 && (
        <div className="space-y-3">
          {filteredCompletedOrders.map((workOrder) => (
            <WorkOrderCard key={workOrder.id} workOrder={workOrder} />
          ))}

          {/* Pagination controls */}
          {completedResult && completedResult.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Pagina {completedPage + 1} de {completedResult.totalPages} ({completedResult.totalCount} total)
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => setCompletedPage((p) => Math.max(0, p - 1))}
                  disabled={completedPage === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => setCompletedPage((p) => Math.min(completedResult.totalPages - 1, p + 1))}
                  disabled={completedPage >= completedResult.totalPages - 1}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function WorkOrderListSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Cargando órdenes de trabajo">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-l-4 border-l-pending bg-card p-4 sm:p-5">
          <div className="space-y-3">
            <div className="flex justify-between">
              <div className="space-y-1.5">
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-5 w-5 rounded" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
