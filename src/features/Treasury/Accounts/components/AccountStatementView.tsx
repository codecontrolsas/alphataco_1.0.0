'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { exportToExcel, type ExcelColumn } from '@/shared/lib/excel-export';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileSpreadsheet, Landmark, Wallet } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import type { TreasuryAccountRow } from '../../actions/accounts.server';
import type { TreasuryConceptRow } from '../../actions/concepts.server';
import { getAccountStatementData, type AccountStatementData } from '../../actions/statement.server';
import { NewMovementButton } from '../../Movements/components/NewMovementButton';
import { TREASURY_QUERY_KEYS } from '../../lib/query-keys';
import { TREASURY_ACCOUNT_KIND_LABELS } from '../../schemas/accounts';
import { TREASURY_MOVEMENT_KIND_LABELS } from '../../schemas/movements';

const day = (value: string) => moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY');
const isNegative = (value: string) => value.startsWith('-');
const tone = (value: string) => (isNegative(value) ? 'text-red-600 dark:text-red-400' : '');
const abs = (value: string) => value.replace('-', '');

type Row = AccountStatementData['rows'][number];

/** Concepto y descripción de la fila ('' si no tiene: el saldo inicial). */
const detailOf = (r: Row) => [r.concept, r.description].filter(Boolean).join(' — ');

function OriginLink({ row }: { row: Row }) {
  if (row.paymentOrder) {
    return (
      <Link href={`/dashboard/purchases/payments/${row.paymentOrder.id}`} className="font-mono text-xs underline underline-offset-4">
        {row.paymentOrder.number}
      </Link>
    );
  }
  if (row.transfer) {
    return (
      <Link href="/dashboard/treasury?tab=transferencias" className="font-mono text-xs underline underline-offset-4">
        {row.transfer.number}
      </Link>
    );
  }
  return null;
}

/**
 * Extracto de una cuenta o caja (spec Tesorería etapa 1 §4): indicadores de hoy, período
 * Desde/Hasta (default el mes en curso), saldo anterior, movimientos con saldo acumulado y saldo
 * final. Los anulados se ven tachados con el motivo y no suman; los futuros se marcan "a debitar"
 * o "a acreditar". Excel del período y "Nuevo movimiento" con la cuenta elegida.
 */
