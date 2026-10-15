'use client';

import { Button } from '@/components/ui/button';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useDataTableFilter } from '@/shared/components/common/DataTable';
import { useQuery } from '@tanstack/react-query';
import { getSupplierInvoicesAttention } from '../actions.server';
import { INVOICES_ATTENTION_QUERY_KEY, INVOICES_TABLE_ID } from '../constants';

type AttentionData = Awaited<ReturnType<typeof getSupplierInvoicesAttention>>;

/**
 * Banda "facturas observadas" (solo con permiso de aprobar). El número llega del servidor con el mismo `where`
 * que la lista filtrada por estado Observada y que el contador de la sub-navegación, y se refresca tras cada
 * decisión (la clave cuelga de la de la tabla). Si el filtro ya está aplicado, el botón no se ofrece.
 */
export function InvoicesAttention({
  initialData,
  serverStatus = null,
}: {
  /** `null` cuando no corresponde o el conteo del servidor falló: no se muestra nada. */
  initialData: AttentionData;
  /** Filtro de estado con el que se renderizó el servidor (evita el parpadeo antes de leer la URL). */
  serverStatus?: string | null;
}) {
  const [status, setStatus] = useDataTableFilter(INVOICES_TABLE_ID, 'status', serverStatus);

  const { data } = useQuery({
    queryKey: INVOICES_ATTENTION_QUERY_KEY,
    queryFn: getSupplierInvoicesAttention,
    initialData,
    staleTime: 30 * 1000,
  });

  const observed = data?.observed ?? 0;
  if (observed === 0) return null;

  return (
    <AttentionBanner
      live
      tone="warn"
      title={`${observed} ${observed === 1 ? 'factura observada' : 'facturas observadas'} para revisar`}
      description="Tienen diferencias con lo recibido o con ARCA: aprobalas o rechazalas."
      actions={
        status === 'OBSERVED' ? null : (
          <Button type="button" size="sm" variant="outline" onClick={() => setStatus('OBSERVED')}>
            Ver {observed === 1 ? 'la observada' : `las ${observed}`}
          </Button>
        )
      }
    />
  );
}
