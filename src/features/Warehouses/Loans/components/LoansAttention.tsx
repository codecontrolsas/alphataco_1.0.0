'use client';

import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { formatDateAr } from '@/shared/lib/argentina-time';
import { useQuery } from '@tanstack/react-query';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { getLoansAttention } from './LoansList/actions.server';

type AttentionData = Awaited<ReturnType<typeof getLoansAttention>>;

/**
 * Banda informativa: cuantos prestamos abiertos hay (el mismo numero que el contador de la sub-navegacion y
 * el total de la tabla) y desde cuando el mas antiguo. No hay fecha de devolucion prevista ni umbral de
 * "viejo" definido, asi que no se marca ninguno como vencido y no hay filtro que aplicar: la tabla ya
 * lista exactamente esos prestamos.
 */
export function LoansAttention({ initialData }: { initialData: AttentionData }) {
  const { data } = useQuery({
    queryKey: WAREHOUSE_QUERY_KEYS.loansAttention,
    queryFn: () => getLoansAttention(),
    initialData,
    staleTime: 30 * 1000,
  });

  if (!data || data.open === 0) return null;

  const { open, oldest } = data;
  return (
    <AttentionBanner
      live
      tone="info"
      title={`${open.toLocaleString('es-AR')} ${open === 1 ? 'préstamo abierto' : 'préstamos abiertos'}`}
      description={
        oldest
          ? `El más antiguo es desde el ${formatDateAr(oldest.since)}${
              oldest.days != null ? ` (${oldest.days} ${oldest.days === 1 ? 'día' : 'días'})` : ''
            }: serie ${oldest.serialNumber}.`
          : 'Herramientas con número de serie que salieron y todavía no volvieron.'
      }
    />
  );
}
