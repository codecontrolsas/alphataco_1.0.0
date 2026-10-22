import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import { cn } from '@/lib/utils';
import { BookDashed, FileQuestion, ListTree, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { MANUAL_SECTIONS } from './catalog';
import { READING_PATHS, START_HERE } from './catalog/home';
import { GuideToc } from './components/GuideToc';
import { GuideView } from './components/GuideView';
import { ManualHome, type VisibleReadingPath } from './components/ManualHome';
import { ManualIndex } from './components/ManualIndex';
import { ManualNotice } from './components/ManualNotice';
import { ManualProvider, type ManualGuideRef } from './components/ManualProvider';
import { ManualSearch } from './components/ManualSearch';
import { ScrollToHash } from './components/ScrollToHash';
import { visibleGuides } from './lib/guide-access';
import { buildTree, neighbors, relatedGuides, toSummary, type ManualTree } from './lib/guide-navigation';
import type { LoadedGuide } from './lib/manual-loader';
import { manualHref, screenHref } from './lib/manual-urls';
import { getManual } from './lib/manual.server';
import type { TocItem } from './lib/mdx-scan';
import { firstConcreteScreen } from './lib/route-table';

type SearchParams = { [key: string]: string | string[] | undefined };

/** Un recorrido con menos de dos pasos visibles no orienta a nadie: se oculta. */
const MIN_PATH_STEPS = 2;

function toGuideRef(guide: LoadedGuide): ManualGuideRef {
  const screen = firstConcreteScreen(guide.screens);
  return { slug: guide.slug, title: guide.frontmatter.title, screenHref: screen ? screenHref(screen) : null };
}

/**
 * Tab "Manual de uso" del módulo Ayuda. Todo se resuelve en el servidor contra los permisos del
 * usuario: una guía que no puede abrir no aparece en el índice, ni en la portada, ni en la
 * búsqueda, y tampoco se abre escribiendo su URL.
 *
 * - sin `?guide=` → portada
 * - `?guide=` visible → la guía
 * - `?guide=` que existe pero no es visible → "No tenés acceso a esta guía"
 * - `?guide=` inexistente → "No encontramos esa guía"
 */
export function ManualTabContent({
  searchParams,
  permissions,
}: {
  searchParams: SearchParams;
  permissions: Record<string, boolean>;
}) {
  const manual = getManual();
  const visible = visibleGuides(manual.guides, permissions);
  const visibleBySlug = new Map(visible.map((guide) => [guide.slug, guide]));
  const tree = buildTree(MANUAL_SECTIONS, visible);
  const guideRefs = visible.map(toGuideRef);

  const rawGuide = searchParams.guide;
  const requestedSlug = typeof rawGuide === 'string' && rawGuide ? rawGuide : null;
  const guide = requestedSlug ? visibleBySlug.get(requestedSlug) ?? null : null;

  const backToHome = { href: manualHref(), label: 'Ir a la portada del manual' };
  let content: ReactNode;
  let toc: TocItem[] = [];

  if (guide) {
    const { previous, next } = neighbors(visible, guide.slug);
    toc = guide.scan.toc;
    content = (
      <>
        <GuideView guide={guide} related={relatedGuides(visible, guide)} previous={previous} next={next} />
        <ScrollToHash guideSlug={guide.slug} />
      </>
    );
  } else if (requestedSlug && manual.bySlug.has(requestedSlug)) {
    content = (
      <ManualNotice
        icon={Lock}
        title="No tenés acceso a esta guía"
        description="Explica una pantalla que tu rol no tiene habilitada. Si la necesitás para tu trabajo, pedile a un administrador de tu empresa que te dé el permiso."
        action={backToHome}
      />
    );
  } else if (requestedSlug) {
    content = (
      <ManualNotice
        icon={FileQuestion}
        title="No encontramos esa guía"
        description="Puede que el enlace esté mal escrito o que la guía haya cambiado de nombre. Buscala desde la portada o en el índice del manual."
        action={backToHome}
      />
    );
  } else if (visible.length === 0) {
    const canOpenTickets = createTabVisibilityChecker(permissions)('ayuda', 'tickets');
    content = (
      <ManualNotice
        icon={BookDashed}
        title="Todavía no hay guías publicadas"
        description={
          canOpenTickets
            ? 'Acá vas a encontrar los pasos para usar cada pantalla del sistema. Mientras tanto, si tenés una duda, escribile al equipo de soporte.'
            : 'Acá vas a encontrar los pasos para usar cada pantalla del sistema. Mientras tanto, si tenés una duda, consultala con un administrador de tu empresa.'
        }
        action={canOpenTickets ? { href: '/dashboard/help?tab=tickets', label: 'Escribir a soporte' } : undefined}
      />
    );
  } else {
    const summaryOf = (slug: string) => {
      const found = visibleBySlug.get(slug);
      return found ? [toSummary(found)] : [];
    };
    const readingPaths: VisibleReadingPath[] = READING_PATHS.map((path) => ({
      ...path,
      steps: path.steps.flatMap(summaryOf),
    })).filter((path) => path.steps.length >= MIN_PATH_STEPS);

    content = <ManualHome tree={tree} startHere={START_HERE.flatMap(summaryOf)} readingPaths={readingPaths} />;
  }

  return (
    <ManualProvider guides={guideRefs} currentSlug={guide?.slug ?? null}>
      <ManualLayout tree={tree} activeSlug={guide?.slug ?? null} toc={toc} showSearch={Boolean(requestedSlug)}>
        {content}
      </ManualLayout>
    </ManualProvider>
  );
}

/**
 * Tres zonas: índice (izquierda, desde `lg`), contenido, y "En esta guía" (derecha, desde `xl`).
 * El orden del DOM es el orden de lectura; en móvil el índice queda plegado arriba del contenido.
 *
 * La portada trae su propio buscador grande; en una guía el buscador va arriba del índice.
 */
function ManualLayout({
  tree,
  activeSlug,
  toc,
  showSearch,
  children,
}: {
  tree: ManualTree;
  activeSlug: string | null;
  toc: TocItem[];
  showSearch: boolean;
  children: ReactNode;
}) {
  const hasToc = toc.length > 0;
  const hasIndex = tree.length > 0;

  return (
    <div
      className={cn(
        'grid min-w-0 gap-6 lg:gap-8',
        hasIndex && 'lg:grid-cols-[15rem_minmax(0,1fr)]',
        hasIndex && hasToc && 'xl:grid-cols-[15rem_minmax(0,1fr)_13rem]',
        !hasIndex && hasToc && 'xl:grid-cols-[minmax(0,1fr)_13rem]'
      )}
    >
      {(hasIndex || showSearch) && (
        <aside
          aria-label="Navegación del manual"
          className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pe-1"
        >
          {showSearch && (
            <div className="mb-4">
              <ManualSearch />
            </div>
          )}
          {hasIndex && (
            <>
              <details className="group/index border lg:hidden">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium outline-none after:hidden focus-visible:ring-[3px] focus-visible:ring-ring/50">
                  <ListTree aria-hidden className="size-4 text-muted-foreground" />
                  Índice del manual
                </summary>
                <nav aria-label="Índice del manual" className="animate-none! border-t p-2">
                  <ManualIndex tree={tree} activeSlug={activeSlug} />
                </nav>
              </details>
              <nav aria-label="Índice del manual" className="hidden lg:block">
                <ManualIndex tree={tree} activeSlug={activeSlug} />
              </nav>
            </>
          )}
        </aside>
      )}

      <div className="min-w-0">{children}</div>

      {hasToc && (
        <aside
          aria-label="En esta guía"
          className="hidden xl:sticky xl:top-20 xl:block xl:max-h-[calc(100dvh-6rem)] xl:self-start xl:overflow-y-auto"
        >
          <p className="mb-2 text-sm font-semibold text-foreground">En esta guía</p>
          <GuideToc items={toc} />
        </aside>
      )}
    </div>
  );
}
