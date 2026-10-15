'use client';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { getRequestDetailForSheet } from './RequestsList/actions.server';
import { RequestDetailBody } from './RequestDetail';
import { RequestActions } from './RequestDecisionDialogs';
import { RequestStatusBadge } from './RequestStatusBadge';

interface RequestDetailSheetProps {
  requestId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-4" aria-busy="true" aria-label="Cargando pedido">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/**
 * Detalle de un pedido en un panel lateral. Reusa el cuerpo de la pagina de detalle y sus acciones
 * (aprobar, rechazar, cancelar, cerrar, entregar). Los datos se piden con `useQuery` y se invalidan tras cada
 * decision o entrega (las acciones invalidan `requestDetail`).
 */
export function RequestDetailSheet({ requestId, open, onOpenChange }: RequestDetailSheetProps) {
  const detail = useQuery({
    queryKey: [...WAREHOUSE_QUERY_KEYS.requestDetail, requestId],
    queryFn: () => getRequestDetailForSheet(requestId),
    enabled: open,
  });

  const data = detail.data ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-3xl">
        <header className="flex items-start gap-3 border-b p-4">
          <div className="min-w-0 flex-1 space-y-2">
            <SheetTitle className="flex flex-wrap items-center gap-3 text-lg leading-snug">
              <span className="font-mono">{data?.request.number ?? 'Pedido'}</span>
              {data ? <RequestStatusBadge status={data.request.status} /> : null}
            </SheetTitle>
            <SheetDescription className="text-sm">Detalle del pedido de materiales</SheetDescription>
            {data ? <RequestActions request={data.request} /> : null}
          </div>
          <Button asChild type="button" variant="ghost" size="icon" aria-label="Abrir en su propia página">
            <Link href={`/dashboard/warehouse/requests/${requestId}`}>
              <ExternalLink aria-hidden="true" />
            </Link>
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Cerrar detalle" onClick={() => onOpenChange(false)}>
            <X aria-hidden="true" />
          </Button>
        </header>

        {detail.isPending ? (
          <DetailSkeleton />
        ) : detail.isError ? (
          <StateBlock
            variant="error"
            title="No se pudo cargar el pedido"
            description={detail.error instanceof Error ? detail.error.message : 'Probá de nuevo en unos segundos.'}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => detail.refetch()}>
                Reintentar
              </Button>
            }
          />
        ) : !data ? (
          <StateBlock
            variant="empty"
            title="No se encontró el pedido"
            description="Pudo haberse eliminado o no tenés acceso. Cerrá el panel y actualizá la lista."
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <RequestDetailBody request={data.request} purchases={data.purchases} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
