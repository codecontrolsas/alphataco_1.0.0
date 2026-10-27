import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ReadingPath } from '../catalog/types';
import type { GuideSummary, ManualTree } from '../lib/guide-navigation';
import { manualHref } from '../lib/manual-urls';
import { ManualSearch } from './ManualSearch';
import { SECTION_ICONS } from './section-icons';

const PROCESS_SECTION_KEY = 'procesos';
const SECTION_PREVIEW = 4;

function guidesLabel(count: number): string {
  return `${count} ${count === 1 ? 'guía' : 'guías'}`;
}

export type VisibleReadingPath = Omit<ReadingPath, 'steps'> & { steps: GuideSummary[] };

/**
 * Portada del manual. Una sola acción principal (buscar); todo lo demás es navegación ordenada de
 * lo más guiado (por dónde empezar, recorridos por perfil) a lo más libre (todas las secciones).
 */
export function ManualHome({
  tree,
  startHere,
  readingPaths,
}: {
  tree: ManualTree;
  startHere: GuideSummary[];
  readingPaths: VisibleReadingPath[];
}) {
  const totalGuides = tree.reduce((acc, section) => acc + section.guides.length, 0);
  const processes = tree.find((section) => section.key === PROCESS_SECTION_KEY);
  const modules = tree.filter((section) => section.key !== PROCESS_SECTION_KEY);

  return (
    <div className="min-w-0 space-y-12">
      <section aria-labelledby="manual-home-title" className="border bg-card p-6 sm:p-8">
        <h1
          id="manual-home-title"
          className="text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl"
        >
          ¿Qué necesitás hacer en el sistema?
        </h1>
        <p className="mt-2 max-w-prose leading-relaxed text-pretty text-muted-foreground">
          Buscá una tarea o el nombre de una pantalla. Hay{' '}
          <span className="tabular-nums">{guidesLabel(totalGuides)}</span> con los pasos de cada módulo y de los
          procesos que pasan de un módulo a otro.
        </p>
        <div className="mt-5 max-w-2xl">
          <ManualSearch size="lg" />
        </div>
      </section>

      {startHere.length > 0 && (
        <section aria-labelledby="manual-start-title">
          <h2 id="manual-start-title" className="text-lg font-semibold text-foreground">
            Empezá por acá
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Si es tu primera vez en el sistema, leelas en este orden.
          </p>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {startHere.map((guide, index) => (
              <li key={guide.slug}>
                <Link
                  href={manualHref(guide.slug)}
                  className="flex h-full gap-3 border bg-card p-4 outline-none transition-colors hover:border-foreground/30 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span
                    aria-hidden
                    className="flex size-7 shrink-0 items-center justify-center bg-primary text-sm font-semibold text-primary-foreground tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-balance text-foreground">{guide.title}</span>
                    <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{guide.summary}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {readingPaths.length > 0 && (
        <section aria-labelledby="manual-paths-title">
          <h2 id="manual-paths-title" className="text-lg font-semibold text-foreground">
            Recorridos según tu tarea
          </h2>
          <ul className="mt-4 grid gap-3 lg:grid-cols-2">
            {readingPaths.map((path) => (
              <li key={path.id} className="border bg-card p-4">
                <p className="font-medium text-foreground">{path.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{path.audience}</p>
                <ol className="mt-3 space-y-1 text-sm">
                  {path.steps.map((step, index) => (
                    <li key={step.slug} className="flex gap-2">
                      <span aria-hidden className="w-4 shrink-0 text-end text-muted-foreground tabular-nums">
                        {index + 1}.
                      </span>
                      <Link
                        href={manualHref(step.slug)}
                        className="min-w-0 text-foreground underline decoration-border underline-offset-4 outline-none hover:decoration-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        {step.title}
                      </Link>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        </section>
      )}

      {processes && (
        <section aria-labelledby="manual-process-title" className="relative overflow-hidden border bg-card p-6">
          <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-primary" />
          <div className="flex items-start gap-4">
            <span className="hidden size-10 shrink-0 items-center justify-center bg-muted text-foreground sm:flex">
              <ProcessIcon />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="manual-process-title" className="text-lg font-semibold text-foreground">
                {processes.title}
              </h2>
              <p className="mt-1 max-w-prose text-sm leading-relaxed text-pretty text-muted-foreground">
                {processes.description}
              </p>
              <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {processes.guides.map((guide) => (
                  <li key={guide.slug}>
                    <Link
                      href={manualHref(guide.slug)}
                      className="group inline-flex items-start gap-2 text-sm font-medium text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <ArrowRight
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      />
                      <span className="underline decoration-transparent underline-offset-4 group-hover:decoration-primary">
                        {guide.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {modules.length > 0 && (
        <section aria-labelledby="manual-sections-title">
          <h2 id="manual-sections-title" className="text-lg font-semibold text-foreground">
            Módulos del sistema
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {modules.map((section) => {
              const Icon = SECTION_ICONS[section.icon];
              const preview = section.guides.slice(0, SECTION_PREVIEW);
              const rest = section.guides.length - preview.length;
              return (
                <li key={section.key} className="flex flex-col border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-balance text-foreground">{section.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{section.description}</p>
                    </div>
                    <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      {guidesLabel(section.guides.length)}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-0.5 border-t pt-3 text-sm">
                    {preview.map((guide) => (
                      <li key={guide.slug}>
                        <Link
                          href={manualHref(guide.slug)}
                          className="block py-1 text-foreground underline decoration-transparent underline-offset-4 outline-none hover:decoration-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                          {guide.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {rest > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">Y {rest} más en el índice del manual.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function ProcessIcon() {
  const Icon = SECTION_ICONS.process;
  return <Icon aria-hidden className="size-5" />;
}
