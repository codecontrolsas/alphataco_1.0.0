/**
 * Contexto que recorre todos los dominios del reset: la transaccion, el calendario, el
 * generador de datos y la lista de archivos a subir a RustFS. Tambien los helpers de base que
 * usan varios dominios.
 */
import type { Faker } from '@faker-js/faker';
import type { Prisma } from '../../../src/generated/prisma/client.ts';
import type { DemoCalendar } from './dates.ts';
import { renderDocSheet, type DocSheet } from './pdf.ts';

export type Tx = Prisma.TransactionClient;

export interface DemoFile {
  bucket: string;
  key: string;
  body: Uint8Array;
  contentType: string;
}

export interface DemoCompany {
  id: string;
  name: string;
  cuit: string;
}

export interface Ctx {
  tx: Tx;
  cal: DemoCalendar;
  faker: Faker;
  company: DemoCompany;
  /** `profile.id` (= `credential_id`) del admin demo: actor de la transaccion. */
  actorId: string;
  /** Archivos que se suben antes del COMMIT. */
  files: DemoFile[];
  log: (message: string) => void;
}

/** Inserta en lotes: `createMany` con miles de filas arma un statement enorme. */
export async function insertMany<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>, size = 2000): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await insert(rows.slice(i, i + size));
  }
}

/**
 * Corre `fn` sin triggers ni chequeos de FK (`session_replication_role = replica`), para las
 * cargas masivas cuyos triggers solo escriben historial. Si `fn` falla no hace falta restaurar:
 * el error aborta la transaccion entera.
 */
export async function withoutTriggers<T>(tx: Tx, fn: () => Promise<T>): Promise<T> {
  await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
  const result = await fn();
  await tx.$executeRawUnsafe('SET LOCAL session_replication_role = origin');
  return result;
}

/** Deja las secuencias de las tablas con id serial por encima del maximo insertado. */
export async function syncSequences(tx: Tx, tables: string[]): Promise<void> {
  for (const table of tables) {
    await tx.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${table}"), 1))`
    );
  }
}

/** Genera un PDF con el membrete de la empresa demo y lo encola para subir. */
export async function addPdf(ctx: Ctx, bucket: string, key: string, sheet: Omit<DocSheet, 'companyName' | 'companyCuit'>): Promise<void> {
  const body = await renderDocSheet({ ...sheet, companyName: ctx.company.name, companyCuit: ctx.company.cuit });
  ctx.files.push({ bucket, key, body, contentType: 'application/pdf' });
}
