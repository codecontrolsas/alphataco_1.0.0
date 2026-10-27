/**
 * Genera la migración baseline `prisma/migrations/0_init/migration.sql` para
 * Postgres plano (sin Supabase):
 *
 *   1. Extensiones: `pgcrypto` (gen_random_uuid()). `uuid-ossp` y `moddatetime`
 *      sólo si algún `.sql` las usa (hoy ninguno: ver Task 4 del plan P1).
 *   2. DDL del esquema: `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`
 *      (Prisma 7 renombró `--to-schema-datamodel` a `--to-schema`).
 *   3. Lógica SQL revisada de `prisma/sql/*.sql`, en el orden de dominios: las
 *      funciones de `misc` primero porque el resto las usa (helpers, actor).
 *
 * El baseline se genera UNA vez (antes del primer `migrate deploy` real). Los
 * cambios posteriores van en migraciones nuevas: ver `.claude/rules/migrations.md`.
 *
 * Uso: `npm run db:baseline` (`node scripts/sql/build-baseline.ts`; Node >= 22.18
 * ejecuta TS por type stripping: sin enums, sin parameter properties).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const SQL_DIR = join(ROOT, 'prisma', 'sql');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const OUT_DIR = join(ROOT, 'prisma', 'migrations', '0_init');
const OUT_FILE = join(OUT_DIR, 'migration.sql');
const LOCK_FILE = join(ROOT, 'prisma', 'migrations', 'migration_lock.toml');

/** Orden de concatenación: `misc` primero (helpers como app_current_user_id, build_*_where_alias). */
const DOMAIN_ORDER = [
  'misc',
  'permissions',
  'documents',
  'diagrams',
  'daily-report',
  'kpis',
  'maintenance',
  'invoicing',
  'timezone',
  'tenant',
  'hse',
] as const;

/** Extensión → patrón que delata su uso en los `.sql`. `pgcrypto` va siempre (gen_random_uuid en los defaults del schema). */
const OPTIONAL_EXTENSIONS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'uuid-ossp', pattern: /\buuid_generate_v\d\s*\(/i },
  { name: 'moddatetime', pattern: /\bmoddatetime\b/i },
];

function readDomainSql(): { domain: string; sql: string }[] {
  return DOMAIN_ORDER.map((domain) => {
    const file = join(SQL_DIR, `${domain}.sql`);
    if (!existsSync(file)) throw new Error(`Falta ${file}`);
    return { domain, sql: readFileSync(file, 'utf8').trim() };
  });
}

function extensionsSection(allSql: string): string {
  const lines = ['-- ── Extensiones ─────────────────────────────────────────────────────────────'];
  lines.push('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  for (const { name, pattern } of OPTIONAL_EXTENSIONS) {
    if (pattern.test(allSql)) lines.push(`CREATE EXTENSION IF NOT EXISTS "${name}";`);
  }
  return lines.join('\n');
}

/**
 * `app_current_user_id()` es DEFAULT de columnas (`diagrams_logs.modified_by`, `vehicles.user_id`,
 * antes `auth.uid()`), así que tiene que existir ANTES del DDL. Se toma de misc.sql para no
 * duplicar la fuente; misc.sql la vuelve a crear con OR REPLACE (idéntica) más adelante.
 */
function prerequisitesSection(domains: { domain: string; sql: string }[]): string {
  const misc = domains.find((d) => d.domain === 'misc');
  const match = misc?.sql.match(/CREATE OR REPLACE FUNCTION public\.app_current_user_id\(\)[\s\S]*?\$function\$;/);
  if (!match) throw new Error('No se encontró app_current_user_id() en prisma/sql/misc.sql');
  return ['-- ── Prerrequisitos del DDL (defaults de columna) ───────────────────────────', match[0]].join('\n');
}

/**
 * Columnas GENERATED ALWAYS AS (...) STORED. Prisma no las modela: `db pull` las
 * serializa como `@default(dbgenerated("<expr>"))` y el DDL sale como `DEFAULT <expr>`,
 * que Postgres rechaza ("cannot use column reference in DEFAULT expression").
 * Acá se reescriben a columnas generadas, como estaban en Supabase
 * (docs/legacy-migrations/supabase/20260224125003_adding_horometro.sql y
 * 20260225202749_otros-feat-and-checklist-columns.sql).
 */
