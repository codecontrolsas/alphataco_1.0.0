import { buttonVariants } from '@/components/ui/button';
import { ThemeToggle } from '@/features/Layout/header/components/ThemeToggle';
import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import { cn } from '@/lib/utils';
import { ArrowLeft, BookDashed, BookOpen, FileQuestion, Lock } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MANUAL_SECTIONS } from './catalog';
import { READING_PATHS, START_HERE } from './catalog/home';
import { GuideToc } from './components/GuideToc';
import { GuideView } from './components/GuideView';
import { ManualHome, type VisibleReadingPath } from './components/ManualHome';
import { ManualIndex } from './components/ManualIndex';
import { ManualMobileNav } from './components/ManualMobileNav';
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
 * Página del manual de uso (`/manual`, ticket 809): fuera del dashboard, con su propio índice y sin el
 * sidebar de la app. Se abre en una pestaña nueva desde el sidebar y desde el botón "?" del header.
 *
 * Todo se resuelve en el servidor contra los permisos del usuario (los mismos de antes: `ayuda:manual`
 * y el acceso de cada guía): una guía que no puede abrir no aparece en el índice, ni en la portada,
 * ni en la búsqueda, y tampoco se abre escribiendo su URL.
 *
 * - sin `?guide=` → portada
 * - `?guide=` visible → la guía
 * - `?guide=` que existe pero no es visible → "No tenés acceso a esta guía"
 * - `?guide=` inexistente → "No encontramos esa guía"
 */
export async function ManualPage({ searchParams }: { searchParams: SearchParams }) {
  const permissions = await getUserPermissionsMapServer();
  if (!createTabVisibilityChecker(permissions)('ayuda', 'manual')) {
    return (
      <ManualShell tree={[]} activeSlug={null} toc={[]} showSearch={false}>
        <ManualNotice
          icon={Lock}
          title="No tenés acceso al manual"
          description="Tu rol no tiene habilitado el manual de uso. Si lo necesitás, pedile a un administrador de tu empresa que te dé el permiso."
          action={{ href: '/dashboard', label: 'Volver al sistema' }}
        />
      </ManualShell>
    );
  }

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
      <ManualShell
        tree={tree}
        activeSlug={guide?.slug ?? null}
        toc={toc}
        showSearch={Boolean(requestedSlug)}
        readingCard={Boolean(guide)}
      >
        {content}
      </ManualShell>
    </ManualProvider>
  );
}

/**
 * Estructura de la página del manual:
 * - header fijo propio (marca del manual, volver al sistema, tema) — sin el sidebar de la app;
 * - índice del manual a la izquierda desde `lg`; debajo, un menú lateral desplegable (`Sheet`);
 * - el contenido sobre un fondo apagado, y la guía dentro de una tarjeta con ancho de lectura;
 * - "En esta guía" a la derecha desde `xl`.
 *
 * La portada trae su propio buscador grande; en una guía el buscador va arriba del índice.
 */
function ManualShell({
  tree,
  activeSlug,
  toc,
  showSearch,
  readingCard = false,
  children,
}: {
  tree: ManualTree;
  activeSlug: string | null;
  toc: TocItem[];
  showSearch: boolean;
  /** La guía va en una tarjeta con ancho de lectura; la portada y los avisos ya traen sus superficies. */
  readingCard?: boolean;
  children: ReactNode;
}) {
  const hasToc = toc.length > 0;
  const hasIndex = tree.length > 0;
  const hasNav = hasIndex || showSearch;

  const navigation = (
    <>
      {showSearch && (
        <div className="mb-4">
          <ManualSearch />
        </div>
      )}
      {hasIndex && (
        <nav aria-label="Índice del manual">
          <ManualIndex tree={tree} activeSlug={activeSlug} />
        </nav>
      )}
    </>
  );

  return (
    <div className="bg-muted/40 min-h-dvh">
      <a
        href="#manual-contenido"
        className="bg-background text-foreground focus-visible:ring-ring sr-only z-50 rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-visible:ring-2"
      >
        Saltar al contenido
      </a>

      <header className="bg-background/85 supports-[backdrop-filter]:bg-background/70 border-border/60 sticky top-0 z-30 h-14 border-b backdrop-blur">
        <div className="flex h-full items-center gap-2 px-3 sm:px-4">
          {hasNav && <ManualMobileNav>{navigation}</ManualMobileNav>}
          <Link
            href={manualHref()}
            className="focus-visible:ring-ring flex min-w-0 items-center gap-2 rounded-md px-1 py-1 outline-none focus-visible:ring-2"
          >
            <span className="bg-brand text-brand-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
              <BookOpen aria-hidden className="size-4" />
            </span>
            <span className="truncate text-base font-semibold tracking-tight">Manual de uso</span>
          </Link>
          <div className="ms-auto flex items-center gap-1">
            <Link href="/dashboard" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5')}>
              <ArrowLeft aria-hidden className="size-4" />
              <span className="hidden sm:inline">Volver al sistema</span>
              <span className="sm:hidden">Sistema</span>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className={cn(hasNav && 'lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]')}>
        {hasNav && (
          <aside
            aria-label="Navegación del manual"
            className="bg-background hidden border-e lg:sticky lg:top-14 lg:block lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:overscroll-contain lg:px-3 lg:py-5"
          >
            {navigation}
          </aside>
        )}

        <main id="manual-contenido" tabIndex={-1} className="min-w-0 px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-10">
          <div
            className={cn(
              'mx-auto grid min-w-0 gap-8',
              readingCard ? 'max-w-5xl' : 'max-w-6xl',
              hasToc && 'xl:grid-cols-[minmax(0,1fr)_13rem]'
            )}
          >
            <div
              className={cn(
                'min-w-0 [&_:is(h1,h2,h3)]:scroll-mt-20',
                readingCard && 'bg-card rounded-xl border p-5 shadow-xs sm:p-8 lg:p-10'
              )}
            >
              {children}
            </div>

            {hasToc && (
              <aside
                aria-label="En esta guía"
                className="hidden xl:sticky xl:top-20 xl:block xl:max-h-[calc(100dvh-6rem)] xl:self-start xl:overflow-y-auto"
              >
                <p className="text-foreground mb-2 text-sm font-semibold">En esta guía</p>
                <GuideToc items={toc} />
              </aside>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
