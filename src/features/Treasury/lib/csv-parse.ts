/**
 * Lector de CSV para los extractos bancarios (spec Tesorería etapa 4 §3.1). Módulo SIN directiva:
 * corre en el navegador. Detecta el separador (`;`, `,` o tabulador) por la primera línea, respeta
 * comillas dobles (con `""` escapadas y saltos de línea adentro) y descarta el BOM.
 */

const DELIMITERS = [';', ',', '\t'] as const;

/**
 * El separador se decide por las primeras 20 líneas no vacías (los home banking suelen poner un
 * título o el período antes de los datos): gana el que aparece en más líneas con la misma cantidad
 * de veces (la moda), es decir, el que arma columnas parejas.
 */
function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 20);
  let best: string = ',';
  let bestScore = -1;
  for (const d of DELIMITERS) {
    const counts = new Map<number, number>();
    for (const line of lines) {
      const n = line.split(d).length - 1;
      if (n > 0) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    const score = Math.max(0, ...counts.values());
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  if (text.trim() === '') return [];
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
