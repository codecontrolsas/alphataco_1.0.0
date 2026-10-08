import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import moment from 'moment';
import Link from 'next/link';
import { getMaterialKardex } from '../../actions/materials-detail.server';
import { formatQuantity, formatUnitCost } from '../../lib/format';
import { MOVEMENT_TYPE_LABELS } from '../../lib/labels';

/**
 * Kardex del material. Es una tabla fija y no un DataTable a proposito: el saldo y el promedio
 * acumulados solo tienen sentido en orden de registro; ordenar o filtrar las filas los volveria
 * numeros sueltos. Para buscar movimientos con filtros esta la tabla de Movimientos.
 */
export async function MaterialKardex({ materialId, unit }: { materialId: string; unit: string }) {
  const rows = await getMaterialKardex(materialId);
  const showPrices = rows.some((r) => r.unitCost !== null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kardex</CardTitle>
        <CardDescription>
          Todos los movimientos del material en el orden en que se registraron, con el saldo de la empresa
          {showPrices ? ' y el costo promedio' : ''} después de cada uno.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">El material todavía no tiene movimientos.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Movimiento</TableHead>
                  <TableHead>Depósito</TableHead>
                  <TableHead>Destino / lote / serie</TableHead>
                  <TableHead className="text-right">Entrada</TableHead>
                  <TableHead className="text-right">Salida</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  {showPrices && <TableHead className="text-right">Costo unit.</TableHead>}
                  {showPrices && <TableHead className="text-right">Promedio</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{moment(row.occurredOn).format('DD/MM/YYYY')}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link href={`/dashboard/warehouse/movements/${row.movementId}`} className="font-mono hover:underline">
                        {row.number}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {MOVEMENT_TYPE_LABELS[row.type]}
                        {row.isReversal ? ' (anulación)' : ''}
                      </span>
                    </TableCell>
                    <TableCell>{row.warehouse}</TableCell>
                    <TableCell className="text-sm">
                      {[row.destination, row.batch && `Lote ${row.batch}`, row.serialNumber && `S/N ${row.serialNumber}`]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.inbound ? formatQuantity(row.inbound) : row.transferred ? <span className="text-muted-foreground">{formatQuantity(row.transferred)} ⇄</span> : ''}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.outbound ? formatQuantity(row.outbound) : ''}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatQuantity(row.balance)} {unit}
                    </TableCell>
                    {showPrices && <TableCell className="text-right tabular-nums">{formatUnitCost(row.unitCost)}</TableCell>}
                    {showPrices && <TableCell className="text-right tabular-nums">{formatUnitCost(row.averageCost)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
