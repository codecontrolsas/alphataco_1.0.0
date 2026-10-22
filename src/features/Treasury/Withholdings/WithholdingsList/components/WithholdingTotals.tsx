'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { sumAmounts } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { formatMoney } from '@/features/Warehouses/lib/format';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { useQuery } from '@tanstack/react-query';
import { TREASURY_QUERY_KEYS } from '../../../lib/query-keys';
import { CUSTOMER_WITHHOLDING_TAX_LABELS } from '../../../schemas/receipts';
import { getWithholdingTotalsByTax } from '../actions.server';
import { withholdingTaxIcons } from '../columns';

/** Totales por impuesto del filtro activo; se refrescan con la tabla (misma clave base y mismos params). */
export function WithholdingTotals({ params }: { params: DataTableSearchParams }) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [...TREASURY_QUERY_KEYS.withholdings, 'totals', params],
    queryFn: () => getWithholdingTotalsByTax(params),
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="mb-4 flex flex-wrap gap-2" aria-busy="true">
        <Skeleton className="h-16 w-40" />
        <Skeleton className="h-16 w-40" />
      </div>
    );
  }

  if (isError) {
    return (
      <StateBlock
        variant="error"
        title="No se pudieron calcular los totales"
        description="La consulta falló: los totales no están disponibles."
        action={
          <Button type="button" variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
            Reintentar
          </Button>
        }
        className="mb-4 py-4"
      />
    );
  }

  if (!data || data.length === 0) {
    return <p className="mb-4 text-sm text-muted-foreground">No hay retenciones en el período filtrado.</p>;
  }

  const grandTotal = sumAmounts(data.map((row) => row.total));

  return (
    <div className="mb-4 flex flex-wrap items-stretch gap-2" data-testid="treasury-withholding-totals">
      {data.map((row) => {
        const Icon = withholdingTaxIcons[row.tax];
        return (
          <div key={row.tax} className="min-w-40 rounded-md border bg-muted/30 px-3 py-2">
            <Badge variant="outline" className="gap-1">
              <Icon className="h-3 w-3" />
              {CUSTOMER_WITHHOLDING_TAX_LABELS[row.tax]}
            </Badge>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(row.total)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {row.count} {row.count === 1 ? 'retención' : 'retenciones'}
            </p>
          </div>
        );
      })}
      <div className="min-w-40 rounded-md border px-3 py-2">
        <p className="text-sm font-medium text-muted-foreground">Total</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(grandTotal)}</p>
      </div>
    </div>
  );
}
