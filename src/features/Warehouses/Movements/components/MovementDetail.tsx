import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Field, FieldGrid } from '@/shared/components/common/FieldGrid';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';
import Link from 'next/link';
import type { StockMovementDetail } from '../../actions/movements.server';
import { formatMoney, formatQuantity, formatUnitCost } from '../../lib/format';
import { WarehouseStatusBadge } from '../../components/WarehouseStatusBadge';
import { DESTINATION_TYPE_LABELS } from '../../lib/labels';
import { ReverseMovementDialog } from './ReverseMovementDialog';

/** Tipo y vigencia del movimiento (la anulación o el haber sido anulado). */
export function MovementBadges({ movement }: { movement: StockMovementDetail }) {
  return (
    <>
      <WarehouseStatusBadge entity="movementType" status={movement.type} />
      {movement.reverses && <WarehouseStatusBadge entity="reversal" status="REVERSAL" />}
      {movement.reversedBy && <WarehouseStatusBadge entity="reversal" status="REVERSED" />}
    </>
  );
}

/** Detalle de un movimiento para su página: cabecera con la acción de anular y el cuerpo. */
export function MovementDetail({ movement }: { movement: StockMovementDetail }) {
  return (
    <div className="space-y-4">
      <RecordHeader
        identity={
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold">{movement.number}</h1>
            <MovementBadges movement={movement} />
          </div>
        }
        actions={
          movement.canReverse ? <ReverseMovementDialog movementId={movement.id} number={movement.number} /> : undefined
        }
      />
      <MovementDetailBody movement={movement} />
    </div>
  );
}

/** Cuerpo del detalle (avisos, datos y líneas): lo comparten la página y el panel lateral. */
export function MovementDetailBody({ movement }: { movement: StockMovementDetail }) {
  const showPrices = movement.totalCost !== null;
  const isTransfer = movement.type === 'TRANSFER';

  return (
    <div className="space-y-4">
      {movement.clothingDelivery && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          Entrega de ropa a {movement.destination ?? 'un empleado'}
          {movement.clothingDelivery.cancelled ? ' (entrega anulada)' : ''}. Se registró desde el panel de Ropa, con la
          firma del empleado.
        </p>
      )}

      {movement.tireServiceItem && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {movement.type === 'RETURN' ? 'Cubierta desmontada' : 'Cubierta montada'} en la orden de gomería del{' '}
          {movement.tireServiceItem.date} · {movement.tireServiceItem.vehicle}, posición {movement.tireServiceItem.position}
          {movement.tireServiceItem.open ? ' (orden abierta)' : ''}. Se corrige desde Gomería: cancelando la orden si
          sigue abierta.
        </p>
      )}

      {movement.materialRequest && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {movement.reverses ? 'Anula una entrega del pedido ' : 'Entrega del pedido '}
          <Link className="font-mono underline" href={`/dashboard/warehouse/requests/${movement.materialRequest.id}`}>
            {movement.materialRequest.number}
          </Link>
          .
        </p>
      )}

      {movement.returnedFrom && !movement.reverses && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          Devuelve el préstamo de{' '}
          <Link className="font-mono underline" href={`/dashboard/warehouse/movements/${movement.returnedFrom.id}`}>
            {movement.returnedFrom.number}
          </Link>
          : las unidades vuelven al depósito al costo con que salieron.
        </p>
      )}

      {(movement.reverses || movement.reversedBy) && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {movement.reverses ? (
            <>
              Anula a{' '}
              <Link className="font-mono underline" href={`/dashboard/warehouse/movements/${movement.reverses.id}`}>
                {movement.reverses.number}
              </Link>
              . Las cantidades de abajo tienen el efecto inverso al original.
            </>
          ) : (
            movement.reversedBy && (
              <>
                Anulado por{' '}
                <Link className="font-mono underline" href={`/dashboard/warehouse/movements/${movement.reversedBy.id}`}>
                  {movement.reversedBy.number}
                </Link>
                : su efecto sobre el stock ya está revertido.
              </>
            )
          )}
        </p>
      )}

      <SectionCard>
        <FieldGrid>
          <Field label="Fecha" value={formatDateAr(movement.occurredOn)} />
          <Field
            label={isTransfer ? 'Origen → destino' : 'Depósito'}
            value={isTransfer ? `${movement.warehouse.name} → ${movement.targetWarehouse?.name ?? ''}` : movement.warehouse.name}
          />
          {movement.destinationType && (
            <Field label={`Imputado a (${DESTINATION_TYPE_LABELS[movement.destinationType]})`} value={movement.destination} />
          )}
          <Field label="Referencia" value={movement.reference} />
          <Field label="Registrado por" value={`${movement.createdBy} · ${formatArgentinaDateTime(movement.createdAt)}`} />
          {showPrices && <Field label="Total" value={formatMoney(movement.totalCost)} />}
        </FieldGrid>
        {movement.notes && (
          <div className="mt-5 space-y-1">
            <h3 className="text-muted-foreground text-sm">
              {movement.type === 'ADJUSTMENT' || movement.reverses ? 'Motivo' : 'Observaciones'}
            </h3>
            <p className="font-medium break-words whitespace-pre-wrap">{movement.notes}</p>
          </div>
        )}
      </SectionCard>

      <SectionCard
        flush
        title={movement.lines.length === 1 ? '1 línea' : `${movement.lines.length} líneas`}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Lote / serie</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                {showPrices && <TableHead className="text-right">Costo unitario</TableHead>}
                {showPrices && <TableHead className="text-right">Total</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {movement.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <Link href={`/dashboard/warehouse/materials/${line.material.id}`} className="hover:underline">
                      <span className="font-mono text-xs text-muted-foreground">{line.material.code}</span>{' '}
                      {line.material.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {line.serialNumber ??
                      (line.batch
                        ? `${line.batch.number}${line.batch.expiresAt ? ` · vence ${formatDateAr(line.batch.expiresAt)}` : ''}`
                        : '—')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {/* El signo dice el efecto sobre el deposito del movimiento. */}
                    {line.direction === 1 ? '+' : '−'}
                    {formatQuantity(line.quantity)} {line.material.unit}
                  </TableCell>
                  {showPrices && <TableCell className="text-right tabular-nums">{formatUnitCost(line.unitCost)}</TableCell>}
                  {showPrices && <TableCell className="text-right tabular-nums">{formatMoney(line.totalCost)}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}
