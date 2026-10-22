'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { Logger } from '@/lib/logger';
import { exportToExcel, type ExcelColumn } from '@/shared/lib/excel-export';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { exportPurchasesVatBookTxt, getPurchasesVatBook, type PurchasesVatBook } from '../../actions/vat-book.server';
import { PURCHASES_QUERY_KEYS } from '../../lib/query-keys';

const logger = new Logger('Purchases/VatBookView');

const periodLabel = (period: string) => {
  const text = moment(period, 'YYYY-MM').locale('es').format('MMMM YYYY');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const day = (value: string) => moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY');

/**
 * Libro IVA Compras (spec Compras etapa 4 §3.6): comprobantes vigentes del periodo, NC restando,
 * una columna por alicuota usada y los totales. Excel con lo mismo que la pantalla y el ZIP con
 * los TXT del Libro IVA Digital.
 */
export function VatBookView({ initialBook, periods }: { initialBook: PurchasesVatBook; periods: string[] }) {
  const [period, setPeriod] = useState(initialBook.period);

  const { data: book, isFetching } = useQuery({
    queryKey: [...PURCHASES_QUERY_KEYS.vatBook, period],
    queryFn: () => getPurchasesVatBook(period),
    initialData: period === initialBook.period ? initialBook : undefined,
    staleTime: 60 * 1000,
  });

  const changePeriod = (next: string) => {
    setPeriod(next);
    const url = new URL(window.location.href);
    url.searchParams.set('period', next);
    window.history.replaceState(null, '', url.toString());
  };

  const txt = useMutation({
    mutationFn: async () => unwrapAction(await exportPurchasesVatBookTxt(period)),
    onSuccess: ({ fileName, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) => {
      logger.error('Error al descargar el TXT del Libro IVA', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudieron generar los archivos');
    },
  });

  const excel = useMutation({
    mutationFn: async (current: PurchasesVatBook) => {
      const money = (value: unknown) => (typeof value === 'string' && value !== '' ? Number(value) : null);
      const columns: ExcelColumn[] = [
        { key: 'date', title: 'Fecha', width: 12 },
        { key: 'label', title: 'Comprobante', width: 28 },
        { key: 'supplier', title: 'Proveedor', width: 32 },
        { key: 'cuit', title: 'CUIT', width: 14 },
        { key: 'netTaxed', title: 'Neto gravado', width: 14, formatter: money },
        { key: 'netUntaxed', title: 'No gravado', width: 14, formatter: money },
        { key: 'exempt', title: 'Exento', width: 14, formatter: money },
        ...current.vatRates.map((rate) => ({ key: `vat${rate.id}`, title: rate.label, width: 14, formatter: money })),
        { key: 'vatPerceptions', title: 'Percepciones IVA', width: 16, formatter: money },
        { key: 'grossIncomePerceptions', title: 'Percepciones IIBB', width: 16, formatter: money },
        { key: 'otherTaxes', title: 'Otros tributos', width: 14, formatter: money },
        { key: 'total', title: 'Total', width: 16, formatter: money },
      ];
      const vatCells = (vat: Record<number, string>) =>
        Object.fromEntries(current.vatRates.map((rate) => [`vat${rate.id}`, vat[rate.id] ?? '0.00']));
      const rows: Record<string, unknown>[] = current.rows.map((row) => ({
        date: day(row.issueDate),
        label: row.label,
        supplier: row.supplier.name,
        cuit: row.supplier.cuit,
        netTaxed: row.netTaxed,
        netUntaxed: row.netUntaxed,
        exempt: row.exempt,
        ...vatCells(row.vat),
        vatPerceptions: row.vatPerceptions,
        grossIncomePerceptions: row.grossIncomePerceptions,
        otherTaxes: row.otherTaxes,
        total: row.total,
      }));
      rows.push({
        date: '',
        label: 'Totales del período',
        supplier: '',
        cuit: '',
        netTaxed: current.totals.netTaxed,
        netUntaxed: current.totals.netUntaxed,
        exempt: current.totals.exempt,
        ...vatCells(current.totals.vat),
        vatPerceptions: current.totals.vatPerceptions,
        grossIncomePerceptions: current.totals.grossIncomePerceptions,
        otherTaxes: current.totals.otherTaxes,
        total: current.totals.total,
      });
      await exportToExcel(rows, columns, {
        filename: `Libro IVA Compras ${current.period}`,
        sheetName: 'Libro IVA Compras',
        title: `Libro IVA Compras · ${periodLabel(current.period)}`,
      });
    },
    onError: (error) => {
      logger.error('Error al exportar el Libro IVA a Excel', { data: { error } });
      toast.error('No se pudo exportar el Excel');
    },
  });

  const rows = book?.rows ?? [];
  const count = rows.length;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <CardTitle>Libro IVA Compras</CardTitle>
          <CardDescription aria-live="polite" className="tabular-nums">
            {book
              ? `${count} ${count === 1 ? 'comprobante' : 'comprobantes'} en ${periodLabel(period)}. Las notas de crédito restan.`
              : 'Cargando…'}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onValueChange={changePeriod}>
            <SelectTrigger className="w-44" aria-label="Período">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p} value={p}>
                  {periodLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!book || count === 0 || excel.isPending}
            onClick={() => book && excel.mutate(book)}
          >
            <FileSpreadsheet className="mr-1 h-4 w-4" />
            {excel.isPending ? 'Exportando…' : 'Exportar Excel'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={count === 0 || txt.isPending}
            onClick={() => txt.mutate()}
          >
            <FileDown className="mr-1 h-4 w-4" />
            {txt.isPending ? 'Generando…' : 'Descargar TXT'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!book ? null : count === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No hay comprobantes imputados a {periodLabel(period)}. Un comprobante se imputa al período IVA que se elige
            al cargarlo.
          </p>
        ) : (
          <div className={`overflow-x-auto rounded-xl border ${isFetching ? 'opacity-60' : ''}`}>
            <Table className="min-w-[960px] text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>CUIT</TableHead>
                  <TableHead className="text-right">Neto gravado</TableHead>
                  <TableHead className="text-right">No gravado</TableHead>
                  <TableHead className="text-right">Exento</TableHead>
                  {book.vatRates.map((rate) => (
                    <TableHead key={rate.id} className="text-right">
                      {rate.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Perc. IVA</TableHead>
                  <TableHead className="text-right">Perc. IIBB</TableHead>
                  <TableHead className="text-right">Otros tributos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{day(row.issueDate)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link href={`/dashboard/purchases/invoices/${row.id}`} className="underline">
                        {row.label}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">{row.supplier.name}</TableCell>
                    <TableCell className="tabular-nums">{row.supplier.cuit}</TableCell>
                    <Money value={row.netTaxed} />
                    <Money value={row.netUntaxed} />
                    <Money value={row.exempt} />
                    {book.vatRates.map((rate) => (
                      <Money key={rate.id} value={row.vat[rate.id] ?? '0.00'} />
                    ))}
                    <Money value={row.vatPerceptions} />
                    <Money value={row.grossIncomePerceptions} />
                    <Money value={row.otherTaxes} />
                    <Money value={row.total} strong />
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="font-medium">
                    Totales del período
                  </TableCell>
                  <Money value={book.totals.netTaxed} strong />
                  <Money value={book.totals.netUntaxed} strong />
                  <Money value={book.totals.exempt} strong />
                  {book.vatRates.map((rate) => (
                    <Money key={rate.id} value={book.totals.vat[rate.id] ?? '0.00'} strong />
                  ))}
                  <Money value={book.totals.vatPerceptions} strong />
                  <Money value={book.totals.grossIncomePerceptions} strong />
                  <Money value={book.totals.otherTaxes} strong />
                  <Money value={book.totals.total} strong />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Money({ value, strong = false }: { value: string; strong?: boolean }) {
  const negative = value.startsWith('-');
  return (
    <TableCell
      className={`whitespace-nowrap text-right tabular-nums ${strong ? 'font-medium' : ''} ${negative ? 'text-red-600 dark:text-red-400' : ''}`}
    >
      {Number(value) === 0 ? '—' : formatMoney(value)}
    </TableCell>
  );
}
