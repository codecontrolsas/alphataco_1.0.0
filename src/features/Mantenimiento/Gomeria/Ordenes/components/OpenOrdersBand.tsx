'use client';

import { Button } from '@/components/ui/button';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { useQuery } from '@tanstack/react-query';
import { PlayCircle } from 'lucide-react';
import { getOpenServiceOrdersSummary } from '../actions/service-order-list.server';

type Summary = Awaited<ReturnType<typeof getOpenServiceOrdersSummary>>;

/** Cuelga de `['tire-service-orders']`: crear, finalizar o anular una orden ya invalida ese prefijo. */
export const OPEN_ORDERS_QUERY_KEY = ['tire-service-orders', 'open-summary'] as const;

interface OpenOrdersBandProps {
  initialSummary: Summary;
  /** Con permiso `ordenes_gomeria:update` aparece "Continuar orden". */
  canContinue: boolean;
  onContinue: (order: { id: string; vehicleId: string; trailerId: string | null }) => void;
}

/**
 * Banda de atención: hay órdenes abiertas y se puede retomar la última. Desaparece cuando no queda ninguna
 * (no afirma nada si no hay órdenes abiertas: el listado de abajo es la fuente).
 */
export function OpenOrdersBand({ initialSummary, canContinue, onContinue }: OpenOrdersBandProps) {
  const { data: summary = initialSummary } = useQuery({
    queryKey: OPEN_ORDERS_QUERY_KEY,
    queryFn: () => getOpenServiceOrdersSummary(),
    initialData: initialSummary,
    staleTime: 30_000,
  });

  const { count, latest } = summary;
  if (count === 0 || !latest) return null;

  const vehicle = latest.vehicle?.domain ?? 'Vehículo sin dominio';
  const trailer = latest.trailer?.domain;
  const author = latest.creator?.fullname;

  return (
    <div
      role="status"
      className="border-info/30 bg-info-subtle text-info-subtle-foreground flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <PlayCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">{count === 1 ? '1 orden abierta.' : `${count} órdenes abiertas.`}</p>
          <p className="opacity-90">
            {count > 1 ? 'La última: ' : ''}
            {vehicle}
            {trailer ? ` con enganche ${trailer}` : ''}, iniciada el {formatArgentinaDateTime(latest.created_at)}
            {author ? ` por ${author}` : ''}.
          </p>
        </div>
      </div>
      {canContinue ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() =>
            onContinue({ id: latest.id, vehicleId: latest.vehicle_id, trailerId: latest.trailer_vehicle_id })
          }
        >
          Continuar orden
        </Button>
      ) : null}
    </div>
  );
}
