'use client';

import { Button } from '@/components/ui/button';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useDataTableFilter } from '@/shared/components/common/DataTable';
import { useQuery } from '@tanstack/react-query';
import { PENDING_INVOICING_STATUS } from '../lib/attention';
import { CERTIFICATIONS_ATTENTION_QUERY_KEY } from '../lib/query-keys';
import { getCertificationAttention } from '../list/actions.server';
import { CERTIFICATIONS_TABLE_ID } from '../list/constants';

type AttentionData = Awaited<ReturnType<typeof getCertificationAttention>>;

/**
 * Banda "N certificaciones confirmadas sin facturar". El número llega del servidor y se refresca solo
 * tras cualquier transición (se invalida el prefijo de las consultas de certificaciones). El botón
 * escribe el filtro de Estado de la tabla; si ya está aplicado, no se ofrece.
 */
export function CertificationsAttention({
  initialData,
  serverStatus = null,
}: {
  /** `null` cuando el conteo del servidor falló: no se muestra nada. */
  initialData: AttentionData;
  /** Filtro de estado con el que se renderizó el servidor (evita el parpadeo antes de leer la URL). */
  serverStatus?: string | null;
}) {
  const [status, setStatus] = useDataTableFilter(CERTIFICATIONS_TABLE_ID, 'status', serverStatus);

  const { data } = useQuery({
    queryKey: CERTIFICATIONS_ATTENTION_QUERY_KEY,
    queryFn: () => getCertificationAttention(),
    initialData,
    staleTime: 30 * 1000,
  });

  const count = data?.pendingInvoicing ?? 0;
  if (count === 0) return null;

  const alreadyFiltered = status === PENDING_INVOICING_STATUS;

  return (
    <AttentionBanner
      live
      tone="warn"
      title={`${count} ${count === 1 ? 'certificación confirmada sin facturar' : 'certificaciones confirmadas sin facturar'}`}
      description="Están listas para incluirse en una factura."
      actions={
        alreadyFiltered ? null : (
          <Button type="button" size="sm" variant="outline" onClick={() => setStatus(PENDING_INVOICING_STATUS)}>
            Ver {count === 1 ? 'la confirmada' : `las ${count}`}
          </Button>
        )
      }
    />
  );
}
