'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { Logger } from '@/lib/logger';
import { exportToExcel, type ExcelColumn } from '@/shared/lib/excel-export';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet, Info } from 'lucide-react';
import 'moment/locale/es';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  exportWithholdingsTxt,
  getWithholdingsReport,
  type WithholdingsReport,
} from '../../actions/withholdings-report.server';
import { PeriodSelect, dayLabel, periodLabel, usePeriodParam, useZipDownload } from '../../components/period-report';
import { cents, money } from '../../lib/payment-totals';
import { WITHHOLDING_TAXES, WITHHOLDING_TAX_LABELS, type WithholdingTax } from '../../schemas/payment-settings';

const logger = new Logger('Purchases/WithholdingsView');

/**
 * Retenciones practicadas en el mes (spec Compras etapa 5 §4): por periodo e impuesto, con los
 * totales por regimen, el Excel y el ZIP con los archivos de SICORE, SIRE y Rentas Neuquen.
 */
export function WithholdingsView({ initialReport, periods }: { initialReport: WithholdingsReport; periods: string[] }) {
  const { period, changePeriod } = usePeriodParam(initialReport.period);
  const [tax, setTax] = useState<WithholdingTax | 'ALL'>('ALL');

  const { data: report, isFetching } = useQuery({
    queryKey: ['purchases-withholdings', period],
    queryFn: () => getWithholdingsReport(period),
    initialData: period === initialReport.period ? initialReport : undefined,
    staleTime: 60 * 1000,
  });

  const rows = (report?.rows ?? []).filter((r) => tax === 'ALL' || r.tax === tax);
  const totals = (report?.totals ?? []).filter((t) => tax === 'ALL' || t.tax === tax);
  const live = rows.filter((r) => !r.cancelled);

  const txt = useZipDownload(
    () => exportWithholdingsTxt(period),
    logger,
    'Error al descargar los archivos de retenciones'
  );

  const excel = useMutation({
    mutationFn: async () => {
      const money = (value: unknown) => (typeof value === 'string' && value !== '' ? Number(value) : null);
      const columns: ExcelColumn[] = [
        { key: 'date', title: 'Fecha', width: 12 },
        { key: 'tax', title: 'Impuesto', width: 14 },
        { key: 'certificate', title: 'Certificado', width: 16 },
        { key: 'order', title: 'Orden de pago', width: 14 },
        { key: 'supplier', title: 'Proveedor', width: 32 },
        { key: 'cuit', title: 'CUIT', width: 14 },
        { key: 'regime', title: 'Régimen', width: 30 },
        { key: 'base', title: 'Base', width: 16, formatter: money },
        { key: 'rate', title: 'Alícuota %', width: 10 },
        { key: 'amount', title: 'Importe', width: 16, formatter: money },
        { key: 'state', title: 'Estado', width: 10 },
      ];
      await exportToExcel(
        rows.map((r) => ({
          date: dayLabel(r.paidOn),
          tax: WITHHOLDING_TAX_LABELS[r.tax],
          certificate: r.certificateNumber,
          order: r.order.number,
          supplier: r.supplier.name,
          cuit: r.supplier.cuit,
          regime: r.regime,
          base: r.base,
          rate: r.rate,
          amount: r.amount,
          state: r.cancelled ? 'Anulada' : 'Vigente',
        })),
        columns,
        {
          filename: `Retenciones ${period}`,
          sheetName: 'Retenciones',
          title: `Retenciones practicadas · ${periodLabel(period)}`,
        }
      );
    },
    onError: () => toast.error('No se pudo exportar el Excel'),
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <CardTitle>Retenciones practicadas</CardTitle>
          <CardDescription aria-live="polite" className="tabular-nums">
            {report
              ? `${live.length} ${live.length === 1 ? 'retención' : 'retenciones'} en ${periodLabel(period)} · total ${formatMoney(money(live.reduce((acc, r) => acc + cents(r.amount), BigInt(0))))}`
              : 'Cargando…'}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelect value={period} periods={periods} onChange={changePeriod} />
          <Select value={tax} onValueChange={(v) => setTax(v as WithholdingTax | 'ALL')}>
            <SelectTrigger className="w-40" aria-label="Impuesto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los impuestos</SelectItem>
              {WITHHOLDING_TAXES.map((t) => (
                <SelectItem key={t} value={t}>
                  {WITHHOLDING_TAX_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={rows.length === 0 || excel.isPending}
            onClick={() => excel.mutate()}
          >
            <FileSpreadsheet className="mr-1 h-4 w-4" />
            Excel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={(report?.rows ?? []).length === 0 || txt.isPending}
            onClick={() => txt.mutate()}
          >
            <FileDown className="mr-1 h-4 w-4" />
            {txt.isPending ? 'Generando…' : 'Archivos para declarar'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            El ZIP trae SICORE (Ganancias), SIRE F.2003 (IVA), SIRE F.2004 (SUSS) y Rentas Neuquén (IIBB). Los de SIRE y
            Rentas Neuquén todavía no se probaron con el aplicativo: revisalos la primera vez que los importes.
          </AlertDescription>
        </Alert>
        {totals.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {totals.map((t) => (
              <div key={`${t.tax}-${t.regime}`} className="rounded-md border p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {WITHHOLDING_TAX_LABELS[t.tax]} · {t.regime}
                </p>
                <p className="font-semibold tabular-nums">{formatMoney(t.amount)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t.count} {t.count === 1 ? 'retención' : 'retenciones'} · base {formatMoney(t.base)}
                </p>
              </div>
            ))}
          </div>
        )}
        {!report ? null : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No hay retenciones en {periodLabel(period)}. Se registran al pagar una orden de pago con retenciones.
          </p>
        ) : (
          <div className={`overflow-x-auto rounded-xl border ${isFetching ? 'opacity-60' : ''}`}>
            <Table className="min-w-[900px] text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Impuesto</TableHead>
                  <TableHead>Certificado</TableHead>
                  <TableHead>OP</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>CUIT</TableHead>
                  <TableHead>Régimen</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Alícuota</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className={r.cancelled ? 'text-muted-foreground line-through' : undefined}>
                    <TableCell className="whitespace-nowrap">{dayLabel(r.paidOn)}</TableCell>
                    <TableCell>{WITHHOLDING_TAX_LABELS[r.tax]}</TableCell>
                    <TableCell className="font-mono">{r.certificateNumber}</TableCell>
                    <TableCell>
                      <Link href={`/dashboard/purchases/payments/${r.order.id}`} className="font-mono underline">
                        {r.order.number}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.supplier.name}</TableCell>
                    <TableCell className="tabular-nums">{r.supplier.cuit}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.regime}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.base)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.rate.replace('.', ',')} %</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.amount)}</TableCell>
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
