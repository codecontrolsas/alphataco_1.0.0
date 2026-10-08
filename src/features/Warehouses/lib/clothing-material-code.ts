/**
 * Codigo y nombre del material de una combinacion de ropa (articulo + marca + talle), Almacenes
 * etapa 5. La MISMA regla esta escrita en SQL en la migracion 20261007200000_clothing_stock (que
 * crea los materiales de las combinaciones existentes): si se cambia una, se cambia la otra.
 *
 *   codigo = {articulo}-{marca, 3 letras}-{talle}   ej. IND-001-OMB-42
 *   - articulo: su codigo; si no tiene, las primeras 6 letras/numeros del nombre.
 *   - todo en mayusculas, sin acentos, solo letras, numeros y guiones.
 *   - si el codigo ya existe en la empresa: sufijo -2, -3...
 */

/** Acentos y eñes a ASCII: el mismo `translate` que usa la migracion. */
const FROM = 'áéíóúàèìòùäëïöüâêîôûñçÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ';
const TO = 'aeiouaeiouaeiouaeiouncAEIOUAEIOUAEIOUAEIOUNC';

function toAscii(value: string): string {
  return [...value].map((ch) => {
    const i = FROM.indexOf(ch);
    return i >= 0 ? TO[i]! : ch;
  }).join('');
}

/** Mayusculas, sin acentos y solo [A-Z0-9-] (o sin guiones si `keepHyphens` es false). */
function clean(value: string, keepHyphens: boolean): string {
  const upper = toAscii(value).toUpperCase();
  return upper.replace(keepHyphens ? /[^A-Z0-9-]/g : /[^A-Z0-9]/g, '');
}

export interface ClothingCombination {
  itemCode: string | null;
  itemName: string;
  brandName: string;
  sizeName: string;
}

/** Codigo base, sin sufijo de colision. */
export function clothingMaterialBaseCode(c: ClothingCombination): string {
  const item = c.itemCode && clean(c.itemCode, true) ? clean(c.itemCode, true) : clean(c.itemName, false).slice(0, 6);
  const brand = clean(c.brandName, false).slice(0, 3);
  const size = clean(c.sizeName, false);
  return [item || 'ROPA', brand || 'SM', size || 'U'].join('-');
}

/** Codigo libre en la empresa: el base, o el base con -2, -3... si ya esta tomado. */
export function clothingMaterialCode(c: ClothingCombination, taken: ReadonlySet<string>): string {
  const base = clothingMaterialBaseCode(c);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** "Camisa · Ombú · 42". */
export function clothingMaterialName(c: Pick<ClothingCombination, 'itemName' | 'brandName' | 'sizeName'>): string {
  return `${c.itemName.trim()} · ${c.brandName.trim()} · ${c.sizeName.trim()}`;
}
