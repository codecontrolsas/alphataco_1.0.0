/**
 * Cuenta los colores hardcodeados de la UI: clases de paleta de Tailwind (`bg-red-500`,
 * `dark:text-slate-900`…), `bg-white`/`text-black` y similares, y valores `#hex`, `rgb(` y `hsl(`
 * escritos en el código de componentes. Es el criterio de "hecho" del rediseño
 * (docs/rediseno-ui/PLAN.md): el total nunca sube y cada módulo terminado queda en 0, salvo las
 * excepciones listadas abajo.
 *
 * Uso:
 *   node scripts/ui/count-hardcoded-colors.mjs              resumen por módulo + top de archivos
 *   node scripts/ui/count-hardcoded-colors.mjs --files      todos los archivos con conteo
 *   node scripts/ui/count-hardcoded-colors.mjs --path src/features/Clothing   solo esa carpeta
 *   node scripts/ui/count-hardcoded-colors.mjs --json       salida en JSON (para la bitácora)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const SCAN = option('--path') ?? 'src';

/**
 * Excepciones del plan (§8): PDFs y mails usan constantes de color propias (react-pdf y el HTML de
 * mail no entienden variables CSS), los gráficos tienen su paleta en `ui/chart`, y el ícono de
 * Google lleva los colores de su marca.
 */
const EXCLUDED = [
  /[\\/]pdf[\\/]/i,
  /pdf[^\\/]*\.(ts|tsx)$/i,
  /[\\/]mail[\\/]/i,
  /[\\/]templates[\\/]/i,
  /emailTemplates\.ts$/,
  /[\\/]components[\\/]ui[\\/]chart\.tsx$/,
  /[\\/]components[\\/]ui[\\/]icons[\\/]google\.tsx$/,
  /\.test\.tsx?$/,
  /[\\/]generated[\\/]/,
];

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const UTILITIES =
  'bg|text|border|border-[trblxy]|ring|ring-offset|outline|from|via|to|fill|stroke|divide|shadow|decoration|accent|caret|placeholder';
const PATTERNS = {
  palette: new RegExp(`\\b(?:${UTILITIES})-(?:${PALETTE})-\\d{2,3}\\b`, 'g'),
  blackWhite: new RegExp(`\\b(?:${UTILITIES})-(?:white|black)\\b`, 'g'),
  arbitrary: /\b(?:bg|text|border|fill|stroke|from|via|to|shadow)-\[#[0-9a-fA-F]{3,8}\]/g,
  hex: /(?<![\w&-])#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|(?<![\w&-])#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g,
  fn: /\b(?:rgb|rgba|hsl|hsla)\(\s*\d/g,
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      walk(full, out);
    } else if (/\.(tsx|ts|css)$/.test(name) && !EXCLUDED.some((re) => re.test(full))) {
      out.push(full);
    }
  }
  return out;
}

/** Módulo para agrupar: `src/features/<X>`, `src/components/ui`, `src/shared`, `src/app/<X>`. */
function moduleOf(rel) {
  const parts = rel.split(/[\\/]/);
  if (parts[1] === 'features' || parts[1] === 'app') return `${parts[1]}/${parts[2] ?? ''}`;
  if (parts[1] === 'components') return `components/${parts[2] ?? ''}`;
  return parts.slice(1, 2).join('/');
}

const files = walk(path.join(ROOT, SCAN));
const rows = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const counts = {};
  let total = 0;
  for (const [kind, re] of Object.entries(PATTERNS)) {
    const n = (text.match(re) ?? []).length;
    counts[kind] = n;
    total += n;
  }
  if (total > 0) rows.push({ file: path.relative(ROOT, file), module: moduleOf(path.relative(ROOT, file)), total, ...counts });
}

rows.sort((a, b) => b.total - a.total);
const grand = rows.reduce((acc, r) => acc + r.total, 0);
const byKind = Object.fromEntries(Object.keys(PATTERNS).map((k) => [k, rows.reduce((acc, r) => acc + r[k], 0)]));
const byModule = Object.entries(
  rows.reduce((acc, r) => ((acc[r.module] = (acc[r.module] ?? 0) + r.total), acc), {})
).sort((a, b) => b[1] - a[1]);

if (flag('--json')) {
  process.stdout.write(JSON.stringify({ total: grand, files: rows.length, byKind, byModule, rows }, null, 2));
  process.exit(0);
}

const lines = [
  `Colores hardcodeados en ${SCAN}: ${grand} en ${rows.length} archivos`,
  `  paleta ${byKind.palette} · blanco/negro ${byKind.blackWhite} · arbitrarios ${byKind.arbitrary} · #hex ${byKind.hex} · rgb/hsl ${byKind.fn}`,
  '',
  'Por módulo:',
  ...byModule.map(([m, n]) => `  ${String(n).padStart(5)}  ${m}`),
  '',
  flag('--files') ? 'Archivos:' : 'Top 25 archivos:',
  ...(flag('--files') ? rows : rows.slice(0, 25)).map((r) => `  ${String(r.total).padStart(5)}  ${r.file}`),
];
process.stdout.write(lines.join('\n') + '\n');
