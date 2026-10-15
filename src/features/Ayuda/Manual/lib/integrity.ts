import { findTabDef } from '../../../Permissions/lib/permissions-map-utils.ts';
import { PERMISSIONS } from '../../../Permissions/permissions-map.ts';
import { MDX_COMPONENT_NAMES } from '../catalog/mdx-vocabulary.ts';
import type { CoverageExclusion, ReadingPath, ScreenRef, SectionDef, TabRef } from '../catalog/types.ts';
import { FIGURE_NAMES } from '../figures/names.ts';
import { guideFile, type LoadedManual } from './manual-loader.ts';
import { firstConcreteScreen } from './route-table.ts';

/**
 * Contrato de mantenimiento del manual. Cada regla existe porque su falta es un error silencioso:
 * una guía que nadie ve, un enlace que no lleva a ningún lado, o —la principal— una pantalla
 * nueva del sistema que nadie documentó. Ecokit mantenía dos mapas a mano y se desincronizaron;
 * acá el control lo hace esto, no la memoria de quien agrega la pantalla.
 *
 * Devuelve la lista de problemas (vacía = todo bien). Lo corren `npm run manual:check` y, en
 * desarrollo, la primera carga del manual.
 */

export type IntegrityInput = {
  sections: SectionDef[];
  readingPaths: ReadingPath[];
  startHere: string[];
  exclusions: CoverageExclusion[];
  manual: LoadedManual;
  /** Rutas raíz de los módulos del sidebar (`/dashboard/employee`…). */
  moduleRoots: string[];
};

const key = (ref: TabRef) => `${ref.module}:${ref.tab}`;

/** Una guía tiene a dónde mandar "Abrir pantalla" si declara al menos una pantalla concreta. */
const hasConcreteScreen = (guide: { screens?: ScreenRef[] }) => Boolean(firstConcreteScreen(guide.screens));

/** Tabs de primer y segundo nivel de un módulo, que es lo que el manual tiene que cubrir. */
function coverableTabs(): TabRef[] {
  const out: TabRef[] = [];
  for (const [moduleSlug, moduleDef] of Object.entries(PERMISSIONS)) {
    for (const [tabSlug, tabDef] of Object.entries(moduleDef.tabs)) {
      out.push({ module: moduleSlug as TabRef['module'], tab: tabSlug });
      for (const subSlug of Object.keys(tabDef.subtabs ?? {})) {
        out.push({ module: moduleSlug as TabRef['module'], tab: subSlug });
      }
    }
  }
  return out;
}

