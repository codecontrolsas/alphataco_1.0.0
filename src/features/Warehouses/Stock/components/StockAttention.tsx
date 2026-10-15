'use client';

import { Button } from '@/components/ui/button';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useDataTableFilter } from '@/shared/components/common/DataTable';
import { PARAM_SEPARATOR } from '@/shared/components/common/DataTable/helpers';
import { MetricCard } from '@/shared/components/common/MetricCard';
import { formatDateAr } from '@/shared/lib/argentina-time';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { EXPIRING_WINDOW_DAYS } from '../../lib/batch-expiry';
import { formatMoney } from '../../lib/format';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { MATERIALS_TABLE_ID, STOCK_TABLE_ID } from '../constants';
import { getStockAttention } from './StockList/actions.server';

type AttentionData = Awaited<ReturnType<typeof getStockAttention>>;

/**
 * Contrato con la lista de Materiales: su filtro booleano `below_min` ("true" = bajo mínimo, agotados
 * incluidos). Stock NO lista los agotados (solo saldos con cantidad > 0), por eso el botón de bajo
 * mínimo lleva a Materiales y no filtra esta tabla.
 */
const MATERIALS_BELOW_MIN_HREF = `/dashboard/warehouse?tab=materiales&${MATERIALS_TABLE_ID}${PARAM_SEPARATOR}below_min=true`;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-AR')} ${n === 1 ? one : many}`;

/**
 * Banda de atención + tarjetas de Stock: materiales bajo mínimo (conteo de materiales, el mismo del contador
 * de la sub-navegación) y lotes vencidos / por vencer. El valorizado total solo llega con `view_prices`.
 */
export function StockAttention({ initialData }: { initialData: AttentionData }) {
  const { data } = useQuery({
    queryKey: WAREHOUSE_QUERY_KEYS.stockAttention,
    queryFn: () => getStockAttention(),
    initialData,
    staleTime: 30 * 1000,
  });
  const [expiresTo, , setFilters] = useDataTableFilter(STOCK_TABLE_ID, 'expires_at_to');

  // `null`: sin permiso o el conteo del servidor falló. No se muestra nada (nunca un 0 inventado).
  if (!data) return null;

  const { belowMin, expired, expiring, expiringUntil, valued } = data;
  const batches = expired + expiring;
  const expiryApplied = expiresTo === expiringUntil;

  const titleParts = [
    belowMin > 0 && plural(belowMin, 'material bajo su mínimo', 'materiales bajo su mínimo'),
    expired > 0 && plural(expired, 'lote vencido', 'lotes vencidos'),
    expiring > 0 && plural(expiring, `lote vence en ${EXPIRING_WINDOW_DAYS} días`, `lotes vencen en ${EXPIRING_WINDOW_DAYS} días`),
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <AttentionBanner
        live
        tone={expired > 0 ? 'danger' : 'warn'}
        title={titleParts.length > 0 ? titleParts.join(' · ') : null}
        description={
          expired > 0
            ? 'Los lotes vencidos no pueden salir ni transferirse: se dan de baja con un ajuste.'
            : 'Revisalos antes de que afecten la operación.'
        }
        actions={
          <>
            {belowMin > 0 && (
              <Button asChild size="sm" variant="outline">
                <Link href={MATERIALS_BELOW_MIN_HREF}>Ver materiales bajo mínimo</Link>
              </Button>
            )}
            {batches > 0 && !expiryApplied && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setFilters({ expires_at_from: null, expires_at_to: expiringUntil })}
              >
                Ver {plural(batches, 'lote', 'lotes')} en la tabla
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Bajo mínimo"
          value={belowMin.toLocaleString('es-AR')}
          hint="Materiales, agotados incluidos"
          tone={belowMin > 0 ? 'warn' : 'default'}
        />
        <MetricCard
          label="Lotes por vencer"
          value={batches.toLocaleString('es-AR')}
          hint={`${plural(expired, 'vencido', 'vencidos')} · vencen hasta el ${formatDateAr(expiringUntil)}`}
          tone={expired > 0 ? 'danger' : batches > 0 ? 'warn' : 'default'}
        />
        {valued != null && (
          <MetricCard label="Valorizado total" value={formatMoney(valued)} hint="Cantidad × costo promedio" />
        )}
      </div>
    </div>
  );
}
