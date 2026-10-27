import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Logger } from '@/lib/logger';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, FileWarning } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import { compileMDX } from 'next-mdx-remote/rsc';
import Link from 'next/link';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import type { GuideSummary } from '../lib/guide-navigation';
import type { LoadedGuide } from '../lib/manual-loader';
import { manualHref } from '../lib/manual-urls';
import { ManualNotice } from './ManualNotice';
import { manualMdxComponents } from './mdx/mdx-components';

const logger = new Logger('features/Ayuda/Manual/GuideView');

async function renderBody(guide: LoadedGuide) {
  try {
    const { content } = await compileMDX({
      source: guide.body,
      components: manualMdxComponents,
      options: { mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug] } },
    });
    return content;
  } catch (error) {
    // Un MDX mal escrito no tiene que tirar abajo el manual entero: se avisa y se sigue navegando.
    logger.error('No se pudo compilar la guía', { data: { slug: guide.slug, error } });
    return null;
  }
}

function formatUpdated(date: string): string {
  return moment(date, 'YYYY-MM-DD').locale('es').format('D [de] MMMM [de] YYYY');
}

export async function GuideView({
  guide,
  related,
  previous,
  next,
}: {
  guide: LoadedGuide;
  related: GuideSummary[];
  previous: GuideSummary | null;
  next: GuideSummary | null;
}) {
  const body = await renderBody(guide);

  return (
    <article aria-labelledby="manual-guide-title" className="mx-auto max-w-3xl min-w-0">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={manualHref()}>Manual</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>{guide.sectionTitle}</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{guide.frontmatter.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="mt-4 border-b pb-6">
        <h1
          id="manual-guide-title"
          className="text-2xl leading-tight font-semibold tracking-tight text-balance text-foreground sm:text-3xl"
        >
          {guide.frontmatter.title}
        </h1>
        <p className="mt-3 max-w-prose text-lg leading-relaxed text-pretty text-muted-foreground">
          {guide.frontmatter.summary}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock aria-hidden className="size-4" />
            <span className="tabular-nums">
              {guide.minutes} {guide.minutes === 1 ? 'minuto' : 'minutos'} de lectura
            </span>
          </span>
          {guide.frontmatter.updated && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays aria-hidden className="size-4" />
              <span>
                Actualizada el{' '}
                <time dateTime={guide.frontmatter.updated}>{formatUpdated(guide.frontmatter.updated)}</time>
              </span>
            </span>
          )}
        </div>
      </header>

      {guide.scan.toc.length > 0 && (
        // Debajo de `xl` no hay columna derecha: el índice de la guía queda plegado arriba.
        <details className="group/toc mt-6 border xl:hidden">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium outline-none after:hidden focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <ChevronRight
              aria-hidden
              className="size-3.5 text-muted-foreground transition-transform group-open/toc:rotate-90 motion-reduce:transition-none"
            />
            En esta guía
          </summary>
          <ul className="animate-none! space-y-0.5 border-t px-3 py-2 text-sm">
            {guide.scan.toc.map((item) => (
              <li key={item.id} className={item.depth === 3 ? 'ps-4' : undefined}>
                <a
                  href={`#${item.id}`}
                  className="block py-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-8 text-base text-foreground">
        {body ?? (
          <ManualNotice
            icon={FileWarning}
            title="No se pudo mostrar esta guía"
            description="El contenido de la guía tiene un error de formato. Avisale al equipo de soporte para que lo corrijan; mientras tanto, podés seguir con las demás guías del índice."
          />
        )}
      </div>

      {related.length > 0 && (
        <section aria-labelledby="manual-related-title" className="mt-14 border-t pt-8">
          <h3 id="manual-related-title" className="text-base font-semibold text-foreground">
            Ver también
          </h3>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {related.map((item) => (
              <li key={item.slug}>
                <Link
                  href={manualHref(item.slug)}
                  className="flex h-full flex-col border bg-card p-4 outline-none transition-colors hover:border-foreground/30 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="text-xs text-muted-foreground">{item.sectionTitle}</span>
                  <span className="mt-1 font-medium text-balance text-foreground">{item.title}</span>
                  <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(previous || next) && (
        <nav aria-label="Guía anterior y siguiente" className="mt-10 grid gap-3 border-t pt-8 sm:grid-cols-2">
          {previous ? (
            <Link
              href={manualHref(previous.slug)}
              className="group flex flex-col border p-4 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronLeft aria-hidden className="size-3.5" />
                Anterior
              </span>
              <span className="mt-1 font-medium text-balance text-foreground">{previous.title}</span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next && (
            <Link
              href={manualHref(next.slug)}
              className="group flex flex-col items-end border p-4 text-end outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                Siguiente
                <ChevronRight aria-hidden className="size-3.5" />
              </span>
              <span className="mt-1 font-medium text-balance text-foreground">{next.title}</span>
            </Link>
          )}
        </nav>
      )}
    </article>
  );
}
