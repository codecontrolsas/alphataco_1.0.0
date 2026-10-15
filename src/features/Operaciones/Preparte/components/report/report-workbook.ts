/**
 * Armado del libro Excel del informe de pedidos (hojas de resumen y detalle).
 * Sin React: recibe el resultado del servidor y devuelve el `Workbook`.
 */
import { formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';
import ExcelJS from 'exceljs';
import type { PreparteReportResult, PreparteReportSummary } from '../../actions/report.server';
import { STATUS_LABELS, type ReportFormValues } from './report-schema';

const THEME = {
  primary: '374151',
  headerText: 'FFFFFF',
  border: 'e5e7eb',
  alternateRow: 'f9fafb',
  groupBg: 'e5e7eb',
  groupText: '1f2937',
};

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
  const [generatedDay, generatedTime] = formatArgentinaDateTime(new Date()).split(' ');
  dateCell.value = `Generado el ${generatedDay} a las ${generatedTime}`;
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
      formatDateAr(summary.from),
      formatDateAr(summary.to),
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

/** Libro completo: hoja "Resumen" + hoja "Detalle" por línea o por pedido. */
export function buildPreparteReportWorkbook(result: PreparteReportResult, groupBy: ReportFormValues['groupBy']) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema de Gestión';
  workbook.created = new Date();

  buildSummarySheet(workbook, result.summary);

  if (groupBy === 'line') {
    buildDetailSheetByLine(workbook, result);
  } else {
    buildDetailSheetByOrder(workbook, result);
  }

  return workbook;
}

/** Nombre del archivo a partir del rango (`YYYY-MM-DD`): `Informe_Pedidos_DDMMYYYY_DDMMYYYY.xlsx`. */
export function getPreparteReportFileName(from: string, to: string) {
  const compact = (isoDate: string) => formatDateAr(isoDate).replaceAll('/', '');
  return `Informe_Pedidos_${compact(from)}_${compact(to)}.xlsx`;
}
