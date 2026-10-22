'use client';

import { Button } from '@/components/ui/button';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useDataTableFilter } from '@/shared/components/common/DataTable/useDataTableFilter';
import { useQuery } from '@tanstack/react-query';
import { getDueInvoicesAttention } from '../actions.server';
import { DUE_INVOICES_ATTENTION_QUERY_KEY, DUE_INVOICES_TABLE_ID } from '../constants';

type AttentionData = Awaited<ReturnType<typeof getDueInvoicesAttention>>;

/**
 * Banda "vencimientos" (con permiso de ver pagos). El número llega del servidor con el mismo `where` que la lista
 * filtrada por Días = Vencido y que el contador de la sub-navegación, y se refresca tras cada cambio (la clave
 * cuelga de la de la tabla). Si el filtro ya está aplicado, el botón no se ofrece.
 */
export function DueInvoicesAttention({
  initialData,
  serverDays = null,
}: {
  /** `null` cuando no corresponde o el conteo del servidor falló: no se muestra nada. */
  initialData: AttentionData;
  /** Filtro de días con el que se renderizó el servidor (evita el parpadeo antes de leer la URL). */
  serverDays?: string | null;
}) {
  const [days, setDays] = useDataTableFilter(DUE_INVOICES_TABLE_ID, 'days', serverDays);

  const { data } = useQuery({
    queryKey: DUE_INVOICES_ATTENTION_QUERY_KEY,
    queryFn: getDueInvoicesAttention,
    initialData,
    staleTime: 30 * 1000,
  });

  const overdue = data?.overdue ?? 0;
  if (overdue === 0) return null;

  return (
    <AttentionBanner
      live
      tone="danger"
      title={`${overdue} ${overdue === 1 ? 'vencimiento' : 'vencimientos'} para atender`}
      description="Comprobantes y cheques rechazados con saldo pendiente y fecha de vencimiento pasada."
      actions={
        days === 'overdue' ? null : (
          <Button type="button" size="sm" variant="outline" onClick={() => setDays('overdue')}>
            Ver {overdue === 1 ? 'el vencido' : `los ${overdue}`}
          </Button>
        )
      }
    />
  );
}
