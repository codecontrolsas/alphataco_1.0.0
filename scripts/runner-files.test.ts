import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Los scripts que corre el contenedor (`seed-company.ts`, `ensure-buckets.ts`, `bootstrap-admin.ts`) se
 * ejecutan en la imagen de producción con SOLO los archivos que el `Dockerfile` copia al runner y con Node
 * ejecutando TypeScript tal cual (sin bundler, sin alias, sin resolver extensiones). Si un script importa
 * algo que el runner no tiene, falla recién en el primer arranque de una instancia nueva
 * (`ERR_MODULE_NOT_FOUND`), que fue lo que pasó con `permission-catalog.ts` y `prisma-pg-config.ts`.
 *
 * Este test recorre los imports de cada script y exige que:
 * - los imports locales sean relativos y con extensión `.ts` (Node no entiende el alias `@/` ni resuelve extensiones);
 * - cada archivo local alcanzado tenga su `COPY` en el runner, con el mismo destino;
 * - cada paquete npm importado figure en el Dockerfile (instalado por algún stage).
 *
 * No reemplaza a un `docker build` + correr el script en la imagen (ver `docs/arquitectura/LOOP-ESTADO.md`).
 */

const ROOT = process.cwd();

/** Scripts que el contenedor ejecuta solos en cada arranque (los llama el entrypoint). */
const ENTRYPOINT_SCRIPTS = ['scripts/seed-company.ts', 'scripts/ensure-buckets.ts'];
/** Además, scripts que se corren a mano dentro del contenedor (runbook). */
const MANUAL_SCRIPTS = ['scripts/bootstrap-admin.ts'];
const ENTRY_SCRIPTS = [...ENTRYPOINT_SCRIPTS, ...MANUAL_SCRIPTS];

/** Carpetas que el runner copia enteras. */
const COPIED_DIRECTORIES = ['src/generated'];

const IMPORT_RE =
  /\b(import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

interface ImportRef {
  specifier: string;
  /** `import type` / `export type`: se borra al ejecutar, no necesita existir en runtime. */
  typeOnly: boolean;
}

function readImports(file: string): ImportRef[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(IMPORT_RE)].flatMap((match) => {
    const specifier = match[3] ?? match[4];
    return specifier ? [{ specifier, typeOnly: Boolean(match[2]) }] : [];
  });
}

interface Graph {
  /** Archivos locales alcanzados (relativos al repo), incluida la entrada. */
  files: Set<string>;
  /** Imports que Node no podría resolver en la imagen. */
  problems: string[];
  /** Paquetes npm (no `node:`) que importa algún archivo del grafo. */
  packages: Set<string>;
}

function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function walk(entry: string, graph: Graph = { files: new Set(), problems: [], packages: new Set() }): Graph {
  if (graph.files.has(entry)) return graph;
  // Lo que viene de una carpeta que el runner copia entera (el cliente de Prisma generado) no se recorre.
  if (COPIED_DIRECTORIES.some((dir) => entry.startsWith(`${dir}/`))) return graph;
  graph.files.add(entry);

  const absolute = path.join(ROOT, entry);
  for (const { specifier, typeOnly } of readImports(absolute)) {
    if (specifier.startsWith('node:')) continue;

    if (!specifier.startsWith('.')) {
      if (specifier.startsWith('@/')) {
        if (!typeOnly) graph.problems.push(`${entry}: usa el alias "${specifier}", que Node no resuelve en la imagen`);
        continue;
      }
      if (!typeOnly) graph.packages.add(packageName(specifier));
      continue;
    }

    const resolved = path.relative(ROOT, path.resolve(path.dirname(absolute), specifier));
    if (typeOnly) continue;
    if (COPIED_DIRECTORIES.some((dir) => resolved.startsWith(`${dir}/`))) continue;
    if (!resolved.endsWith('.ts')) {
      graph.problems.push(`${entry}: el import "${specifier}" no termina en .ts (Node no resuelve extensiones)`);
      continue;
    }
    if (!existsSync(path.join(ROOT, resolved))) {
      graph.problems.push(`${entry}: el import "${specifier}" no existe`);
      continue;
    }
    walk(resolved, graph);
  }
  return graph;
}

/** Pares `origen -> destino` de los `COPY --from=build` del stage runner. */
function runnerCopies(dockerfile: string): Array<{ from: string; to: string }> {
  const runner = dockerfile.slice(dockerfile.lastIndexOf('AS runner'));
  return [...runner.matchAll(/^COPY\s+--from=build\s+(?:--chown=\S+\s+)?\/app\/(\S+)\s+(\S+)/gm)].map((match) => ({
    from: match[1].replace(/\/$/, ''),
    to: match[2].replace(/\/$/, ''),
  }));
}

describe('archivos que el runner de la imagen necesita para los scripts del contenedor', () => {
  const dockerfile = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
  const copies = runnerCopies(dockerfile);

  it.each(ENTRY_SCRIPTS)('%s: imports resolubles por Node y todo copiado al runner', (entry) => {
    const graph = walk(entry);

    const notCopied = [...graph.files].filter((file) => !copies.some((copy) => copy.from === file));
    const wrongDestination = [...graph.files].flatMap((file) =>
      copies.filter((copy) => copy.from === file && copy.to !== `./${file}`).map((copy) => `${file} -> ${copy.to}`)
    );
    const packagesNotInstalled = [...graph.packages].filter((pkg) => !dockerfile.includes(pkg));

    expect({ problems: graph.problems, notCopied, wrongDestination, packagesNotInstalled }).toEqual({
      problems: [],
      notCopied: [],
      wrongDestination: [],
      packagesNotInstalled: [],
    });
  });

  it('el entrypoint ejecuta los scripts de arranque que el runner trae', () => {
    const entrypoint = readFileSync(path.join(ROOT, 'docker/entrypoint.sh'), 'utf8');
    for (const script of ENTRYPOINT_SCRIPTS) {
      expect(entrypoint).toContain(script);
      expect(copies.some((copy) => copy.from === script)).toBe(true);
    }
  });
});