export function checkManualIntegrity(input: IntegrityInput): string[] {
  const { sections, readingPaths, startHere, exclusions, manual, moduleRoots } = input;
  const problems: string[] = [...manual.issues.map((i) => `${i.file}: ${i.message}`)];
  const known = new Set<string>();
  const sectionKeys = new Set<string>();

  // 1-3. Unicidad y correspondencia catálogo <-> archivos.
  for (const section of sections) {
    if (sectionKeys.has(section.key)) problems.push(`sección repetida: ${section.key}`);
    sectionKeys.add(section.key);
    for (const guide of section.guides) {
      if (known.has(guide.slug)) problems.push(`slug repetido: ${guide.slug}`);
      known.add(guide.slug);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(guide.slug)) problems.push(`slug inválido (kebab-case): ${guide.slug}`);
    }
  }
  const expectedFiles = new Set(sections.flatMap((s) => s.guides.map((g) => guideFile(s.key, g.slug))));
  for (const file of manual.filesOnDisk) {
    if (!expectedFiles.has(file)) problems.push(`${file}: el archivo no está en el catálogo`);
  }

  // 4. Referencias entre guías.
  const checkSlug = (where: string, slug: string) => {
    if (!known.has(slug)) problems.push(`${where}: apunta a una guía que no existe (${slug})`);
  };
  for (const guide of manual.guides) {
    const where = guideFile(guide.sectionKey, guide.slug);
    for (const rel of guide.related ?? []) {
      if (rel === guide.slug) problems.push(`${where}: se relaciona consigo misma`);
      checkSlug(`${where} (related)`, rel);
    }
    for (const link of guide.scan.guideLinks) {
      checkSlug(`${where} (<GuideLink>)`, link.slug);
      const target = manual.bySlug.get(link.slug);
      if (target && link.anchor && !target.scan.toc.some((t) => t.id === link.anchor)) {
        problems.push(`${where}: <GuideLink to="${link.slug}#${link.anchor}"> apunta a un título que no existe`);
      }
    }
    for (const slug of guide.scan.screenLinks) {
      checkSlug(`${where} (<OpenScreen>)`, slug);
      const target = manual.bySlug.get(slug);
      if (target && !hasConcreteScreen(target))
        problems.push(`${where}: <OpenScreen to="${slug}"> pero esa guía no declara pantallas`);
    }
    if (
      guide.scan.components.includes('OpenScreen') &&
      !hasConcreteScreen(guide) &&
      guide.scan.screenLinks.length === 0
    ) {
      problems.push(`${where}: usa <OpenScreen /> sin destino y la guía no declara pantallas`);
    }

    // 5. Componentes conocidos.
    for (const name of guide.scan.components) {
      if (!(MDX_COMPONENT_NAMES as readonly string[]).includes(name)) {
        problems.push(`${where}: componente desconocido <${name}>`);
      }
    }

    // 5b. Figuras: el `name` tiene que existir en el registro y llevar `caption` (el pie explica
    // lo que se ve; sin él la figura queda como decoración).
    for (const figure of guide.scan.figures) {
      if (figure.name === null) {
        problems.push(`${where}: <Figure> sin name="…" literal (tiene que ser una de: ${FIGURE_NAMES.join(', ')})`);
      } else if (!(FIGURE_NAMES as readonly string[]).includes(figure.name)) {
        problems.push(
          `${where}: <Figure name="${figure.name}"> no existe en el registro de figuras (opciones: ${FIGURE_NAMES.join(', ')})`
        );
      }
      if (!figure.hasCaption) problems.push(`${where}: <Figure name="${figure.name ?? '?'}"> sin caption="…"`);
    }

    // 6. Permisos que existen (por si se esquivó el tipado de `tab()`).
    for (const ref of [...(guide.access ?? []), ...(guide.covers ?? [])]) {
      if (!findTabDef(PERMISSIONS, ref.module, ref.tab)) problems.push(`${where}: permiso inexistente ${key(ref)}`);
    }
  }
  for (const path of readingPaths) for (const slug of path.steps) checkSlug(`recorrido "${path.id}"`, slug);
  for (const slug of startHere) checkSlug('"Empezá por acá"', slug);

  // 7. Una pantalla la reclama una sola guía (si no, el botón "?" elegiría al azar).
  const screenOwner = new Map<string, string>();
  for (const guide of manual.guides) {
    for (const screen of guide.screens ?? []) {
      const id = `${screen.path}?tab=${screen.tab ?? ''}&subtab=${screen.subtab ?? ''}`;
      const owner = screenOwner.get(id);
      if (owner) problems.push(`la pantalla ${id} la reclaman dos guías: ${owner} y ${guide.slug}`);
      else screenOwner.set(id, guide.slug);
    }
  }

  // 8. Cada módulo tiene una guía para su ruta raíz: las páginas de detalle la heredan.
  for (const root of moduleRoots) {
    const covered = manual.guides.some((g) => g.screens?.some((s) => s.path === root && !s.tab && !s.subtab));
    if (!covered)
      problems.push(`ninguna guía declara la pantalla raíz ${root} (sin tab): el botón "?" no tendría a dónde ir`);
  }

  // 9. Cobertura: toda tab y subtab del sistema está documentada o excluida con motivo.
  const covered = new Set(manual.guides.flatMap((g) => [...(g.access ?? []), ...(g.covers ?? [])].map(key)));
  const excluded = new Map(exclusions.map((e) => [key(e), e.reason]));
  for (const ref of coverableTabs()) {
    if (!covered.has(key(ref)) && !excluded.has(key(ref))) {
      problems.push(`sin documentar: ${key(ref)} (agregá la guía o una exclusión con motivo en catalog/coverage.ts)`);
    }
  }
  for (const exclusion of exclusions) {
    if (!findTabDef(PERMISSIONS, exclusion.module, exclusion.tab))
      problems.push(`exclusión de una tab que no existe: ${key(exclusion)}`);
    if (covered.has(key(exclusion))) problems.push(`${key(exclusion)} está excluida pero también documentada`);
  }

  return problems;
}