const GENERATED_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ['checklist_answers', 'customer_id'],
  ['checklist_answers', 'horometro'],
  ['checklist_answers', 'kilometraje'],
  ['employees', 'full_name'],
];

function rewriteGeneratedColumns(ddl: string): string {
  let out = ddl;
  for (const [table, column] of GENERATED_COLUMNS) {
    const start = out.indexOf(`CREATE TABLE "${table}" (`);
    if (start < 0) throw new Error(`No se encontró CREATE TABLE "${table}" en el DDL`);
    const end = out.indexOf('\n);', start);
    const block = out.slice(start, end);
    const re = new RegExp(`(\\n    "${column}" [^\\n]*?) DEFAULT \\n?([\\s\\S]*?),\\n(?=    "|\\n)`);
    const m = block.match(re);
    if (!m) throw new Error(`No se encontró el DEFAULT de "${table}"."${column}" en el DDL`);
    // Replacer como función: la expresión puede contener `$'` (regex), que en un string de reemplazo tiene significado especial.
    const rewritten = block.replace(
      re,
      (_all, head: string, expr: string) => `${head} GENERATED ALWAYS AS (${expr.trim()}) STORED,\n`
    );
    out = out.slice(0, start) + rewritten + out.slice(end);
  }
  return out;
}

function schemaDdl(): string {
  const args = ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema', SCHEMA, '--script'];
  const out = execFileSync('npx', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const ddl = out.trim();
  if (!/CREATE TABLE/i.test(ddl)) throw new Error('El diff de Prisma no devolvió DDL (¿cambió la CLI?)');
  return rewriteGeneratedColumns(ddl);
}

function assertNoSupabaseRefs(sql: string): void {
  const forbidden = /\b(auth|storage|extensions|net|cron|pgsodium|vault|realtime|supabase_functions)\./g;
  const hits = new Set<string>();
  for (const line of sql.split('\n')) {
    if (line.trimStart().startsWith('--')) continue;
    const m = line.match(forbidden);
    if (m) m.forEach((x) => hits.add(x));
  }
  if (hits.size > 0) throw new Error(`Referencias a schemas de Supabase en el baseline: ${[...hits].join(', ')}`);
}

function main(): void {
  const domains = readDomainSql();
  const logicSql = domains
    .map(({ domain, sql }) => `-- ── prisma/sql/${domain}.sql ${'─'.repeat(Math.max(4, 74 - domain.length))}\n${sql}`)
    .join('\n\n');
  const ddl = schemaDdl();

  const header = [
    '-- Baseline 0_init — Postgres plano (sin schemas auth/storage de Supabase).',
    '-- Generado por scripts/sql/build-baseline.ts (`npm run db:baseline`). NO editar a mano:',
    '-- el DDL sale de prisma/schema.prisma y la lógica de prisma/sql/*.sql.',
    '-- Después del primer `prisma migrate deploy` real este archivo NO se regenera:',
    '-- los cambios van en migraciones nuevas (.claude/rules/migrations.md).',
  ].join('\n');

  const body = [
    header,
    extensionsSection(logicSql),
    prerequisitesSection(domains),
    '-- ── Esquema (prisma migrate diff --from-empty --to-schema) ───────────────────',
    ddl,
    '-- ── Funciones, vistas y triggers (prisma/sql/*.sql) ───────────────────────────',
    logicSql,
    '',
  ].join('\n\n');

  assertNoSupabaseRefs(body);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, body, 'utf8');
  if (!existsSync(LOCK_FILE)) {
    writeFileSync(
      LOCK_FILE,
      '# Please do not edit this file manually\n# It should be added in your version-control system (e.g., Git)\nprovider = "postgresql"\n',
      'utf8'
    );
  }

  const functions = (logicSql.match(/^CREATE (?:OR REPLACE )?FUNCTION/gim) ?? []).length;
  const triggers = (logicSql.match(/^CREATE (?:OR REPLACE )?TRIGGER/gim) ?? []).length;
  const views = (logicSql.match(/^CREATE (?:OR REPLACE )?VIEW/gim) ?? []).length;
  const tables = (ddl.match(/^CREATE TABLE/gim) ?? []).length;
  console.log(`0_init: ${tables} tablas, ${functions} funciones, ${views} vistas, ${triggers} triggers → ${OUT_FILE}`);
}

main();
