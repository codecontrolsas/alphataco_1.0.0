import 'server-only';

import { readdir } from 'node:fs/promises';
import path from 'node:path';

let cached: Promise<string[]> | null = null;

/**
 * Nombres de las carpetas de `prisma/migrations/` que trae esta imagen (el Dockerfile copia `prisma/` al
 * runtime). No cambia sin un redeploy, así que se calcula una vez por proceso.
 */
export function listMigrationsOnDisk(): Promise<string[]> {
  if (!cached) {
    cached = readdir(path.join(process.cwd(), 'prisma', 'migrations'), { withFileTypes: true })
      .then((entries) =>
        entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort()
      )
      .catch((error) => {
        cached = null; // no se cachea un fallo
        throw error;
      });
  }
  return cached;
}
