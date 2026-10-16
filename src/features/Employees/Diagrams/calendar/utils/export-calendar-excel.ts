import moment from 'moment';
import {
  getDiagramExportDetails,
  type DiagramCalendarRow,
  type DiagramCalendarType,
  type DiagramExportDetails,
} from '../../actions/diagram-search-actions';
import { formatEmployeeName, type CalendarDay } from './calendar-filters';

const EXPORT_CHUNK_SIZE = 1000;

/** `#rrggbb` → `FFRRGGBB` (formato de color de las celdas del Excel). */
function toExcelColor(hex: string) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return match ? `FF${match[1]}${match[2]}${match[3]}` : 'FFFFFFFF';
}

/**
 * Genera y descarga el Excel de los empleados cargados en la grilla y los días visibles. Los datos de ficha
 * (puesto, sector, convenio...) se piden recién ahora y de una sola vez; `xlsx` se carga solo al exportar.
 */
export async function exportCalendarToExcel(params: {
  rows: DiagramCalendarRow[];
  days: CalendarDay[];
  typesById: Map<string, DiagramCalendarType>;
  today: string;
}) {
  const { rows, days, typesById, today } = params;

  const chunks: string[][] = [];
  for (let start = 0; start < rows.length; start += EXPORT_CHUNK_SIZE) {
    chunks.push(rows.slice(start, start + EXPORT_CHUNK_SIZE).map((row) => row.id));
  }
  const details: Record<string, DiagramExportDetails> = Object.assign(
    {},
    ...(await Promise.all(chunks.map((ids) => getDiagramExportDetails(ids))))
  );

  const XLSX = await import('xlsx');

  const fixedColumns = [
    'Legajo',
    'Empleado',
    'Puesto',
    'Sector',
    'Fecha de ingreso',
    'Diagrama',
    'Centro de Costo',
    'Categoría',
    'Convenio',
    'Sindicato',
  ];
  const sheetRows: string[][] = [[...fixedColumns, ...days.map((day) => day.label)]];

  for (const row of rows) {
    const info = details[row.id];
    sheetRows.push([
      row.file,
      formatEmployeeName(row),
      info?.position ?? '',
      info?.sector ?? '',
      info?.dateOfAdmission ? moment.utc(info.dateOfAdmission).format('DD/MM/YYYY') : '',
      info?.workDiagram ?? '',
      info?.costCenter ?? '',
      info?.category ?? '',
      info?.covenant ?? '',
      info?.guild ?? '',
      ...days.map((day) => {
        const entry = row.days[day.key];
        return entry ? typesById.get(entry.typeId)?.short_description ?? '' : '';
      }),
    ]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);

  rows.forEach((row, rowIndex) => {
    days.forEach((day, dayIndex) => {
      const entry = row.days[day.key];
      const color = entry ? typesById.get(entry.typeId)?.color : undefined;
      if (!color) return;
      const address = XLSX.utils.encode_cell({ r: rowIndex + 1, c: fixedColumns.length + dayIndex });
      const rgb = toExcelColor(color);
      worksheet[address] = {
        ...worksheet[address],
        s: { fill: { patternType: 'solid', fgColor: { rgb }, bgColor: { rgb } } },
      };
    });
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Diagramas');
  XLSX.writeFile(workbook, `Diagramas_${moment(today, 'YYYY-MM-DD').format('MMDD')}.xlsx`, { compression: true });
}
