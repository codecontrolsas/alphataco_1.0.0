import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { formatQuantity } from '@/features/Warehouses/lib/format';
import { Field, FieldGrid } from '@/shared/components/common/FieldGrid';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { formatDateAr } from '@/shared/lib/argentina-time';
import { Paperclip } from 'lucide-react';
import Link from 'next/link';
import type { PurchaseReceiptDetail } from '../../actions/receipts.server';
import { HistoryCard } from '../../components/HistoryCard';
import { PurchaseOrderStatusBadge } from '../../Orders/components/PurchaseOrderStatusBadge';
import { PurchaseReceiptActions } from './PurchaseReceiptActions';
import { PurchaseReceiptStatusBadge } from './PurchaseReceiptStatusBadge';

/** Detalle de la recepcion: OC, deposito, remito, lineas, movimientos de stock y OC complementaria. */
export function PurchaseReceiptDetailView({ receipt }: { receipt: PurchaseReceiptDetail }) {
  return (
    <div className="space-y-4">
      <RecordHeader
        identity={
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold">{receipt.number}</h1>
            <PurchaseReceiptStatusBadge cancelled={receipt.cancelled} />
          </div>
        }
        actions={<PurchaseReceiptActions receipt={receipt} />}
      />

      {receipt.excessWithoutOrder && (
        <AttentionBanner
          tone="warn"
          title="Excedente sin OC"
          description="La OC complementaria del excedente se anuló: lo recibido de más sigue en el depósito sin orden que lo respalde. Resolvelo con una devolución o un ajuste en Almacenes."
        />
      )}
      {receipt.cancelled && receipt.cancelReason && (
        <AttentionBanner
          tone="danger"
          title="Anulada"
          description={<span className="whitespace-pre-wrap">{receipt.cancelReason}</span>}
        />
      )}

      <SectionCard title="Datos de la recepción">
        <FieldGrid>
            <Field label="Orden de compra">
              <Link href={`/dashboard/purchases/orders/${receipt.order.id}`} className="font-mono underline">
                {receipt.order.number}
              </Link>
            </Field>
            <Field label="Proveedor">
              <Link href={`/dashboard/purchases/suppliers/${receipt.supplier.id}`} className="hover:underline">
                {receipt.supplier.name}
              </Link>
            </Field>
            <Field label="Fecha de recepción">{formatDateAr(receipt.receivedOn)}</Field>
            <Field label="Remito">
              {receipt.deliveryNote}
              {receipt.attachment && (
                <a href={receipt.attachment.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 underline">
                  <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                  {receipt.attachment.name}
                </a>
              )}
            </Field>
            <Field label="Depósito">{receipt.warehouse?.name ?? 'Sin depósito (solo servicios)'}</Field>
            <Field label="Entrada a Almacenes">
              {receipt.movement ? (
                <Link href={`/dashboard/warehouse/movements/${receipt.movement.id}`} className="font-mono underline">
                  {receipt.movement.number}
                </Link>
              ) : (
                '—'
              )}
              {receipt.reversal && (
                <span className="text-muted-foreground">
                  {' '}
                  · anulada por{' '}
                  <Link href={`/dashboard/warehouse/movements/${receipt.reversal.id}`} className="font-mono underline">
                    {receipt.reversal.number}
                  </Link>
                </span>
              )}
            </Field>
            {receipt.complements.length > 0 && (
              <Field label="OC complementaria (excedente)">
                <span className="flex flex-wrap items-center gap-2">
                  {receipt.complements.map((c) => (
                    <span key={c.id} className="flex items-center gap-1">
                      <Link href={`/dashboard/purchases/orders/${c.id}`} className="font-mono underline">
                        {c.number}
                      </Link>
                      <PurchaseOrderStatusBadge status={c.status} />
                    </span>
                  ))}
                </span>
              </Field>
            )}
        </FieldGrid>
      </SectionCard>

      <SectionCard title="Qué llegó">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ítem</TableHead>
                  <TableHead>Solicitud</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Lote o series</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipt.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      {line.itemLabel}
                      {line.isExcess && <Badge variant="warning" className="ml-2">excedente</Badge>}
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/purchases/requests/${line.request.id}`} className="font-mono text-xs underline">
                        {line.request.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(line.quantity)} {line.unitAbbr}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {line.batchNumber
                        ? `Lote ${line.batchNumber}${line.batchExpiresOn ? ` · vence ${formatDateAr(line.batchExpiresOn)}` : ''}`
                        : line.serialNumbers.length > 0
                          ? line.serialNumbers.join(', ')
                          : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
      </SectionCard>

      <HistoryCard history={receipt.history} />
    </div>
  );
}
