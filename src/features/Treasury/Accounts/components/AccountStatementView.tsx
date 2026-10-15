'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { exportToExcel, type ExcelColumn } from '@/shared/lib/excel-export';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Ban, CheckCheck, Clock, FileSpreadsheet, Landmark, Wallet } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import type { TreasuryAccountRow } from '../../actions/accounts.server';
import type { TreasuryConceptRow } from '../../actions/concepts.server';
import { getAccountStatementData, type AccountStatementData } from '../../actions/statement.server';
import { NewMovementButton } from '../../Movements/components/NewMovementButton';
import { OWN_CHECK_KIND_LABELS, ownCheckAlert } from '../../lib/own-check-transitions';
import { TREASURY_QUERY_KEYS } from '../../lib/query-keys';
import { TREASURY_ACCOUNT_KIND_LABELS } from '../../schemas/accounts';
import { TREASURY_MOVEMENT_KIND_LABELS } from '../../schemas/movements';
import { formatDay } from '../../lib/dates';
import { accountStatementRangeError, MAX_ACCOUNT_STATEMENT_MONTHS } from '../../lib/statement-range';
import { MOVEMENT_STATE_UI, OWN_CHECK_ALERT_UI, TONE_TO_BADGE } from '../../lib/status-presentation';

const isNegative = (value: string) => value.startsWith('-');
const tone = (value: string) => (isNegative(value) ? 'text-danger' : '');
const abs = (value: string) => value.replace('-', '');

type Row = AccountStatementData['rows'][number];

/** Concepto y descripción de la fila ('' si no tiene: el saldo inicial). */
const detailOf = (r: Row) => [r.concept, r.description].filter(Boolean).join(' — ');

