'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney, formatQuantity } from '@/features/Warehouses/lib/format';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { VAT_RATE_LABELS, isVatRateId } from '@/shared/lib/arca/catalogs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FilePlus2, Trophy } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PurchaseQuoteStatusBadge } from '../../Quotes/components/PurchaseQuoteStatusBadge';
import { createPurchaseOrderFromQuote } from '../../actions/orders.server';
import { PriceText } from '../../components/PriceText';
import { invalidatePurchases } from '../../lib/invalidate';
import type { RequestQuoteComparison } from '../../lib/quote-query-types';

function OrderFromQuoteButton({ quoteId, supplierName }: { quoteId: string; supplierName: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => unwrapAction(await createPurchaseOrderFromQuote(quoteId)),
    onSuccess: ({ id, number, skipped }) => {
      toast.success(`Se creó la orden de compra ${number} para ${supplierName}`, {
        description:
          skipped > 0
            ? `Se omitieron ${skipped} líneas que ya estaban pedidas.`
            : 'Quedó en borrador: revisala y enviala a aprobación.',
      });
      invalidatePurchases(queryClient);
      router.push(`/dashboard/purchases/orders/${id}/edit`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo generar la orden de compra'),
  });
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="w-full"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      <FilePlus2 className="mr-1 h-4 w-4" />
      {mutation.isPending ? 'Generando…' : 'Generar OC'}
    </Button>
  );
}

/**
 * Comparativo de cotizaciones de la solicitud: una columna por proveedor, una fila por linea, con
 * el menor unitario neto de cada linea resaltado. En el telefono scrollea dentro de la tarjeta.
 */
export function QuoteComparison({ comparison }: { comparison: RequestQuoteComparison }) {
  if (comparison.columns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cotizaciones</CardTitle>
          <CardDescription>Todavía no se pidió cotización de esta solicitud.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cotizaciones</CardTitle>
        <CardDescription>
          {comparison.canViewPrices
            ? 'Precio unitario neto de cada proveedor. Resaltado, el menor de cada línea.'
            : 'Respuesta de cada proveedor. Los importes no están disponibles con tu permiso.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b align-bottom">
                <th className="p-2 text-left font-medium text-muted-foreground">Línea</th>
                {comparison.columns.map((column) => (
                  <th key={column.quoteId} className="min-w-40 p-2 text-left font-medium">
                    <Link href={`/dashboard/purchases/quotes/${column.quoteId}`} className="hover:underline">
                      {column.supplierName}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs font-normal text-muted-foreground">
                      <span className="font-mono">{column.number}</span>
                      <PurchaseQuoteStatusBadge status={column.status} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.lineId} className="border-b">
                  <td className="p-2">
                    <div>
                      {row.position}. {row.itemLabel}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatQuantity(row.quantity)} {row.unitAbbr}
                    </div>
                  </td>
                  {comparison.columns.map((column) => {
                    const cell = row.cells[column.quoteId];
                    const best = row.bestQuoteIds.includes(column.quoteId);
                    return (
                      <td
                        key={column.quoteId}
                        className={
                          best ? 'bg-ok-subtle text-ok-subtle-foreground p-2 tabular-nums' : 'p-2 tabular-nums'
                        }
                      >
                        {!cell ? (
                          <span className="text-muted-foreground">No incluida</span>
                        ) : cell.state === 'not_quoted' ? (
                          <span className="text-muted-foreground">No cotiza</span>
                        ) : cell.state === 'pending' ? (
                          <span className="text-muted-foreground">Sin respuesta</span>
                        ) : (
                          <span className="flex items-center gap-1">
                            {best && <Trophy className="h-3.5 w-3.5 text-ok" aria-label="Mejor precio" />}
                            <PriceText value={cell.unitPrice} canViewPrices={comparison.canViewPrices} unit />
                            <span className="text-xs text-muted-foreground">
                              + IVA {isVatRateId(cell.vatRateId) ? VAT_RATE_LABELS[cell.vatRateId] : ''}
                            </span>
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="align-top">
                <td className="p-2 text-xs text-muted-foreground">Total con IVA · plazo · validez</td>
                {comparison.columns.map((column) => (
                  <td key={column.quoteId} className="space-y-1 p-2 text-xs">
                    <div className="text-sm font-medium tabular-nums">
                      {!comparison.canViewPrices ? (
                        <PriceText value={null} canViewPrices={false} />
                      ) : column.total ? (
                        formatMoney(column.total)
                      ) : (
                        '—'
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      {column.deliveryDays !== null ? `Entrega en ${column.deliveryDays} días` : 'Plazo sin informar'}
                    </div>
                    <div className={column.expired ? 'text-destructive' : 'text-muted-foreground'}>
                      {column.validUntil
                        ? `${column.expired ? 'Venció' : 'Válida hasta'} el ${moment(column.validUntil, 'YYYY-MM-DD').format('DD/MM/YYYY')}`
                        : 'Validez sin informar'}
                    </div>
                    {column.canOrder && (
                      <OrderFromQuoteButton quoteId={column.quoteId} supplierName={column.supplierName} />
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
