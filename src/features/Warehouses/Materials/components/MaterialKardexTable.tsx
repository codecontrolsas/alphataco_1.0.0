'use client';

import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateAr } from '@/shared/lib/argentina-time';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { getMaterialKardexPage, type MaterialKardexRow } from '../../actions/materials-detail.server';
import { formatQuantity, formatUnitCost } from '../../lib/format';
import { MOVEMENT_TYPE_LABELS } from '../../lib/labels';

interface Props {
  materialId: string;
  unit: string;
  initialRows: MaterialKardexRow[];
  total: number;
  initialHasMore: boolean;
}

/** Filas del kardex (cronologicas) con "Ver anteriores": cada pedido trae la pagina previa ya con saldo y promedio. */
export function MaterialKardexTable({ materialId, unit, initialRows, total, initialHasMore }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const showPrices = rows.some((r) => r.unitCost !== null);

  const loadOlder = useMutation({
    mutationFn: (offset: number) => getMaterialKardexPage(materialId, offset),
    onSuccess: (page) => {
      setRows((current) => [...page.rows, ...current]);
      setHasMore(page.hasMore);
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs tabular-nums" role="status">
        Mostrando {rows.length.toLocaleString('es-AR')} de {total.toLocaleString('es-AR')} movimientos
      </p>
      {hasMore && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={loadOlder.isPending} onClick={() => loadOlder.mutate(rows.length)}>
            {loadOlder.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            Ver anteriores
          </Button>
          {loadOlder.isError && (
            <span role="alert" className="text-danger-subtle-foreground text-sm">
              No se pudieron cargar los movimientos anteriores. Reintentá.
            </span>
          )}
        </div>
      )}
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
                <TableCell className="whitespace-nowrap tabular-nums">{formatDateAr(row.occurredOn)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <Link href={`/dashboard/warehouse/movements/${row.movementId}`} className="font-mono hover:underline">
                    {row.number}
                  </Link>
                  <span className="text-muted-foreground ml-2 text-xs">
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
                  {row.inbound ? (
                    formatQuantity(row.inbound)
                  ) : row.transferred ? (
                    <span className="text-muted-foreground">{formatQuantity(row.transferred)} ⇄</span>
                  ) : (
                    ''
                  )}
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
    </div>
  );
}
