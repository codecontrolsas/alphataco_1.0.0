import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { formatCuit } from '@/features/Purchases/lib/supplier-ids';
import { formatMoney, formatQuantity } from '@/features/Warehouses/lib/format';
import { Field, FieldGrid } from '@/shared/components/common/FieldGrid';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { VAT_RATE_LABELS, isVatRateId } from '@/shared/lib/arca/catalogs';
import { formatDateAr } from '@/shared/lib/argentina-time';
import Link from 'next/link';
import { SupplierInvoiceStatusBadge } from '../../Invoices/components/SupplierInvoiceStatusBadge';
import { ExpiredSupplierDocumentsAlert } from '../../components/ExpiredSupplierDocumentsAlert';
import { HistoryCard } from '../../components/HistoryCard';
import { PriceText } from '../../components/PriceText';
import type { PurchaseOrderDetail } from '../../lib/order-query-types';
import { PurchaseOrderActions } from './PurchaseOrderActions';
import { PurchaseOrderStatusBadge } from './PurchaseOrderStatusBadge';

/** Estados en los que se muestra lo recibido por linea. */
const WITH_RECEIPTS = new Set(['SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED']);

/** Detalle de la OC: cabecera, condiciones, lineas con su solicitud de origen, totales e historial. */
export function PurchaseOrderDetailView({ order }: { order: PurchaseOrderDetail }) {
  const showReceipts = WITH_RECEIPTS.has(order.status);
  return (
    <div className="space-y-4">
      <RecordHeader
        identity={
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold">{order.number}</h1>
            <PurchaseOrderStatusBadge status={order.status} />
          </div>
        }
        actions={<PurchaseOrderActions order={order} />}
      />

      {order.rejectionNotes && (
        <AttentionBanner
          tone="danger"
          title="Rechazada: hay que corregirla"
          description={<span className="whitespace-pre-wrap">{order.rejectionNotes}</span>}
        />
      )}
      {order.complements && (
        <AttentionBanner
          tone="info"
          title="OC complementaria"
          description={
            <>
              Regulariza el excedente recibido en{' '}
              {order.complements.receipt ? (
                <Link
                  href={`/dashboard/purchases/receipts/${order.complements.receipt.id}`}
                  className="font-mono underline"
                >
                  {order.complements.receipt.number}
                </Link>
              ) : (
                'una recepción'
              )}{' '}
              de la orden{' '}
              <Link href={`/dashboard/purchases/orders/${order.complements.id}`} className="font-mono underline">
                {order.complements.number}
              </Link>
              . Lo recibido ya está en el depósito: al aprobarla queda recibida.
            </>
          }
        />
      )}
      {order.closeReason && order.status === 'CLOSED' && (
        <AttentionBanner
          tone="info"
          title="Cerrada sin recibir lo que faltaba"
          description={<span className="whitespace-pre-wrap">{order.closeReason}</span>}
        />
      )}
      {!['CANCELLED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED'].includes(order.status) && (
        <ExpiredSupplierDocumentsAlert supplierId={order.supplier.id} documents={order.expiredDocuments} />
      )}

      <SectionCard title="Datos de la orden">
        <FieldGrid>
          <Field label="Proveedor">
            <Link href={`/dashboard/purchases/suppliers/${order.supplier.id}`} className="hover:underline">
              {order.supplier.name}
            </Link>
            <span className="block text-xs font-normal text-muted-foreground tabular-nums">
              {formatCuit(order.supplier.cuit)}
            </span>
          </Field>
          <Field label="Fecha de entrega">{order.deliveryDate ? formatDateAr(order.deliveryDate) : 'Sin fecha'}</Field>
          <Field label="Lugar de entrega" value={order.deliveryPlace} />
          <Field label="Plazo de pago">
            {order.paymentTermDays === null
              ? 'Sin plazo'
              : order.paymentTermDays === 0
                ? 'Contado'
                : `${order.paymentTermDays} días`}
          </Field>
          <Field label="Creada por" value={order.creator} />
          {order.quote && (
            <Field label="Cotización">
              <Link href={`/dashboard/purchases/quotes/${order.quote.id}`} className="font-mono underline">
                {order.quote.number}
              </Link>
            </Field>
          )}
          {order.notes && (
            <div className="sm:col-span-2 xl:col-span-3">
              <Field label="Observaciones">
                <span className="whitespace-pre-wrap">{order.notes}</span>
              </Field>
            </div>
          )}
        </FieldGrid>
      </SectionCard>

      <SectionCard title="Qué se compra">
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Ítem</TableHead>
                  <TableHead>Solicitud</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Unitario neto</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  {showReceipts && <TableHead className="text-right">Recibido</TableHead>}
                  {showReceipts && <TableHead className="text-right">Falta recibir</TableHead>}
                  {showReceipts && <TableHead className="text-right">Facturado</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((line, i) => (
                  <TableRow key={line.id}>
                    <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>{line.itemLabel}</TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/purchases/requests/${line.request.id}`}
                        className="font-mono text-xs underline"
                      >
                        {line.request.number}
                      </Link>
                      <span className="text-xs text-muted-foreground"> · línea {line.requestPosition}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(line.quantity)} {line.unitAbbr}
                    </TableCell>
                    <TableCell className="text-right">
                      <PriceText value={line.unitPrice} canViewPrices={order.canViewPrices} unit />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {isVatRateId(line.vatRateId) ? VAT_RATE_LABELS[line.vatRateId] : ''}
                    </TableCell>
                    <TableCell className="text-right">
                      <PriceText value={line.netTotal} canViewPrices={order.canViewPrices} />
                    </TableCell>
                    {showReceipts && (
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(line.received)} {line.unitAbbr}
                      </TableCell>
                    )}
                    {showReceipts && (
                      <TableCell className="text-right tabular-nums">
                        {Number(line.pendingReceipt) > 0
                          ? `${formatQuantity(line.pendingReceipt)} ${line.unitAbbr}`
                          : '—'}
                      </TableCell>
                    )}
                    {showReceipts && (
                      <TableCell className="text-right tabular-nums">
                        {Number(line.invoiced) !== 0 ? `${formatQuantity(line.invoiced)} ${line.unitAbbr}` : '—'}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-1 text-sm tabular-nums">
            <dt className="text-muted-foreground">Subtotal neto</dt>
            <dd className="text-right">
              <PriceText value={order.totals.subtotal} canViewPrices={order.canViewPrices} />
            </dd>
            <dt className="text-muted-foreground">IVA</dt>
            <dd className="text-right">
              <PriceText value={order.totals.vatTotal} canViewPrices={order.canViewPrices} />
            </dd>
            <dt className="font-medium">Total</dt>
            <dd className="text-right font-medium">
              <PriceText value={order.totals.total} canViewPrices={order.canViewPrices} />
            </dd>
          </dl>
        </div>
      </SectionCard>

      {(order.receipts.length > 0 || order.complementedBy.length > 0) && (
        <SectionCard title="Recepciones">
          <div className="space-y-3">
            <ul className="divide-y">
              {order.receipts.map((receipt) => (
                <li key={receipt.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <Link href={`/dashboard/purchases/receipts/${receipt.id}`} className="font-mono underline">
                    {receipt.number}
                  </Link>
                  <span className="tabular-nums">{formatDateAr(receipt.receivedOn)}</span>
                  {receipt.deliveryNote && <span className="text-muted-foreground">Remito {receipt.deliveryNote}</span>}
                  {receipt.cancelled && <span className="text-destructive">Anulada</span>}
                </li>
              ))}
            </ul>
            {order.complementedBy.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>OC complementaria por excedente:</span>
                {order.complementedBy.map((c) => (
                  <span key={c.id} className="flex items-center gap-1">
                    <Link href={`/dashboard/purchases/orders/${c.id}`} className="font-mono underline">
                      {c.number}
                    </Link>
                    <PurchaseOrderStatusBadge status={c.status} />
                  </span>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {order.invoices.length > 0 && (
        <SectionCard title="Comprobantes">
          <ul className="divide-y">
            {order.invoices.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <Link href={`/dashboard/purchases/invoices/${invoice.id}`} className="underline">
                  {invoice.label}
                </Link>
                <span className="tabular-nums">{formatDateAr(invoice.issueDate)}</span>
                <span className="tabular-nums">{formatMoney(invoice.total)}</span>
                <SupplierInvoiceStatusBadge status={invoice.status} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            «Facturado» suma facturas y notas de débito y resta notas de crédito; no cuenta los comprobantes anulados ni
            rechazados.
          </p>
        </SectionCard>
      )}

      <HistoryCard history={order.history} />
    </div>
  );
}
