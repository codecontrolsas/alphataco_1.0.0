import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMaterialDetail } from '../../actions/materials-detail.server';
import { formatMoney, formatQuantity, formatUnitCost } from '../../lib/format';
import { TRACKING_TYPE_LABELS, WRITE_OFF_REASON_LABELS } from '../../lib/labels';

/** Datos del material y su stock por deposito (y lote / unidades). */
export async function MaterialHeader({ materialId }: { materialId: string }) {
  const material = await getMaterialDetail(materialId);
  if (!material) notFound();
  const unit = material.unit.abbreviation;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-muted-foreground">{material.code}</span>
        <h1 className="text-2xl font-semibold">{material.name}</h1>
        <Badge variant="secondary">{TRACKING_TYPE_LABELS[material.trackingType]}</Badge>
        {!material.isActive && <Badge variant="outline">Inactivo</Badge>}
        {material.requiresApproval && <Badge variant="outline">Requiere aprobación</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Stock total</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatQuantity(material.totalStock)} <span className="text-base font-normal text-muted-foreground">{unit}</span>
            </p>
            {material.belowMinimum && (
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                Por debajo del mínimo ({formatQuantity(material.minStock)} {unit})
              </p>
            )}
          </CardContent>
        </Card>
        {material.averageCost !== null && (
          <>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Costo promedio</p>
                <p className="text-2xl font-semibold tabular-nums">{formatUnitCost(material.averageCost)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Valorizado</p>
                <p className="text-2xl font-semibold tabular-nums">{formatMoney(material.stockValue)}</p>
              </CardContent>
            </Card>
          </>
        )}
        <Card>
          <CardContent className="space-y-1 pt-6 text-sm">
            <p>
              <span className="text-muted-foreground">Categoría:</span> {material.category ?? 'Sin categoría'}
            </p>
            <p>
              <span className="text-muted-foreground">Unidad:</span> {material.unit.name}
            </p>
            <p>
              <span className="text-muted-foreground">Mínimo:</span>{' '}
              {material.minStock ? `${formatQuantity(material.minStock)} ${unit}` : 'Sin definir'}
            </p>
          </CardContent>
        </Card>
      </div>

      {material.description && <p className="text-sm text-muted-foreground">{material.description}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stock por depósito</CardTitle>
        </CardHeader>
        <CardContent>
          {material.stock.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sin stock en ningún depósito.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Depósito</TableHead>
                  {material.trackingType === 'BATCH' && <TableHead>Lote</TableHead>}
                  {material.trackingType === 'BATCH' && <TableHead>Vencimiento</TableHead>}
                  <TableHead className="text-right">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {material.stock.map((row, i) => (
                  <TableRow key={`${row.warehouse.id}-${row.batch ?? i}`}>
                    <TableCell>{row.warehouse.name}</TableCell>
                    {material.trackingType === 'BATCH' && <TableCell className="font-mono text-sm">{row.batch ?? '—'}</TableCell>}
                    {material.trackingType === 'BATCH' && (
                      <TableCell>{row.expiresAt ? moment(row.expiresAt).format('DD/MM/YYYY') : '—'}</TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(row.quantity)} {unit}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {material.trackingType === 'SERIAL' && material.unitsInStock.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium">Unidades en depósito</p>
              <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {material.unitsInStock.map((u) => (
                  <li key={u.id} className="rounded border px-2 py-1">
                    <span className="font-mono">{u.serialNumber}</span>
                    <span className="text-muted-foreground"> · {u.warehouse ?? '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {material.trackingType === 'SERIAL' && (material.unitsOnLoan.length > 0 || material.writeOffs.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Préstamos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {material.unitsOnLoan.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium tabular-nums">Unidades prestadas ({material.unitsOnLoan.length})</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serie</TableHead>
                      <TableHead>En poder de</TableHead>
                      <TableHead>Desde</TableHead>
                      <TableHead>Salida</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {material.unitsOnLoan.map((loan) => (
                      <TableRow key={loan.unitId}>
                        <TableCell className="font-mono text-sm">{loan.serialNumber}</TableCell>
                        <TableCell>{loan.holder ?? '—'}</TableCell>
                        <TableCell className="tabular-nums">
                          {loan.since ? `${moment(loan.since).format('DD/MM/YYYY')} (${loan.days} días)` : '—'}
                        </TableCell>
                        <TableCell>
                          {loan.exitMovementId ? (
                            <Link href={`/dashboard/warehouse/movements/${loan.exitMovementId}`} className="font-mono hover:underline">
                              {loan.exitNumber}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {material.writeOffs.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium tabular-nums">Dadas de baja ({material.writeOffs.length})</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serie</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>La tenía</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {material.writeOffs.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell className="font-mono text-sm">{w.serialNumber}</TableCell>
                        <TableCell>
                          {WRITE_OFF_REASON_LABELS[w.reason]}
                          <span className="block text-xs text-muted-foreground">{w.notes}</span>
                        </TableCell>
                        <TableCell>{w.holder ?? '—'}</TableCell>
                        <TableCell className="tabular-nums">{moment(w.date).format('DD/MM/YYYY')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
