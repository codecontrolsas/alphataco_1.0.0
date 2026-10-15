'use client';

import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { formatDateAr } from '@/shared/lib/argentina-time';
import { useQuery } from '@tanstack/react-query';
import { STALE_LOAN_DAYS } from '../../lib/loan-rules';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { getLoansAttention } from './LoansList/actions.server';

type AttentionData = Awaited<ReturnType<typeof getLoansAttention>>;

/**
 * Banda informativa: cuantos prestamos abiertos hay (el mismo numero que el contador de la sub-navegacion y
 * el total de la tabla), cuantos llevan `STALE_LOAN_DAYS` dias o mas (umbral unico en `lib/loan-rules.ts`)
 * y desde cuando el mas antiguo. Con alguno viejo la banda pasa a tono de advertencia.
 */
export function LoansAttention({ initialData }: { initialData: AttentionData }) {
  const { data } = useQuery({
    queryKey: WAREHOUSE_QUERY_KEYS.loansAttention,
    queryFn: () => getLoansAttention(),
    initialData,
    staleTime: 30 * 1000,
  });

  if (!data || data.open === 0) return null;

  const { open, stale, oldest } = data;
  const staleText =
    stale > 0
      ? `${stale.toLocaleString('es-AR')} ${stale === 1 ? 'lleva' : 'llevan'} ${STALE_LOAN_DAYS} días o más. `
      : '';
  return (
    <AttentionBanner
      live
      tone={stale > 0 ? 'warn' : 'info'}
      title={`${open.toLocaleString('es-AR')} ${open === 1 ? 'préstamo abierto' : 'préstamos abiertos'}`}
      description={
        oldest
          ? `${staleText}El más antiguo es desde el ${formatDateAr(oldest.since)}${
              oldest.days != null ? ` (${oldest.days} ${oldest.days === 1 ? 'día' : 'días'})` : ''
            }: serie ${oldest.serialNumber}.`
          : `${staleText}Herramientas con número de serie que salieron y todavía no volvieron.`
      }
    />
  );
}
