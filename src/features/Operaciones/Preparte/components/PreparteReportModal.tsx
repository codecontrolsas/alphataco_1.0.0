'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { preparte_status } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import moment from 'moment';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { getPreparteReportData, type PreparteReportResult, type PreparteReportSummary } from '../actions/report.server';
import type { Cliente } from './PreparteManager';

const logger = new Logger('PreparteReportModal');

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendientes',
  cancelado: 'Cancelados',
  reprogramado: 'Reprogramados',
  rechazado: 'Rechazados',
  vencido: 'Vencidos',
  confirmado: 'Confirmados',
};

const ALL_STATUSES: preparte_status[] = Object.values(preparte_status);

const THEME = {
  primary: '374151',
  headerText: 'FFFFFF',
  border: 'e5e7eb',
  alternateRow: 'f9fafb',
  groupBg: 'e5e7eb',
  groupText: '1f2937',
};

const reportSchema = z
  .object({
    from: z.string().min(1, 'La fecha desde es requerida'),
    to: z.string().min(1, 'La fecha hasta es requerida'),
    clientIds: z.array(z.string()).default([]),
    statuses: z.array(z.string()).default([]),
    groupBy: z.enum(['line', 'order']),
  })
  .refine((data) => data.to >= data.from, {
    message: 'La fecha hasta no puede ser menor que la fecha desde',
    path: ['to'],
  });

type ReportFormValues = z.infer<typeof reportSchema>;

interface PreparteReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Cliente[];
}

// ── Helpers para generar Excel ──────────────────────────────────────────

function applyHeaderStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: THEME.headerText }, size: 11 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.primary } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = {
    top: { style: 'thin', color: { argb: THEME.border } },
    bottom: { style: 'thin', color: { argb: THEME.border } },
    left: { style: 'thin', color: { argb: THEME.border } },
    right: { style: 'thin', color: { argb: THEME.border } },
  };
}

function applyCellStyle(cell: ExcelJS.Cell, isAlternate: boolean) {
  cell.alignment = { vertical: 'middle' };
  cell.border = {
    top: { style: 'thin', color: { argb: THEME.border } },
    bottom: { style: 'thin', color: { argb: THEME.border } },
    left: { style: 'thin', color: { argb: THEME.border } },
    right: { style: 'thin', color: { argb: THEME.border } },
  };
  if (isAlternate) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.alternateRow } };
  }
}

function addGroupSeparator(sheet: ExcelJS.Worksheet, rowIndex: number, colCount: number, label: string) {
  const groupRow = sheet.getRow(rowIndex);
  sheet.mergeCells(rowIndex, 1, rowIndex, colCount);
  const groupCell = groupRow.getCell(1);
  groupCell.value = label;
  groupCell.font = { bold: true, size: 12, color: { argb: THEME.groupText } };
  groupCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.groupBg } };
  groupCell.alignment = { vertical: 'middle' };
  groupRow.height = 24;
}

