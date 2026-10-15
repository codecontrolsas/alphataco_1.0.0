'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { exportToExcel, type ExcelColumn } from '@/shared/lib/excel-export';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileSpreadsheet, Plus } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { getCustomerStatementData, type CustomerStatementData } from '../../actions/customer-statement.server';
import { formatInCurrency } from '../../lib/currency-format';
import { TREASURY_QUERY_KEYS } from '../../lib/query-keys';
import { formatDay } from '../../lib/dates';

const tone = (value: string) => (value.startsWith('-') ? 'text-ok' : value === '0.00' ? '' : 'text-danger');

const KIND_LABELS: Record<CustomerStatementData['currencies'][number]['rows'][number]['kind'], string> = {
  INVOICE: 'Factura',
  DEBIT_NOTE: 'Nota de débito',
  CREDIT_NOTE: 'Nota de crédito',
  RECEIPT: 'Cobro',
  ADVANCE: 'Cobro a cuenta',
  ADVANCE_APPLIED: 'Anticipo aplicado',
  REJECTED_CHECK: 'Cheque rechazado',
};

/**
 * Cuenta corriente del cliente (spec Tesorería etapa 2 §4.6): saldo por moneda (sin convertir),
 * anticipos y saldo a favor, y el detalle del período con saldo anterior y acumulado. Saldo
 * positivo = el cliente debe.
 */
