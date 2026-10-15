'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ShieldOff } from 'lucide-react';

/** Esqueleto con la forma real del panel: cabecera, barra de etapas, datos clave y tarjetas de sector. */
export function OrderDetailSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-5">
      <span className="sr-only">Cargando detalle de la orden…</span>
      <div className="space-y-3" aria-hidden="true">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-6 w-64 max-w-full" />
        </div>
        <Skeleton className="h-4 w-56" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-1.5 w-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-20 w-full" aria-hidden="true" />
      <div className="space-y-3" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2 rounded-lg border p-4">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface OrderDetailMessageProps {
  kind: 'error' | 'forbidden';
  onRetry?: () => void;
  isRetrying?: boolean;
}

/** Error al cargar (con reintento) o falta de permiso. Nunca se dibuja un detalle vacío como si estuviera bien. */
export function OrderDetailMessage({ kind, onRetry, isRetrying }: OrderDetailMessageProps) {
  const Icon = kind === 'forbidden' ? ShieldOff : AlertTriangle;
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
      <Icon aria-hidden="true" className="text-muted-foreground h-10 w-10" />
      <p className="text-sm font-medium">
        {kind === 'forbidden'
          ? 'No tenés permiso para ver el detalle de esta orden.'
          : 'No se pudo cargar el detalle de la orden.'}
      </p>
      {kind === 'forbidden' ? (
        <p className="text-muted-foreground max-w-sm text-sm">
          Pedile a un administrador que habilite la consulta de órdenes de mantenimiento en tu rol.
        </p>
      ) : (
        onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
            {isRetrying ? 'Reintentando...' : 'Reintentar'}
          </Button>
        )
      )}
    </div>
  );
}
