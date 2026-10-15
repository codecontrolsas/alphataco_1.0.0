import { parseCsv } from '../../lib/csv-parse';
import type { DecimalSeparator } from '../../lib/statement-parse';

/**
 * Lectura del archivo del extracto en el navegador (spec Tesorería etapa 4 §1: el archivo no viaja
 * al servidor). CSV con el parser propio; Excel con `exceljs` (no se usa `xlsx` con archivos
 * subidos). Las celdas numéricas y de fecha se conservan con su tipo hasta saber el separador
 * decimal del perfil (`cellText`).
 */

export type RawCell = string | number | Date;
export type RawRows = RawCell[][];

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

type ExcelValue = { result?: unknown; richText?: { text: string }[]; text?: string } | string | number | boolean | Date | null | undefined;

function excelCell(value: ExcelValue): RawCell {
  if (value === null || value === undefined) return '';
  if (value instanceof Date || typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('');
  if (value.result !== undefined) return excelCell(value.result as ExcelValue);
  if (typeof value.text === 'string') return value.text;
  return '';
}

export async function readStatementFile(file: File): Promise<RawRows> {
  if (file.size > MAX_FILE_BYTES) throw new Error('El archivo pesa más de 5 MB');
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    // Los home banking suelen exportar en latin1: si el texto en UTF-8 trae caracteres inválidos, se relee así.
    const buffer = await file.arrayBuffer();
    const utf8 = new TextDecoder('utf-8').decode(buffer);
    const text = utf8.includes('�') ? new TextDecoder('windows-1252').decode(buffer) : utf8;
    return parseCsv(text);
  }
  if (name.endsWith('.xlsx')) {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const rows: RawRows = [];
    for (let r = 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const cells: RawCell[] = [];
      for (let c = 1; c <= Math.min(row.cellCount, 60); c += 1) cells.push(excelCell(row.getCell(c).value as ExcelValue));
      rows.push(cells);
    }
    return rows;
  }
  throw new Error('Formato no soportado: subí un .xlsx o un .csv');
}

/** Texto de una celda para el perfil: fechas en ISO y números con el separador decimal del perfil. */
export function cellText(cell: RawCell, decimalSeparator: DecimalSeparator): string {
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? '' : cell.toISOString().slice(0, 10);
  if (typeof cell === 'number') {
    // Solo texto para el perfil de importación: el parseo a importe lo hace `parseScaled` (bigint) en el paso siguiente.
    // El redondeo a 2 decimales evita ruido de punto flotante de Excel (p. ej. 0.1 + 0.2) antes de convertir a texto.
    const fixed = Math.round(cell * 100) / 100;
    return String(fixed).replace('.', decimalSeparator);
  }
  return cell;
}

export function rowsAsText(rows: RawRows, decimalSeparator: DecimalSeparator): string[][] {
  return rows.map((r) => r.map((c) => cellText(c, decimalSeparator).slice(0, 500)));
}
