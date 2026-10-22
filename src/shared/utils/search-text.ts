const DIACRITICS = /[̀-ͯ]/g;

/** Minúsculas y sin acentos: "Ñandú" y "nandu" se buscan igual. */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim();
}