function buildSummarySheet(workbook: ExcelJS.Workbook, summary: PreparteReportSummary) {
  const sheet = workbook.addWorksheet('Resumen');
  const colCount = 11;

  // Título
  sheet.mergeCells(`A1:K1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'Informe del Gestor de Pedidos';
  titleCell.font = { bold: true, size: 16, color: { argb: THEME.primary } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 35;

  // Fecha de generación
  sheet.mergeCells(`A2:K2`);
  const dateCell = sheet.getCell('A2');
  dateCell.value = `Generado el ${moment().format('DD/MM/YYYY [a las] HH:mm')}`;
  dateCell.font = { size: 10, italic: true, color: { argb: '6b7280' } };
  dateCell.alignment = { horizontal: 'center' };

  // Headers (fila 4)
  const headers = [
    'Desde',
    'Hasta',
    'Cliente',
    'Total',
    '% Confirmados',
    '% Pendientes',
    '% Reprogramados',
    '% Cancelados',
    '% Rechazados',
    '% Vencidos',
    '% Perdidos',
  ];

  const headerRow = sheet.getRow(4);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    applyHeaderStyle(cell);
  });
  headerRow.height = 28;

  // Helper para construir los valores de una fila
  const buildRowValues = (
    clientName: string,
    stats: { total: number; byStatus: Record<string, { count: number; percentage: number }>; lostPercentage: number }
  ) => {
    const pct = (status: string) => stats.byStatus[status]?.percentage ?? 0;
    return [
      moment(summary.from).format('DD/MM/YYYY'),
      moment(summary.to).format('DD/MM/YYYY'),
      clientName,
      stats.total,
      `${pct('confirmado')}%`,
      `${pct('pendiente')}%`,
      `${pct('reprogramado')}%`,
      `${pct('cancelado')}%`,
      `${pct('rechazado')}%`,
      `${pct('vencido')}%`,
      `${stats.lostPercentage}%`,
    ];
  };

  // Una fila por cliente
  let rowIndex = 5;
  for (let i = 0; i < summary.clientSummaries.length; i++) {
    const cs = summary.clientSummaries[i];
    const values = buildRowValues(cs.clientName, cs);
    const dataRow = sheet.getRow(rowIndex);
    values.forEach((val, ci) => {
      const cell = dataRow.getCell(ci + 1);
      cell.value = val;
      applyCellStyle(cell, i % 2 === 1);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    rowIndex++;
  }

  // Fila TOTAL (solo si hay más de un cliente)
  if (summary.clientSummaries.length > 1) {
    const totalValues = buildRowValues('TOTAL', summary);
    const totalRow = sheet.getRow(rowIndex);
    totalValues.forEach((val, ci) => {
      const cell = totalRow.getCell(ci + 1);
      cell.value = val;
      cell.font = { bold: true, size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.groupBg } };
      cell.border = {
        top: { style: 'thin', color: { argb: THEME.border } },
        bottom: { style: 'thin', color: { argb: THEME.border } },
        left: { style: 'thin', color: { argb: THEME.border } },
        right: { style: 'thin', color: { argb: THEME.border } },
      };
    });
  }

  // Anchos
  [12, 12, 30, 8, 14, 14, 16, 14, 14, 12, 14].forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
}

function buildDetailSheetByLine(workbook: ExcelJS.Workbook, result: PreparteReportResult) {
  const sheet = workbook.addWorksheet('Detalle');
  const { summary, details } = result;

  // Título
  sheet.mergeCells('A1:J1');
  const title = sheet.getCell('A1');
  title.value = 'Detalle — Por Línea';
  title.font = { bold: true, size: 14, color: { argb: THEME.primary } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  const headers = [
    'Nro Pedido',
    'Cliente',
    'Contrato',
    'Ítem',
    'Fecha Solicitud',
    'Fecha Ejecución',
    'Estado',
    'Motivo',
    'Solicitante',
    'Observaciones',
  ];

  const headerRow = sheet.getRow(3);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    applyHeaderStyle(cell);
  });
  headerRow.height = 28;

  // Ordenar por estado → fecha
  const sorted = [...details].sort((a, b) => {
    if (a.status !== b.status) return a.status.localeCompare(b.status);
    return (a.executionDate || '').localeCompare(b.executionDate || '');
  });

  let currentStatus = '';
  let rowIndex = 4;
  let dataRowCount = 0;

  for (const detail of sorted) {
    if (detail.status !== currentStatus) {
      currentStatus = detail.status;
      const statusLabel = STATUS_LABELS[currentStatus] || currentStatus;
      const statusCount = summary.byStatus[currentStatus]?.count ?? 0;
      const statusPct = summary.byStatus[currentStatus]?.percentage ?? 0;
      addGroupSeparator(sheet, rowIndex, headers.length, `${statusLabel} (${statusCount} — ${statusPct}%)`);
      rowIndex++;
      dataRowCount = 0;
    }

    const row = sheet.getRow(rowIndex);
    const cellValues = [
      detail.numero_pedido || '-',
      detail.clientName,
      detail.contractName,
      detail.itemName || '-',
      detail.requestDate || '-',
      detail.executionDate || '-',
      STATUS_LABELS[detail.status] || detail.status,
      detail.motivo || '-',
      detail.solicitante,
      detail.observaciones || '-',
    ];

    cellValues.forEach((val, i) => {
      const cell = row.getCell(i + 1);
      cell.value = val;
      applyCellStyle(cell, dataRowCount % 2 === 1);
    });

    rowIndex++;
    dataRowCount++;
  }

  [14, 25, 25, 25, 14, 14, 16, 30, 20, 30].forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
}

function buildDetailSheetByOrder(workbook: ExcelJS.Workbook, result: PreparteReportResult) {
  const sheet = workbook.addWorksheet('Detalle');
  const { summary, details } = result;

  // Título
  sheet.mergeCells('A1:I1');
  const title = sheet.getCell('A1');
  title.value = 'Detalle — Agrupado por Pedido';
  title.font = { bold: true, size: 14, color: { argb: THEME.primary } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  const headers = [
    'Nro Pedido',
    'Cliente',
    'Contrato',
    'Cant. Líneas',
    'Fecha Solicitud',
    'Fecha Ejecución',
    'Estado',
    'Motivo',
    'Solicitante',
  ];

  const headerRow = sheet.getRow(3);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    applyHeaderStyle(cell);
  });
  headerRow.height = 28;

  // Agrupar por numero_pedido
  const orderMap = new Map<
    string,
    {
      numero_pedido: string;
      clientName: string;
      contractName: string;
      lineCount: number;
      requestDate: string | null;
      executionDate: string | null;
      statuses: string[];
      motivos: Set<string>;
      solicitante: string;
    }
  >();

  for (const detail of details) {
    const key = detail.numero_pedido || detail.id;
    const existing = orderMap.get(key);
    if (existing) {
      existing.lineCount++;
      if (!existing.statuses.includes(detail.status)) {
        existing.statuses.push(detail.status);
      }
      if (detail.motivo) existing.motivos.add(detail.motivo);
    } else {
      orderMap.set(key, {
        numero_pedido: detail.numero_pedido || '-',
        clientName: detail.clientName,
        contractName: detail.contractName,
        lineCount: 1,
        requestDate: detail.requestDate,
        executionDate: detail.executionDate,
        statuses: [detail.status],
        motivos: new Set(detail.motivo ? [detail.motivo] : []),
        solicitante: detail.solicitante,
      });
    }
  }

  // Ordenar por estado predominante → fecha
  const orders = [...orderMap.values()].sort((a, b) => {
    const aStatus = a.statuses[0] || '';
    const bStatus = b.statuses[0] || '';
    if (aStatus !== bStatus) return aStatus.localeCompare(bStatus);
    return (a.executionDate || '').localeCompare(b.executionDate || '');
  });

  let currentStatus = '';
  let rowIndex = 4;
  let dataRowCount = 0;

  for (const order of orders) {
    const predominantStatus = order.statuses[0] || '';

    if (predominantStatus !== currentStatus) {
      currentStatus = predominantStatus;
      const statusLabel = STATUS_LABELS[currentStatus] || currentStatus;
      const statusCount = summary.byStatus[currentStatus]?.count ?? 0;
      const statusPct = summary.byStatus[currentStatus]?.percentage ?? 0;
      addGroupSeparator(sheet, rowIndex, 9, `${statusLabel} (${statusCount} — ${statusPct}%)`);
      rowIndex++;
      dataRowCount = 0;
    }

    const row = sheet.getRow(rowIndex);
    const statusDisplay = order.statuses.map((s) => STATUS_LABELS[s] || s).join(', ');
    const motivoDisplay = order.motivos.size > 0 ? [...order.motivos].join(' | ') : '-';

    const cellValues = [
      order.numero_pedido,
      order.clientName,
      order.contractName,
      order.lineCount,
      order.requestDate || '-',
      order.executionDate || '-',
      statusDisplay,
      motivoDisplay,
      order.solicitante,
    ];

    cellValues.forEach((val, i) => {
      const cell = row.getCell(i + 1);
      cell.value = val;
      applyCellStyle(cell, dataRowCount % 2 === 1);
    });

    rowIndex++;
    dataRowCount++;
  }

  [14, 25, 25, 12, 14, 14, 20, 30, 20].forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
}

// ── Componente ──────────────────────────────────────────────────────────

export function PreparteReportModal({ open, onOpenChange, customers }: PreparteReportModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      from: '',
      to: '',
      clientIds: [],
      statuses: [],
      groupBy: 'line',
    },
  });

  async function onSubmit(values: ReportFormValues) {
    setIsGenerating(true);
    try {
      const result = await getPreparteReportData({
        from: values.from,
        to: values.to,
        clientIds: values.clientIds.length > 0 ? values.clientIds : undefined,
        statuses: values.statuses.length > 0 ? (values.statuses as preparte_status[]) : undefined,
        groupBy: values.groupBy,
      });

      if (result.summary.total === 0) {
        toast.warning('No se encontraron registros con los filtros seleccionados');
        setIsGenerating(false);
        return;
      }

      // Generar Excel
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Sistema de Gestión';
      workbook.created = new Date();

      buildSummarySheet(workbook, result.summary);

      if (values.groupBy === 'line') {
        buildDetailSheetByLine(workbook, result);
      } else {
        buildDetailSheetByOrder(workbook, result);
      }

      const fromFormatted = moment(values.from).format('DDMMYYYY');
      const toFormatted = moment(values.to).format('DDMMYYYY');
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      saveAs(blob, `Informe_Pedidos_${fromFormatted}_${toFormatted}.xlsx`);

      toast.success('Informe generado exitosamente');
      onOpenChange(false);
    } catch (error) {
      logger.error('Error generando reporte', { data: { error } });
      toast.error('Error al generar el informe');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Generar Informe</DialogTitle>
          <DialogDescription>Seleccione los filtros para generar el informe de pedidos</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Fechas */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Desde</FormLabel>
                    <FormControl>
                      <EnhancedDatePicker
                        id={field.name}
                        name={field.name}
                        date={field.value || undefined}
                        setDate={(date) => field.onChange(date ? moment(date).format('YYYY-MM-DD') : '')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hasta</FormLabel>
                    <FormControl>
                      <EnhancedDatePicker
                        id={field.name}
                        name={field.name}
                        date={field.value || undefined}
                        setDate={(date) => field.onChange(date ? moment(date).format('YYYY-MM-DD') : '')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Clientes */}
            <FormField
              control={form.control}
              name="clientIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Clientes <span className="text-muted-foreground font-normal">(vacío = todos)</span>
                  </FormLabel>
                  <FormControl>
                    <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1">
                      {customers.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent rounded px-1 py-0.5"
                        >
                          <Checkbox
                            checked={field.value.includes(c.id)}
                            onCheckedChange={(checked) => {
                              if (checked === true) {
                                field.onChange([...field.value, c.id]);
                              } else {
                                field.onChange(field.value.filter((id) => id !== c.id));
                              }
                            }}
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Estados */}
            <FormField
              control={form.control}
              name="statuses"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Estados <span className="text-muted-foreground font-normal">(vacío = todos)</span>
                  </FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-1 gap-1 rounded-md border p-2 sm:grid-cols-2">
                      {ALL_STATUSES.map((s) => (
                        <label
                          key={s}
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent rounded px-1 py-0.5"
                        >
                          <Checkbox
                            checked={field.value.includes(s)}
                            onCheckedChange={(checked) => {
                              if (checked === true) {
                                field.onChange([...field.value, s]);
                              } else {
                                field.onChange(field.value.filter((v) => v !== s));
                              }
                            }}
                          />
                          {STATUS_LABELS[s] || s}
                        </label>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Agrupar por */}
            <FormField
              control={form.control}
              name="groupBy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agrupar por</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="line" id="group-line" />
                        <Label htmlFor="group-line">Línea</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="order" id="group-order" />
                        <Label htmlFor="group-order">Pedido</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isGenerating}>
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Generar Informe
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