function OriginLink({ row }: { row: Row }) {
  // El débito de un cheque propio se ve desde el cheque (su orden de pago está en el detalle).
  if (row.ownCheck) {
    return (
      <Link href={`/dashboard/treasury/own-checks/${row.ownCheck.id}`} className="font-mono text-xs underline underline-offset-4">
        Ch. Nº {row.ownCheck.number}
      </Link>
    );
  }
  if (row.paymentOrder) {
    return (
      <Link href={`/dashboard/purchases/payments/${row.paymentOrder.id}`} className="font-mono text-xs underline underline-offset-4">
        {row.paymentOrder.number}
      </Link>
    );
  }
  if (row.checkOperation) {
    // Una operación de cheques se ve desde el cheque (el neto de un descuento no tiene uno solo).
    return row.thirdPartyCheck ? (
      <Link href={`/dashboard/treasury/checks/${row.thirdPartyCheck.id}`} className="font-mono text-xs underline underline-offset-4">
        {row.checkOperation.number}
      </Link>
    ) : (
      <Link href="/dashboard/treasury?tab=cheques" className="font-mono text-xs underline underline-offset-4">
        {row.checkOperation.number}
      </Link>
    );
  }
  if (row.customerReceipt) {
    return (
      <Link href={`/dashboard/treasury/receipts/${row.customerReceipt.id}`} className="font-mono text-xs underline underline-offset-4">
        {row.customerReceipt.number}
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
  const rangeError = accountStatementRangeError(range.from, range.to);
  const validRange = rangeError === null;
  const isInitialRange = range.from === initial.from && range.to === initial.to;

  const { data, isFetching, refetch } = useQuery({
    queryKey: [...TREASURY_QUERY_KEYS.statement, initial.account.id, range.from, range.to],
    queryFn: () => getAccountStatementData(initial.account.id, range.from, range.to),
    initialData: isInitialRange ? initial : undefined,
    enabled: validRange,
    staleTime: 30 * 1000,
  });
  // Sin `?? initial`: si el rango nuevo falla (o aún carga) no se muestra ni se exporta el rango anterior.
  const statement = data ?? null;
  const { account, indicators } = initial;
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
        { date: formatDay(current.from), kind: '', detail: 'Saldo anterior', origin: '', credit: '', debit: '', balance: current.previous, status: '' },
        ...current.rows.map((r) => ({
          date: formatDay(r.date),
          kind: TREASURY_MOVEMENT_KIND_LABELS[r.kind],
          detail: detailOf(r),
          origin: (r.ownCheck ? `Ch. Nº ${r.ownCheck.number}` : null) ?? r.paymentOrder?.number ?? r.customerReceipt?.number ?? r.transfer?.number ?? r.checkOperation?.number ?? '',
          credit: isNegative(r.amount) ? '' : r.amount,
          debit: isNegative(r.amount) ? abs(r.amount) : '',
          balance: r.balance,
          status: r.cancelled ? `Anulado: ${r.cancelReason ?? ''}` : [r.future ? (isNegative(r.amount) ? 'A debitar' : 'A acreditar') : '', r.reconciled ? 'Conciliado' : ''].filter(Boolean).join(' · '),
        })),
        { date: formatDay(current.to), kind: '', detail: 'Saldo final', origin: '', credit: '', debit: '', balance: current.closing, status: '' },
      ];
      await exportToExcel(rows, columns, {
        filename: `Extracto ${current.account.name} ${current.from} a ${current.to}`,
        sheetName: 'Extracto',
        title: `Extracto · ${current.account.name} · ${formatDay(current.from)} a ${formatDay(current.to)}`,
      });
    },
    onError: () => toast.error('No se pudo exportar el Excel'),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link href="/dashboard/treasury?tab=cuentas" className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Cuentas
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
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

      {initial.issuedChecks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cheques emitidos sin debitar</CardTitle>
            <CardDescription>
              Suman en &quot;A debitar&quot; hasta que se confirma su débito. Los que tienen la fecha de pago vencida están pendientes de confirmar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cheque</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Fecha de pago</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initial.issuedChecks.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/dashboard/treasury/own-checks/${c.id}`} className="font-mono text-xs underline underline-offset-4">
                        {OWN_CHECK_KIND_LABELS[c.kind]} Nº {c.number}
                      </Link>
                    </TableCell>
                    <TableCell>{c.supplier ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">
                      {c.paymentDate ? formatDay(c.paymentDate) : '—'}
                      {ownCheckAlert('ISSUED', c.paymentDate, initial.today) && (
                        <Badge variant={TONE_TO_BADGE[OWN_CHECK_ALERT_UI.PENDING_CONFIRMATION.tone]} className="ml-2">
                          <Clock aria-hidden="true" />
                          {OWN_CHECK_ALERT_UI.PENDING_CONFIRMATION.label}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(c.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Movimientos</CardTitle>
            <CardDescription aria-live="polite">
              {isFetching ? 'Actualizando…' : statement ? `${statement.rows.length} movimientos del ${formatDay(statement.from)} al ${formatDay(statement.to)}` : 'Sin datos para el período'}
            </CardDescription>
            <p className="text-xs text-muted-foreground">El período puede abarcar hasta {MAX_ACCOUNT_STATEMENT_MONTHS} meses.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="statement-from" className="text-xs">Desde</Label>
              <EnhancedDatePicker
                id="statement-from"
                aria-label="Desde"
                date={range.from ? moment(range.from, 'YYYY-MM-DD').toDate() : undefined}
                setDate={(d) => setRange((r) => ({ ...r, from: d ? moment(d).format('YYYY-MM-DD') : '' }))}
                placeholder="DD/MM/AAAA"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="statement-to" className="text-xs">Hasta</Label>
              <EnhancedDatePicker
                id="statement-to"
                aria-label="Hasta"
                date={range.to ? moment(range.to, 'YYYY-MM-DD').toDate() : undefined}
                setDate={(d) => setRange((r) => ({ ...r, to: d ? moment(d).format('YYYY-MM-DD') : '' }))}
                placeholder="DD/MM/AAAA"
              />
            </div>
            <Button type="button" variant="outline" size="sm" disabled={excel.isPending || isFetching || !statement} onClick={() => statement && excel.mutate(statement)}>
              <FileSpreadsheet aria-hidden="true" className="mr-1 h-4 w-4" />
              Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rangeError && (
            <p role="alert" className="pb-3 text-sm text-danger">
              {rangeError}
            </p>
          )}
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
          {statement && (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Movimientos del período">
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
                  <TableCell>{formatDay(statement.from)}</TableCell>
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
                    <TableCell className="whitespace-nowrap">{formatDay(r.date)}</TableCell>
                    <TableCell>
                      <div className={r.cancelled ? 'line-through' : undefined}>
                        <span className="text-xs text-muted-foreground">
                          {TREASURY_MOVEMENT_KIND_LABELS[r.kind]}
                          {detailOf(r) ? ' · ' : ''}
                        </span>
                        {detailOf(r)}
                      </div>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {r.cancelled && (
                          <Badge variant={TONE_TO_BADGE[MOVEMENT_STATE_UI.CANCELLED.tone]} className="text-xs">
                            <Ban aria-hidden="true" />
                            {MOVEMENT_STATE_UI.CANCELLED.label}: {r.cancelReason}
                          </Badge>
                        )}
                        {!r.cancelled && r.reconciled && (
                          <Badge variant={TONE_TO_BADGE[MOVEMENT_STATE_UI.RECONCILED.tone]} title="Conciliado con el extracto del banco">
                            <CheckCheck aria-hidden="true" />
                            {MOVEMENT_STATE_UI.RECONCILED.label}
                          </Badge>
                        )}
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
                  <TableCell>{formatDay(statement.to)}</TableCell>
                  <TableCell className="font-medium" colSpan={4}>
                    Saldo final
                  </TableCell>
                  <TableCell className={`text-right font-semibold tabular-nums ${tone(statement.closing)}`}>{formatMoney(statement.closing)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
