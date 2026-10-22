/**
 * Verifica el manual de uso: que cada guía del catálogo tenga su archivo y viceversa, que los
 * enlaces y componentes existan, y que toda tab del sistema esté documentada (o excluida con
 * motivo). Uso: `npm run manual:check`. Sale con código 1 si hay problemas.
 */
import { compile } from '@mdx-js/mdx';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { COVERAGE_EXCLUSIONS } from '../src/features/Ayuda/Manual/catalog/coverage.ts';
import { READING_PATHS, START_HERE } from '../src/features/Ayuda/Manual/catalog/home.ts';
import { MANUAL_SECTIONS } from '../src/features/Ayuda/Manual/catalog/index.ts';
import { checkManualIntegrity } from '../src/features/Ayuda/Manual/lib/integrity.ts';
import { loadManual } from '../src/features/Ayuda/Manual/lib/manual-loader.ts';

// Las rutas raíz salen del propio navigation.ts (no se importa: arrastra íconos de React).
const navigation = readFileSync(
  path.join(process.cwd(), 'src', 'features', 'Layout', 'sidebar', 'constants', 'navigation.ts'),
  'utf8'
);
const moduleRoots = [...navigation.matchAll(/href:\s*'(\/dashboard[^']*)'/g)].map((m) => m[1]);

const manual = loadManual(MANUAL_SECTIONS);
const problems = checkManualIntegrity({
  sections: MANUAL_SECTIONS,
  readingPaths: READING_PATHS,
  startHere: START_HERE,
  exclusions: COVERAGE_EXCLUSIONS,
  manual,
  moduleRoots,
});

// Que cada guía compile como la renderiza la app: un MDX roto pasaba el control y recién fallaba
// al abrir la guía ("No se pudo mostrar esta guía").
for (const guide of manual.guides) {
  try {
    await compile(guide.body, { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug] });
  } catch (error) {
    problems.push(
      `${guide.sectionKey}/${guide.slug}.mdx: no compila (${error instanceof Error ? error.message : String(error)})`
    );
  }
}

if (problems.length > 0) {
  process.stderr.write(
    `Manual de uso: ${problems.length} problema(s)\n\n${problems.map((p) => `  - ${p}`).join('\n')}\n`
  );
  process.exit(1);
}
process.stdout.write(`Manual de uso: ${manual.guides.length} guías, sin problemas.\n`);
