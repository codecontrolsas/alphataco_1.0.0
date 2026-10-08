/**
 * Codigo y nombre del material de una combinacion tipo + marca de cubierta, Almacenes etapa 6.
 * La MISMA regla esta escrita en SQL en la migracion 20261007210000_tire_stock (que crea los
 * materiales de las combinaciones existentes): si se cambia una, se cambia la otra.
 *
 *   codigo = CUB-{medida}-{dibujo}-{marca, 3 letras}   ej. CUB-295/80R22.5-MIX-FIR
 *   - medida: en mayusculas, sin espacios, solo letras, numeros, "/" y ".".
 *   - dibujo: SMOOTH -> LIS, MIXED -> MIX, BLOCK -> TAC.
 *   - marca: sus 3 primeras letras/numeros, sin acentos.
 *   - si el codigo ya existe en la empresa: sufijo -2, -3...
 */

import type { TireTreadType } from '@/generated/prisma/enums';

const FROM = 'áéíóúàèìòùäëïöüâêîôûñçÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ';
const TO = 'aeiouaeiouaeiouaeiouncAEIOUAEIOUAEIOUAEIOUNC';

function toAscii(value: string): string {
  return [...value]
    .map((ch) => {
      const i = FROM.indexOf(ch);
      return i >= 0 ? TO[i]! : ch;
    })
    .join('');
}

const TREAD_CODES: Record<TireTreadType, string> = { SMOOTH: 'LIS', MIXED: 'MIX', BLOCK: 'TAC' };
/** Las mismas etiquetas que `tireTreadTypeLabels` de Gomeria. */
const TREAD_LABELS: Record<TireTreadType, string> = { SMOOTH: 'Liso', MIXED: 'Mixto', BLOCK: 'Taco' };

export interface TireCombination {
  size: string;
  treadType: TireTreadType;
  brandName: string;
}

/** Codigo base, sin sufijo de colision. */
export function tireMaterialBaseCode(c: TireCombination): string {
  const size = toAscii(c.size).toUpperCase().replace(/[^A-Z0-9/.]/g, '');
  const brand = toAscii(c.brandName).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  return ['CUB', size || 'S', TREAD_CODES[c.treadType], brand || 'SM'].join('-');
}

/** Codigo libre en la empresa: el base, o el base con -2, -3... si ya esta tomado. */
export function tireMaterialCode(c: TireCombination, taken: ReadonlySet<string>): string {
  const base = tireMaterialBaseCode(c);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** "Cubierta 295/80R22.5 Mixto · Firestone". */
export function tireMaterialName(c: TireCombination): string {
  return `Cubierta ${c.size.trim()} ${TREAD_LABELS[c.treadType]} · ${c.brandName.trim()}`;
}