export function CustomerStatementView({ initial, canCreate }: { initial: CustomerStatementData; canCreate: boolean }) {
  const [range, setRange] = useState({ from: initial.from, to: initial.to });
  const validRange = range.from !== '' && range.to !== '' && range.to >= range.from;
  const isInitialRange = range.from === initial.from && range.to === initial.to;

  const { data, isFetching, refetch } = useQuery({
    queryKey: [...TREASURY_QUERY_KEYS.customerStatement, initial.customer.id, range.from, range.to],
    queryFn: () => getCustomerStatementData(initial.customer.id, range.from, range.to),
    initialData: isInitialRange ? initial : undefined,
    enabled: validRange,
    staleTime: 30 * 1000,
  });
  // Sin `?? initial`: si el rango nuevo falla (o aún carga) no se muestra ni se exporta el rango anterior.
  const statement = data ?? null;
  const credit = statement ? Object.entries(statement.creditBalance) : [];

  const excel = useMutation({
    mutationFn: async (current: CustomerStatementData) => {
      const money = (value: unknown) => (typeof value === 'string' && value !== '' ? Number(value) : null);
      const columns: ExcelColumn[] = [
        { key: 'currency', title: 'Moneda', width: 8 },
        { key: 'date', title: 'Fecha', width: 12 },
        { key: 'kind', title: 'Tipo', width: 18 },
        { key: 'label', title: 'Comprobante', width: 44 },
        { key: 'debit', title: 'Debe', width: 16, formatter: money },
        { key: 'credit', title: 'Haber', width: 16, formatter: money },
        { key: 'balance', title: 'Saldo', width: 16, formatter: money },
      ];
      const rows = current.currencies.flatMap((c) => [
        { currency: c.currency, date: formatDay(current.from), kind: '', label: 'Saldo anterior', debit: '', credit: '', balance: c.previous },
        ...c.rows.map((r) => ({
          currency: c.currency,
          date: formatDay(r.date),
          kind: KIND_LABELS[r.kind],
          label: r.label,
          debit: r.debit === '0.00' ? '' : r.debit,
          credit: r.credit === '0.00' ? '' : r.credit,
          balance: r.balance,
        })),
        { currency: c.currency, date: formatDay(current.to), kind: '', label: 'Saldo final', debit: '', credit: '', balance: c.closing },
      ]);
      await exportToExcel(rows, columns, {
        filename: `Cuenta corriente ${current.customer.name} ${current.from} a ${current.to}`,
        sheetName: 'Cuenta corriente',
        title: `Cuenta corriente · ${current.customer.name} · ${formatDay(current.from)} a ${formatDay(current.to)}`,
      });
    },
    onError: () => toast.error('No se pudo exportar el Excel'),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link href="/dashboard/treasury?tab=cobranzas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Cobranzas
          </Link>
          <h1 className="truncate text-xl font-semibold">{initial.customer.name}</h1>
          <p className="text-sm text-muted-foreground">CUIT {initial.customer.cuit} · cuenta corriente</p>
        </div>
        {canCreate && (
          <Button asChild size="sm">
            <Link href={`/dashboard/treasury/receipts/new?customerId=${initial.customer.id}`}>
              <Plus className="mr-1 h-4 w-4" />
              Nuevo recibo
            </Link>
          </Button>
        )}
      </div>

      {statement && (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statement.currencies.map((c) => (
          <Card key={c.currency}>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Saldo al {formatDay(statement.to)} en {c.currency === 'ARS' ? 'pesos' : c.currency}</p>
              <p className={`text-lg font-semibold tabular-nums ${tone(c.closing)}`}>{formatInCurrency(c.closing, c.currency)}</p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Anticipos disponibles</p>
            <p className="text-lg font-semibold tabular-nums">{formatInCurrency(statement.advancesAvailable, 'ARS')}</p>
          </CardContent>
        </Card>
        {credit.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Saldo a favor por notas de crédito</p>
              <p className="text-lg font-semibold tabular-nums">{credit.map(([currency, amount]) => formatInCurrency(amount, currency)).join(' · ')}</p>
            </CardContent>
          </Card>
        )}
      </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Movimientos</CardTitle>
            <CardDescription>{isFetching ? 'Actualizando…' : statement ? `Del ${formatDay(statement.from)} al ${formatDay(statement.to)}` : 'Sin datos para el período'}</CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <EnhancedDatePicker
                date={range.from ? moment(range.from, 'YYYY-MM-DD').toDate() : undefined}
                setDate={(d) => setRange((r) => ({ ...r, from: d ? moment(d).format('YYYY-MM-DD') : '' }))}
                placeholder="DD/MM/AAAA"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <EnhancedDatePicker
                date={range.to ? moment(range.to, 'YYYY-MM-DD').toDate() : undefined}
                setDate={(d) => setRange((r) => ({ ...r, to: d ? moment(d).format('YYYY-MM-DD') : '' }))}
                placeholder="DD/MM/AAAA"
              />
            </div>
            <Button type="button" variant="outline" size="sm" disabled={excel.isPending || isFetching || !statement} onClick={() => statement && excel.mutate(statement)}>
              <FileSpreadsheet className="mr-1 h-4 w-4" />
              Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!validRange && <p className="text-sm text-danger">Elegí un período válido: «Hasta» no puede ser anterior a «Desde».</p>}
          {!statement && validRange && (
            isFetching ? (
              <p className="py-6 text-center text-sm text-muted-foreground" aria-busy="true">Cargando el período…</p>
            ) : (
              <StateBlock
              variant="error"
              title="No se pudo cargar el período"
              description="La consulta falló o devolvió un período inválido. El Excel queda deshabilitado hasta que carguen los datos."
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                  Reintentar
                </Button>
              }
            />
            )
          )}
          {statement && statement.currencies.length === 0 && <p className="text-sm text-muted-foreground">El cliente no tiene comprobantes ni cobros.</p>}
          {statement?.currencies.map((c) => (
            <div key={c.currency} className="space-y-2">
              {(statement?.currencies.length ?? 0) > 1 && <p className="text-sm font-medium">{c.currency === 'ARS' ? 'Pesos' : c.currency}</p>}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Comprobante</TableHead>
                      <TableHead className="text-right">Debe</TableHead>
                      <TableHead className="text-right">Haber</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        Saldo anterior
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatInCurrency(c.previous, c.currency)}</TableCell>
                    </TableRow>
                    {c.rows.map((r) => (
                      <TableRow key={`${r.kind}-${r.id}`}>
                        <TableCell className="tabular-nums">{formatDay(r.date)}</TableCell>
                        <TableCell>{KIND_LABELS[r.kind]}</TableCell>
                        <TableCell>
                          <Link href={r.href} className="underline underline-offset-4">
                            {r.label}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.debit === '0.00' ? '' : formatInCurrency(r.debit, c.currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.credit === '0.00' ? '' : formatInCurrency(r.credit, c.currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatInCurrency(r.balance, c.currency)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={5} className="font-medium">
                        Saldo final
                      </TableCell>
                      <TableCell className={`text-right font-medium tabular-nums ${tone(c.closing)}`}>{formatInCurrency(c.closing, c.currency)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
