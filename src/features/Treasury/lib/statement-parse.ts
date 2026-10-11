/**
 * Lectura del extracto bancario (spec Tesorería etapa 4 §3.1). Módulo SIN directiva: lo usan la
 * vista previa del navegador y la importación del servidor, que vuelve a parsear y validar.
 * Recibe las filas ya leídas del archivo como texto (`string[][]`) y el perfil de columnas.
 */

export const STATEMENT_DATE_FORMATS = ['DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM/DD/YYYY'] as const;
export type StatementDateFormat = (typeof STATEMENT_DATE_FORMATS)[number];
export type DecimalSeparator = ',' | '.';

export type StatementProfile = {
  /** Fila del encabezado (desde 1): los datos empiezan en la siguiente. */
  headerRow: number;
  dateColumn: string;
  descriptionColumn: string;
  referenceColumn: string | null;
  /** Una columna con signo, o débito y crédito separados. */
  amountColumn: string | null;
  debitColumn: string | null;
  creditColumn: string | null;
  dateFormat: StatementDateFormat;
  decimalSeparator: DecimalSeparator;
};

export type StatementLine = {
  /** Fila del archivo (desde 1). */
  row: number;
  date: string;
  description: string;
  reference: string;
  /** Con signo: positivo crédito, negativo débito. */
  amountCents: bigint;
  /** Clave de repetidos: fecha, importe, descripción, referencia y n.º de aparición dentro del archivo. */
  key: string;
};

const pad = (n: number) => String(n).padStart(2, '0');
const MAX_CENTS = BigInt('1000000000000000');

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Fecha del extracto → `YYYY-MM-DD`, o null. Una fecha ISO se acepta siempre (es como Excel entrega las celdas de fecha). */
export function parseStatementDate(value: string, format: StatementDateFormat): string | null {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  if (format === 'YYYY-MM-DD') return null;
  const sep = format === 'DD-MM-YYYY' ? '-' : '/';
  const parts = text.split(sep);
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const [a, b, c] = parts.map(Number) as [number, number, number];
  const year = parts[2]!.length === 2 ? 2000 + c : parts[2]!.length === 4 ? c : NaN;
  if (Number.isNaN(year)) return null;
  return format === 'MM/DD/YYYY' ? validDate(year, a, b) : validDate(year, b, a);
}

/**
 * Importe del extracto → centavos con signo, o null si no es un número. Vacío es 0. Acepta `$`,
 * separadores de miles, el signo adelante o atrás y los negativos entre paréntesis.
 */
export function parseStatementAmount(value: string, decimalSeparator: DecimalSeparator): bigint | null {
  let text = value.replace(/\$|ARS|\s/g, '');
  if (text === '') return BigInt(0);
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.endsWith('-')) {
    negative = !negative;
    text = text.slice(0, -1);
  } else if (text.startsWith('+')) text = text.slice(1);
  const thousands = decimalSeparator === ',' ? '.' : ',';
  text = text.split(thousands).join('');
  const [int, dec = '', ...rest] = text.split(decimalSeparator);
  if (rest.length > 0 || !int || !/^\d+$/.test(int) || !/^\d{0,2}$/.test(dec)) return null;
  const cents = BigInt(int) * BigInt(100) + BigInt(dec.padEnd(2, '0') || '0');
  return negative ? -cents : cents;
}

/** Letra de columna (`A`, `AB`) → índice desde 0, o null. */
export function columnIndex(letter: string | null): number | null {
  if (!letter || !/^[A-Za-z]{1,3}$/.test(letter)) return null;
  return letter
    .toUpperCase()
    .split('')
    .reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
}

/** Letra de una columna desde su índice (para la vista previa). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const cell = (row: string[], letter: string | null) => {
  const i = columnIndex(letter);
  return i === null ? '' : (row[i] ?? '').toString().trim();
};

/**
 * Líneas del extracto según el perfil. Saltea las filas vacías y las de importe 0; una fila con
 * datos y fecha o importe inválidos es un error con su número de fila (no se importa a medias).
 */
export function buildStatementLines(rows: string[][], profile: StatementProfile): { lines: StatementLine[]; errors: string[] } {
  const lines: StatementLine[] = [];
  const errors: string[] = [];
  const seen = new Map<string, number>();
  for (let i = Math.max(profile.headerRow, 0); i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const rowNumber = i + 1;
    if (row.every((c) => (c ?? '').toString().trim() === '')) continue;
    const rawDate = cell(row, profile.dateColumn);
    const description = cell(row, profile.descriptionColumn).replace(/\s+/g, ' ');
    const reference = cell(row, profile.referenceColumn);
    let amount: bigint | null;
    let rawAmount: string;
    if (profile.amountColumn) {
      rawAmount = cell(row, profile.amountColumn);
      amount = parseStatementAmount(rawAmount, profile.decimalSeparator);
    } else {
      const debit = cell(row, profile.debitColumn);
      const credit = cell(row, profile.creditColumn);
      rawAmount = debit || credit;
      const d = parseStatementAmount(debit, profile.decimalSeparator);
      const c = parseStatementAmount(credit, profile.decimalSeparator);
      amount = d === null || c === null ? null : c - (d < BigInt(0) ? -d : d);
    }
    const date = parseStatementDate(rawDate, profile.dateFormat);
    if (!date) {
      errors.push(`Fila ${rowNumber}: fecha inválida («${rawDate}»)`);
      continue;
    }
    if (amount === null) {
      errors.push(`Fila ${rowNumber}: importe inválido («${rawAmount}»)`);
      continue;
    }
    if (amount === BigInt(0)) continue;
    // numeric(15,2): hasta 13 dígitos enteros.
    if (amount >= MAX_CENTS || amount <= -MAX_CENTS) {
      errors.push(`Fila ${rowNumber}: importe fuera de rango («${rawAmount}»)`);
      continue;
    }
    const base = `${date}|${amount}|${description}|${reference}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    lines.push({ row: rowNumber, date, description, reference, amountCents: amount, key: `${base}|${n}` });
  }
  return { lines, errors };
}
