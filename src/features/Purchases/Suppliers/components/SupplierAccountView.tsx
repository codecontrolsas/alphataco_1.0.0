'use client';

import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { DateRangeFields } from '@/shared/components/common/DateRangeFields';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { formatDateAr } from '@/shared/lib/argentina-time';
import { exportToExcel, type ExcelColumn } from '@/shared/lib/excel-export';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Banknote, FileSpreadsheet, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { getSupplierAccount, type SupplierAccount } from '../../actions/supplier-account.server';

const day = (value: string | null) => (value ? formatDateAr(value) : '—');

const KIND_LABELS = {
  INVOICE: 'Comprobante',
  CREDIT_NOTE: 'Nota de crédito',
  PAYMENT: 'Orden de pago',
  REJECTED_CHECK: 'Cheque rechazado',
} as const;

/** Importe `Decimal` serializado ("1234.50", "-10.00") mayor a cero, sin pasar por `Number`. */
function isPositiveAmount(value: string): boolean {
  return !value.startsWith('-') && /[1-9]/.test(value);
}

/**
 * Cuenta corriente del proveedor (spec Compras etapa 5 §4): movimientos con saldo acumulado,
 * resumen (saldo, vencido, a vencer, anticipos) y rango de fechas con saldo anterior.
 */
export function SupplierAccountView({
  initial,
  canCreatePayment,
}: {
  initial: SupplierAccount;
  canCreatePayment: boolean;
}) {
  const [range, setRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const {
    data: account,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['supplier-account', initial.supplier.id, range.from, range.to],
    queryFn: () =>
      getSupplierAccount(initial.supplier.id, { from: range.from || undefined, to: range.to || undefined }),
    initialData: !range.from && !range.to ? initial : undefined,
    staleTime: 30 * 1000,
  });

  const excel = useMutation({
    mutationFn: async (current: SupplierAccount) => {
      const money = (value: unknown) => (typeof value === 'string' && value !== '' ? Number(value) : null);
      const columns: ExcelColumn[] = [
        { key: 'date', title: 'Fecha', width: 12 },
        { key: 'kind', title: 'Tipo', width: 16 },
        { key: 'label', title: 'Documento', width: 30 },
        { key: 'due', title: 'Vencimiento', width: 12 },
        { key: 'debit', title: 'Debe', width: 16, formatter: money },
        { key: 'credit', title: 'Haber', width: 16, formatter: money },
        { key: 'balance', title: 'Saldo', width: 16, formatter: money },
      ];
      const rows: Record<string, unknown>[] = [
        ...(current.previousBalance !== null
          ? [
              {
                date: day(current.range.from),
                kind: '',
                label: 'Saldo anterior',
                due: '',
                debit: '',
                credit: '',
                balance: current.previousBalance,
              },
            ]
          : []),
        ...current.movements.map((m) => ({
          date: day(m.date),
          kind: KIND_LABELS[m.kind],
          label: m.label,
          due: m.dueDate ? day(m.dueDate) : '',
          debit: m.debit === '0.00' ? '' : m.debit,
          credit: m.credit === '0.00' ? '' : m.credit,
          balance: m.balance,
        })),
      ];
      await exportToExcel(rows, columns, {
        filename: `Cuenta corriente ${current.supplier.name}`,
        sheetName: 'Cuenta corriente',
        title: `Cuenta corriente · ${current.supplier.name}`,
      });
    },
    onError: () => toast.error('No se pudo exportar el Excel'),
  });

  const a = account ?? initial;
  const s = a.summary;
  const balanceText = s.balance.startsWith('-')
    ? `A favor ${formatMoney(s.balance.replace('-', ''))}`
    : formatMoney(s.balance);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Saldo', value: balanceText, tone: '' },
          {
            label: 'Vencido sin orden de pago',
            value: formatMoney(s.overdue),
            tone: isPositiveAmount(s.overdue) ? 'text-danger' : '',
          },
          { label: 'A vencer sin orden de pago', value: formatMoney(s.upcoming), tone: '' },
          { label: 'Anticipos disponibles', value: formatMoney(s.advancesAvailable), tone: '' },
        ].map((k) => (
          <div key={k.label} className="bg-card rounded-xl border p-4">
            <dt className="text-muted-foreground text-sm">{k.label}</dt>
            <dd className={`text-lg font-semibold tabular-nums ${k.tone}`}>{k.value}</dd>
          </div>
        ))}
      </dl>

      {isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-foreground"
        >
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>No se pudo actualizar la cuenta corriente con ese rango de fechas.</span>
          <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      <SectionCard
        title="Movimientos"
        description="Comprobantes a pagar (conformes o aprobados), notas de crédito y órdenes de pago pagadas."
        action={
          <div className="flex flex-wrap items-end justify-end gap-2">
            <DateRangeFields value={range} onChange={setRange} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!account || excel.isPending}
              onClick={() => account && excel.mutate(account)}
            >
              <FileSpreadsheet className="mr-1 h-4 w-4" aria-hidden="true" />
              {excel.isPending ? 'Exportando…' : 'Excel'}
            </Button>
            {canCreatePayment && (
              <Button asChild size="sm">
                <Link href={`/dashboard/purchases/payments/new?supplier=${a.supplier.id}`}>
                  <Banknote className="mr-1 h-4 w-4" aria-hidden="true" />
                  Nueva orden de pago
                </Link>
              </Button>
            )}
          </div>
        }
        className="[&>header]:flex-wrap"
      >
        <div aria-busy={isFetching}>
          {a.movements.length === 0 && a.previousBalance === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin movimientos: el proveedor no tiene comprobantes a pagar ni pagos registrados.
            </p>
          ) : (
            <div className={`overflow-x-auto rounded-xl border ${isFetching ? 'opacity-60' : ''}`}>
              <Table className="min-w-[720px] text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead className="text-right">Debe</TableHead>
                    <TableHead className="text-right">Haber</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {a.previousBalance !== null && (
                    <TableRow>
                      <TableCell>{day(a.range.from)}</TableCell>
                      <TableCell className="italic text-muted-foreground">Saldo anterior</TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell className="text-right tabular-nums">{formatMoney(a.previousBalance)}</TableCell>
                    </TableRow>
                  )}
                  {a.movements.map((m) => (
                    <TableRow key={`${m.kind}-${m.id}`}>
                      <TableCell className="whitespace-nowrap">{day(m.date)}</TableCell>
                      <TableCell>
                        <span className="block text-xs text-muted-foreground">{KIND_LABELS[m.kind]}</span>
                        <Link
                          href={
                            m.kind === 'PAYMENT'
                              ? `/dashboard/purchases/payments/${m.id}`
                              : m.kind === 'REJECTED_CHECK'
                                ? `/dashboard/treasury/${m.ownCheck ? 'own-checks' : 'checks'}/${m.id}`
                                : `/dashboard/purchases/invoices/${m.id}`
                          }
                          className="underline"
                        >
                          {m.label}
                        </Link>
                        {m.detail && <span className="block text-xs text-muted-foreground">{m.detail}</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{m.dueDate ? day(m.dueDate) : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.debit === '0.00' ? '' : formatMoney(m.debit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.credit === '0.00' ? '' : formatMoney(m.credit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(m.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
