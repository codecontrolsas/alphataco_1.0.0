'use client';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { getStockMovementDetail } from '../../actions/movements.server';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { MovementBadges, MovementDetailBody } from './MovementDetail';
import { ReverseMovementDialog } from './ReverseMovementDialog';

interface MovementDetailSheetProps {
  movementId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-4" aria-busy="true" aria-label="Cargando movimiento">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/**
 * Detalle de un movimiento en un panel lateral. Reusa el cuerpo de la página de detalle (que sigue existiendo:
 * otros módulos enlazan a ella). Los costos llegan enmascarados del servidor si falta `view_prices`.
 */
export function MovementDetailSheet({ movementId, open, onOpenChange }: MovementDetailSheetProps) {
  const detail = useQuery({
    queryKey: [...WAREHOUSE_QUERY_KEYS.movementDetail, movementId],
    queryFn: () => getStockMovementDetail(movementId),
    enabled: open,
  });

  const movement = detail.data ?? null;
  const pageHref = `/dashboard/warehouse/movements/${movementId}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-2xl">
        <header className="flex items-start gap-3 border-b p-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <SheetTitle className="flex flex-wrap items-center gap-3 text-lg leading-snug">
              <span className="font-mono">{movement?.number ?? 'Movimiento'}</span>
              {movement ? <MovementBadges movement={movement} /> : null}
            </SheetTitle>
            <SheetDescription className="text-sm">Detalle del movimiento de stock</SheetDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Cerrar detalle" onClick={() => onOpenChange(false)}>
            <X aria-hidden="true" />
          </Button>
        </header>

        {detail.isPending ? (
          <DetailSkeleton />
        ) : detail.isError ? (
          <StateBlock
            variant="error"
            title="No se pudo cargar el movimiento"
            description={detail.error instanceof Error ? detail.error.message : 'Probá de nuevo en unos segundos.'}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => detail.refetch()}>
                Reintentar
              </Button>
            }
          />
        ) : !movement ? (
          <StateBlock
            variant="empty"
            title="No se encontró el movimiento"
            description="No existe o no tenés permiso para verlo. Cerrá el panel y actualizá la lista."
          />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4">
              <MovementDetailBody movement={movement} />
            </div>
            <footer className="flex flex-wrap items-center gap-2 border-t p-4">
              <Button asChild variant="outline" className="sm:mr-auto">
                <Link href={pageHref}>
                  <ExternalLink aria-hidden="true" />
                  Abrir página
                </Link>
              </Button>
              {movement.canReverse ? <ReverseMovementDialog movementId={movement.id} number={movement.number} /> : null}
            </footer>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
