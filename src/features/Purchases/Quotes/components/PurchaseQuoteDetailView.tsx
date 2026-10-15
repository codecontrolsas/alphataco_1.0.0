import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney, formatQuantity, formatUnitCost } from '@/features/Warehouses/lib/format';
import { VAT_RATE_LABELS, isVatRateId } from '@/shared/lib/arca/catalogs';
import { Paperclip } from 'lucide-react';
import { argentinaDate, formatDateAr } from '@/shared/lib/argentina-time';
import Link from 'next/link';
import type { PurchaseQuoteDetail } from '../../lib/quote-query-types';
import { HistoryCard } from '../../components/HistoryCard';
import { PurchaseOrderStatusBadge } from '../../Orders/components/PurchaseOrderStatusBadge';
import { PurchaseQuoteActions } from './PurchaseQuoteActions';
import { PurchaseQuoteStatusBadge } from './PurchaseQuoteStatusBadge';
import { Field, FieldGrid } from '@/shared/components/common/FieldGrid';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';

const date = (value: string | null) => (value ? formatDateAr(value) : '—');

/** Detalle del pedido de cotizacion: proveedor, lineas con lo cotizado, respuesta, OC e historial. */
export function PurchaseQuoteDetailView({ quote }: { quote: PurchaseQuoteDetail }) {
  const answered = quote.status === 'RECEIVED';
  const expired = quote.validUntil !== null && quote.validUntil < argentinaDate();

  return (
    <div className="space-y-4">
      <RecordHeader
        identity={
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold">{quote.number}</h1>
            <PurchaseQuoteStatusBadge status={quote.status} />
          </div>
        }
        actions={<PurchaseQuoteActions quote={quote} />}
      />

      <SectionCard title="Datos del pedido">
          <FieldGrid>
            <Field label="Proveedor">
              <Link href={`/dashboard/purchases/suppliers/${quote.supplier.id}`} className="hover:underline">
                {quote.supplier.name}
              </Link>
            </Field>
            <Field label="Solicitudes">
              <span className="flex flex-wrap gap-2">
                {quote.requests.map((request) => (
                  <Link key={request.id} href={`/dashboard/purchases/requests/${request.id}`} className="font-mono underline">
                    {request.number}
                  </Link>
                ))}
              </span>
            </Field>
            {(answered || quote.status === 'DECLINED') && <Field label="Respondida">{date(quote.receivedAt)}</Field>}
            {answered && (
              <Field label="Válida hasta">
                <span className={expired ? 'text-destructive' : undefined}>
                  {date(quote.validUntil)}
                  {expired && ' (vencida)'}
                </span>
              </Field>
            )}
            {answered && <Field label="Plazo de entrega">{quote.deliveryDays === null ? '—' : `${quote.deliveryDays} días`}</Field>}
            {quote.attachment && (
              <Field label="Presupuesto">
                <a href={quote.attachment.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                  <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                  {quote.attachment.name}
                </a>
              </Field>
            )}
            {quote.notes && (
              <div className="sm:col-span-2 xl:col-span-3">
                <Field label="Observaciones para el proveedor">
                  <span className="whitespace-pre-wrap">{quote.notes}</span>
                </Field>
              </div>
            )}
            {quote.supplierNotes && (
              <div className="sm:col-span-2 xl:col-span-3">
                <Field label="Notas del proveedor">
                  <span className="whitespace-pre-wrap">{quote.supplierNotes}</span>
                </Field>
              </div>
            )}
          </FieldGrid>
      </SectionCard>

      <SectionCard title="Qué se cotiza">
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ítem</TableHead>
                  <TableHead>Solicitud</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  {answered && <TableHead className="text-right">Unitario neto</TableHead>}
                  {answered && <TableHead className="text-right">IVA</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {quote.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.itemLabel}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{line.request.number}</span>
                      <span className="text-xs text-muted-foreground"> · línea {line.requestPosition}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(line.quantity)} {line.unitAbbr}
                    </TableCell>
                    {answered && (
                      <TableCell className="text-right tabular-nums">
                        {line.notQuoted ? <span className="text-muted-foreground">No cotiza</span> : line.unitPrice ? formatUnitCost(line.unitPrice) : '—'}
                      </TableCell>
                    )}
                    {answered && (
                      <TableCell className="text-right tabular-nums">
                        {line.vatRateId !== null && isVatRateId(line.vatRateId) ? VAT_RATE_LABELS[line.vatRateId] : ''}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {quote.totals && (
            <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-1 text-sm tabular-nums">
              <dt className="text-muted-foreground">Subtotal neto</dt>
              <dd className="text-right">{formatMoney(quote.totals.subtotal)}</dd>
              <dt className="text-muted-foreground">IVA</dt>
              <dd className="text-right">{formatMoney(quote.totals.vatTotal)}</dd>
              <dt className="font-medium">Total cotizado</dt>
              <dd className="text-right font-medium">{formatMoney(quote.totals.total)}</dd>
            </dl>
          )}
        </div>
      </SectionCard>

      {quote.orders.length > 0 && (
        <SectionCard title="Órdenes de compra">
          <ul className="space-y-2">
            {quote.orders.map((order) => (
              <li key={order.id} className="flex items-center gap-3 text-sm">
                <Link href={`/dashboard/purchases/orders/${order.id}`} className="font-mono underline">
                  {order.number}
                </Link>
                <PurchaseOrderStatusBadge status={order.status} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <HistoryCard history={quote.history} />
    </div>
  );
}