export function AccountStatementView({
  initial,
  canCreateMovement,
  accounts,
  concepts,
}: {
  initial: AccountStatementData;
  canCreateMovement: boolean;
  accounts: TreasuryAccountRow[];
  concepts: TreasuryConceptRow[];
}) {
  const [range, setRange] = useState({ from: initial.from, to: initial.to });
  const validRange = range.from !== '' && range.to !== '' && range.to >= range.from;
  const isInitialRange = range.from === initial.from && range.to === initial.to;

  const { data, isFetching } = useQuery({
    queryKey: [...TREASURY_QUERY_KEYS.statement, initial.account.id, range.from, range.to],
    queryFn: () => getAccountStatementData(initial.account.id, range.from, range.to),
    initialData: isInitialRange ? initial : undefined,
    enabled: validRange,
    staleTime: 30 * 1000,
  });
  const statement = data ?? initial;
  const { account, indicators } = statement;
  const Icon = account.kind === 'BANK' ? Landmark : Wallet;

  const excel = useMutation({
    mutationFn: async (current: AccountStatementData) => {
      const money = (value: unknown) => (typeof value === 'string' && value !== '' ? Number(value) : null);
      const columns: ExcelColumn[] = [
        { key: 'date', title: 'Fecha', width: 12 },
        { key: 'kind', title: 'Tipo', width: 18 },
        { key: 'detail', title: 'Detalle', width: 40 },
        { key: 'origin', title: 'Origen', width: 14 },
        { key: 'credit', title: 'Ingreso', width: 16, formatter: money },
        { key: 'debit', title: 'Egreso', width: 16, formatter: money },
        { key: 'balance', title: 'Saldo', width: 16, formatter: money },
        { key: 'status', title: 'Estado', width: 30 },
      ];
      const rows: Record<string, unknown>[] = [
        { date: day(current.from), kind: '', detail: 'Saldo anterior', origin: '', credit: '', debit: '', balance: current.previous, status: '' },
        ...current.rows.map((r) => ({
          date: day(r.date),
          kind: TREASURY_MOVEMENT_KIND_LABELS[r.kind],
          detail: detailOf(r),
          origin: r.paymentOrder?.number ?? r.transfer?.number ?? '',
          credit: isNegative(r.amount) ? '' : r.amount,
          debit: isNegative(r.amount) ? abs(r.amount) : '',
          balance: r.balance,
          status: r.cancelled ? `Anulado: ${r.cancelReason ?? ''}` : r.future ? (isNegative(r.amount) ? 'A debitar' : 'A acreditar') : '',
        })),
        { date: day(current.to), kind: '', detail: 'Saldo final', origin: '', credit: '', debit: '', balance: current.closing, status: '' },
      ];
      await exportToExcel(rows, columns, {
        filename: `Extracto ${current.account.name} ${current.from} a ${current.to}`,
        sheetName: 'Extracto',
        title: `Extracto · ${current.account.name} · ${day(current.from)} a ${day(current.to)}`,
      });
    },
    onError: () => toast.error('No se pudo exportar el Excel'),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link href="/dashboard/treasury?tab=cuentas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Cuentas
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="truncate">{account.name}</span>
            {!account.is_active && <Badge variant="outline">Inactiva</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {TREASURY_ACCOUNT_KIND_LABELS[account.kind]}
            {account.bank_name ? ` · ${account.bank_name}` : ''}
            {account.account_number ? ` · N° ${account.account_number}` : ''}
            {account.cbu ? ` · CBU ${account.cbu}` : ''}
          </p>
        </div>
        {canCreateMovement && <NewMovementButton accounts={accounts} concepts={concepts} defaultAccountId={account.id} />}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Saldo hoy', value: indicators.balance },
          { label: 'A debitar', value: indicators.toDebit },
          { label: 'A acreditar', value: indicators.toCredit },
          { label: 'Proyectado', value: indicators.projected },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-lg font-semibold tabular-nums ${tone(k.value)}`}>{formatMoney(k.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Movimientos</CardTitle>
            <CardDescription>
              {isFetching ? 'Actualizando…' : `${statement.rows.length} movimientos del ${day(statement.from)} al ${day(statement.to)}`}
            </CardDescription>
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
            <Button type="button" variant="outline" size="sm" disabled={excel.isPending} onClick={() => excel.mutate(statement)}>
              <FileSpreadsheet className="mr-1 h-4 w-4" />
              Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!validRange && <p className="pb-3 text-sm text-red-600 dark:text-red-400">Elegí un período válido: «Hasta» no puede ser anterior a «Desde».</p>}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Fecha</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead className="w-28">Origen</TableHead>
                  <TableHead className="w-32 text-right">Ingreso</TableHead>
                  <TableHead className="w-32 text-right">Egreso</TableHead>
                  <TableHead className="w-36 text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/40">
                  <TableCell>{day(statement.from)}</TableCell>
                  <TableCell className="font-medium" colSpan={4}>
                    Saldo anterior
                  </TableCell>
                  <TableCell className={`text-right font-medium tabular-nums ${tone(statement.previous)}`}>{formatMoney(statement.previous)}</TableCell>
                </TableRow>
                {statement.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                      No hay movimientos en el período.
                    </TableCell>
                  </TableRow>
                )}
                {statement.rows.map((r) => (
                  <TableRow key={r.id} className={r.cancelled ? 'text-muted-foreground' : undefined}>
                    <TableCell className="whitespace-nowrap">{day(r.date)}</TableCell>
                    <TableCell>
                      <div className={r.cancelled ? 'line-through' : undefined}>
                        <span className="text-xs text-muted-foreground">
                          {TREASURY_MOVEMENT_KIND_LABELS[r.kind]}
                          {detailOf(r) ? ' · ' : ''}
                        </span>
                        {detailOf(r)}
                      </div>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {r.cancelled && <span className="text-xs">Anulado: {r.cancelReason}</span>}
                        {!r.cancelled && r.future && (
                          <Badge variant="outline" className="text-xs">
                            {isNegative(r.amount) ? 'A debitar' : 'A acreditar'}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <OriginLink row={r} />
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${r.cancelled ? 'line-through' : ''}`}>
                      {isNegative(r.amount) ? '' : formatMoney(r.amount)}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${r.cancelled ? 'line-through' : ''}`}>
                      {isNegative(r.amount) ? formatMoney(abs(r.amount)) : ''}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${tone(r.balance)}`}>{formatMoney(r.balance)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40">
                  <TableCell>{day(statement.to)}</TableCell>
                  <TableCell className="font-medium" colSpan={4}>
                    Saldo final
                  </TableCell>
                  <TableCell className={`text-right font-semibold tabular-nums ${tone(statement.closing)}`}>{formatMoney(statement.closing)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
