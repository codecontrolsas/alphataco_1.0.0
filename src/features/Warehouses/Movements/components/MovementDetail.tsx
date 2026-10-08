import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import moment from 'moment';
import Link from 'next/link';
import type { StockMovementDetail } from '../../actions/movements.server';
import { formatMoney, formatQuantity, formatUnitCost } from '../../lib/format';
import { DESTINATION_TYPE_LABELS, MOVEMENT_TYPE_LABELS } from '../../lib/labels';
import { ReverseMovementDialog } from './ReverseMovementDialog';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** Detalle de un movimiento: cabecera, destino, lineas y vinculo con su anulacion. */
export function MovementDetail({ movement }: { movement: StockMovementDetail }) {
  const showPrices = movement.totalCost !== null;
  const isTransfer = movement.type === 'TRANSFER';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold">{movement.number}</h1>
        <Badge variant="secondary">{MOVEMENT_TYPE_LABELS[movement.type]}</Badge>
        {movement.reverses && <Badge variant="outline">Anulación</Badge>}
        {movement.reversedBy && <Badge variant="destructive">Anulado</Badge>}
        <div className="ml-auto">
          {movement.canReverse && <ReverseMovementDialog movementId={movement.id} number={movement.number} />}
        </div>
      </div>

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

      <Card>
        <CardContent className="pt-6">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Fecha">{moment(movement.occurredOn).format('DD/MM/YYYY')}</Field>
            <Field label={isTransfer ? 'Origen → destino' : 'Depósito'}>
              {isTransfer ? `${movement.warehouse.name} → ${movement.targetWarehouse?.name ?? ''}` : movement.warehouse.name}
            </Field>
            {movement.destinationType && (
              <Field label={`Imputado a (${DESTINATION_TYPE_LABELS[movement.destinationType]})`}>{movement.destination ?? '—'}</Field>
            )}
            <Field label="Referencia">{movement.reference ?? '—'}</Field>
            <Field label="Registrado por">
              {movement.createdBy} · {moment(movement.createdAt).format('DD/MM/YYYY HH:mm')}
            </Field>
            {showPrices && <Field label="Total">{formatMoney(movement.totalCost)}</Field>}
            {movement.notes && (
              <div className="sm:col-span-2 lg:col-span-4">
                <Field label={movement.type === 'ADJUSTMENT' || movement.reverses ? 'Motivo' : 'Observaciones'}>
                  <span className="whitespace-pre-wrap">{movement.notes}</span>
                </Field>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {movement.lines.length === 1 ? '1 línea' : `${movement.lines.length} líneas`}
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                        ? `${line.batch.number}${line.batch.expiresAt ? ` · vence ${moment(line.batch.expiresAt).format('DD/MM/YYYY')}` : ''}`
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
        </CardContent>
      </Card>
    </div>
  );
}
