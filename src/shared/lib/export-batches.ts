import 'server-only';

/** Tope de filas por export: más que esto no se descarga entero (se pide acotar con filtros). */
export const EXPORT_MAX_ROWS = 50_000;

/** Filas que se traen por consulta al armar el export. */
export const EXPORT_BATCH_SIZE = 1_000;

/** Tandas que se consultan a la vez (el pool de Prisma es chico: no subir sin medir). */
const EXPORT_PARALLEL_BATCHES = 4;

/** El export supera `EXPORT_MAX_ROWS` con los filtros actuales. */
export class ExportTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportTooLargeError';
  }
}

interface FetchExportRowsOptions<Row extends { id: string }> {
  /**
   * Consulta liviana que devuelve SOLO los ids ya ordenados (con `id` como desempate para que el orden sea
   * determinista), hasta `take` filas.
   */
  listIds: (take: number) => Promise<Array<{ id: string }>>;
  /** Trae las filas completas de una tanda de ids (`id IN (...)`, índice por PK); el orden lo reubica la fábrica. */
  fetchByIds: (ids: string[]) => Promise<Row[]>;
  /** Mensaje del error cuando se supera el tope. */
  tooLargeMessage: (maxRows: number) => string;
  maxRows?: number;
  batchSize?: number;
}

/**
 * Trae las filas de un export por tandas, en el mismo orden que una sola consulta.
 *
 * 1. `listIds` devuelve los ids ordenados y detecta si se pasó del tope (pide `maxRows + 1`).
 * 2. Las filas completas se traen en tandas de `batchSize` y se reubican según el orden de los ids. Evita
 *    materializar de golpe el select completo con todas sus relaciones.
 *
 * Lanza `ExportTooLargeError` si el resultado supera `maxRows`.
 */
export async function fetchExportRowsInBatches<Row extends { id: string }>({
  listIds,
  fetchByIds,
  tooLargeMessage,
  maxRows = EXPORT_MAX_ROWS,
  batchSize = EXPORT_BATCH_SIZE,
}: FetchExportRowsOptions<Row>): Promise<Row[]> {
  const orderedIds = await listIds(maxRows + 1);

  if (orderedIds.length > maxRows) {
    throw new ExportTooLargeError(tooLargeMessage(maxRows));
  }

  const batches: string[][] = [];
  for (let offset = 0; offset < orderedIds.length; offset += batchSize) {
    batches.push(orderedIds.slice(offset, offset + batchSize).map((row) => row.id));
  }

  const rows: Row[] = [];

  // Tandas en grupos paralelos acotados: no se materializa todo de golpe y la latencia no se suma tanda a tanda.
  for (let i = 0; i < batches.length; i += EXPORT_PARALLEL_BATCHES) {
    const group = batches.slice(i, i + EXPORT_PARALLEL_BATCHES);
    const results = await Promise.all(group.map((ids) => fetchByIds(ids)));
    results.forEach((batch, index) => {
      const byId = new Map(batch.map((row) => [row.id, row]));
      for (const id of group[index]) {
        const row = byId.get(id);
        if (row) rows.push(row);
      }
    });
  }

  return rows;
}
