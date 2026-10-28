import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gatedTables } from './catalog';

/**
 * Los lotes de RLS por módulo (F3.4) son migraciones con `app_enable_module_gate(...)`. Este test, sin base de datos,
 * exige que digan EXACTAMENTE lo que dice el catálogo: una tabla nueva en `catalog.tables` sin lote, o un lote que sobra
 * o con otras claves, falla en `npm test`. (El de integración comprueba lo mismo contra la base migrada.)
 */
const MIGRATIONS = join(process.cwd(), 'prisma', 'migrations');
const CALL =
  /app_enable_module_gate\('public\.(\w+)',\s*ARRAY\[([^\]]*)\]::text\[\](?:,\s*ARRAY\[([^\]]*)\]::text\[\])?\)/g;

function keys(list: string | undefined): string {
  return (list ?? '')
    .split(',')
    .map((key) => key.trim().replaceAll("'", ''))
    .filter(Boolean)
    .sort()
    .join(',');
}

describe('lotes de RLS por módulo: migraciones vs. catálogo', () => {
  const lots = readdirSync(MIGRATIONS).filter((dir) => dir.includes('_module_gate_lot_'));
  const declared = new Map<string, string>();
  for (const dir of lots) {
    const sql = readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8');
    for (const match of sql.matchAll(CALL)) {
      if (declared.has(match[1])) throw new Error(`${match[1]} aparece en dos lotes`);
      declared.set(match[1], `${keys(match[2])}|${keys(match[3])}`);
    }
  }

  it('hay seis lotes', () => {
    expect(lots).toHaveLength(6);
  });

  it('cada tabla con compuerta del catálogo está en un lote con las mismas claves, y no sobra ninguna', () => {
    const expected = new Map(
      gatedTables().map((gate) => [gate.table, `${[...gate.all].sort().join(',')}|${[...gate.any].sort().join(',')}`])
    );
    expect(Object.fromEntries(declared)).toEqual(Object.fromEntries(expected));
  });
});
