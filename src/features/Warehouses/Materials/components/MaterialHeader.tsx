import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Field, FieldGrid } from '@/shared/components/common/FieldGrid';
import { MetricCard } from '@/shared/components/common/MetricCard';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { formatArgentinaDay, formatDateAr } from '@/shared/lib/argentina-time';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMaterialDetail } from '../../actions/materials-detail.server';
import { WarehouseStatusBadge } from '../../components/WarehouseStatusBadge';
import { formatMoney, formatQuantity, formatUnitCost } from '../../lib/format';
import { TRACKING_TYPE_LABELS, WRITE_OFF_REASON_LABELS } from '../../lib/labels';

/** Datos del material y su stock por deposito (y lote / unidades). */
export async function MaterialHeader({ materialId }: { materialId: string }) {
  const material = await getMaterialDetail(materialId);
  if (!material) notFound();
  const unit = material.unit.abbreviation;
  const unitsTruncated = material.unitsInStockTotal > material.unitsInStock.length;
  const writeOffsTruncated = material.writeOffsTotal > material.writeOffs.length;

  return (
    <div className="space-y-4">
      <RecordHeader
        identity={
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-muted-foreground font-mono text-sm">{material.code}</span>
            <h1 className="text-2xl font-semibold">{material.name}</h1>
            <Badge variant="secondary">{TRACKING_TYPE_LABELS[material.trackingType]}</Badge>
            {!material.isActive && <Badge variant="outline">Inactivo</Badge>}
            {material.requiresApproval && <Badge variant="outline">Requiere aprobación</Badge>}
            {material.stockLevel && <WarehouseStatusBadge entity="stockLevel" status={material.stockLevel} />}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Stock total"
          value={
            <>
              {formatQuantity(material.totalStock)}{' '}
              <span className="text-muted-foreground text-base font-normal">{unit}</span>
            </>
          }
          hint={material.stockLevel ? `Mínimo: ${formatQuantity(material.minStock)} ${unit}` : undefined}
          tone={material.stockLevel === 'OUT_OF_STOCK' ? 'danger' : material.stockLevel ? 'warn' : 'default'}
        />
        {material.averageCost !== null && (
          <>
            <MetricCard label="Costo promedio" value={formatUnitCost(material.averageCost)} />
            <MetricCard label="Valorizado" value={formatMoney(material.stockValue)} />
          </>
        )}
      </div>

      <SectionCard title="Datos del material">
        <FieldGrid>
          <Field label="Categoría" value={material.category ?? 'Sin categoría'} />
          <Field label="Unidad" value={material.unit.name} />
          <Field
            label="Stock mínimo"
            value={material.minStock ? `${formatQuantity(material.minStock)} ${unit}` : 'Sin definir'}
          />
          {material.description && <Field label="Descripción" value={material.description} />}
        </FieldGrid>
      </SectionCard>

      <SectionCard title="Stock por depósito">
        {material.stock.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">Sin stock en ningún depósito.</p>
        ) : (
          <div className="overflow-x-auto">
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
                    {material.trackingType === 'BATCH' && (
                      <TableCell className="font-mono text-sm">{row.batch ?? '—'}</TableCell>
                    )}
                    {material.trackingType === 'BATCH' && (
                      <TableCell className="tabular-nums">
                        {row.expiresAt ? formatDateAr(row.expiresAt) : '—'}
                      </TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(row.quantity)} {unit}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {material.trackingType === 'SERIAL' && material.unitsInStock.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium tabular-nums">
              Unidades en depósito
              {unitsTruncated && (
                <span className="text-muted-foreground font-normal">
                  {' '}
                  (primeras {material.unitsInStock.length} de {material.unitsInStockTotal.toLocaleString('es-AR')})
                </span>
              )}
            </p>
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
      </SectionCard>

      {material.trackingType === 'SERIAL' && (material.unitsOnLoan.length > 0 || material.writeOffs.length > 0) && (
        <SectionCard title="Préstamos">
          <div className="space-y-4">
            {material.unitsOnLoan.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium tabular-nums">Unidades prestadas ({material.unitsOnLoan.length})</p>
                <div className="overflow-x-auto">
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
                            {loan.since
                              ? `${formatDateAr(loan.since)} (${loan.days} ${loan.days === 1 ? 'día' : 'días'})`
                              : '—'}
                          </TableCell>
                          <TableCell>
                            {loan.exitMovementId ? (
                              <Link
                                href={`/dashboard/warehouse/movements/${loan.exitMovementId}`}
                                className="font-mono hover:underline"
                              >
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
              </div>
            )}
            {material.writeOffs.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium tabular-nums">
                  Dadas de baja ({material.writeOffsTotal.toLocaleString('es-AR')})
                  {writeOffsTruncated && (
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      · se muestran las últimas {material.writeOffs.length}
                    </span>
                  )}
                </p>
                <div className="overflow-x-auto">
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
                          <TableCell className="tabular-nums">{formatArgentinaDay(w.date)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
