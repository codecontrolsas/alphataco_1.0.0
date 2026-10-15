import type { normalizeRows } from './users-query';

/** Fila de la lista de usuarios (regulares + propietario), inferida de `normalizeRows`. */
export type CompanyUserRow = Awaited<ReturnType<typeof normalizeRows>>[number];

export type CompanyUserListItem = CompanyUserRow;

/** Resultado de una faceta de la lista de usuarios: conteos por valor y, si hace falta, las opciones resueltas. */
export type CompanyUserFacetResult = {
  counts: Map<string, number>;
  resolvedOptions?: Array<{ value: string; label: string }>;
};
