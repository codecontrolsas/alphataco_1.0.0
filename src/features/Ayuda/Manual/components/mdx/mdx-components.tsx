import { cn } from '@/lib/utils';
import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type { MdxComponentName } from '../../catalog/mdx-vocabulary';
import { Callout } from './Callout';
import { Figure } from './Figure';
import { Flow } from './Flow';
import { FlowStep } from './FlowStep';
import { GuideLink } from './GuideLink';
import { Kbd } from './Kbd';
import { OpenScreen } from './OpenScreen';
import { State, States } from './States';
import { Step, Steps } from './Steps';

/**
 * Componentes del vocabulario del manual. El `satisfies` contra `MdxComponentName` hace que el
 * mapa y la lista que valida `manual:check` no puedan divergir: falta uno o sobra uno, y no compila.
 */
const vocabulary = {
  Callout,
  Steps,
  Step,
  OpenScreen,
  GuideLink,
  Flow,
  FlowStep,
  States,
  State,
  Kbd,
  Figure,
} satisfies Record<MdxComponentName, (props: never) => ReactNode>;

/*
 * Markdown → elementos. La página ya tiene el <h1> ("Manual de uso") y el título de la guía es un
 * <h2>, así que los `##` del MDX bajan a <h3> y los `###` a <h4>: la jerarquía del documento queda
 * correcta y se conserva el `id` que pone rehype-slug (el índice "En esta guía" apunta a ese id).
 *
 * Espaciado: los títulos se separan más del bloque anterior que del que introducen. El ancho de
 * lectura (~65 caracteres) se aplica a párrafos y listas; tablas y diagramas usan todo el ancho.
 */
const HEADING_ANCHOR_OFFSET = 'scroll-mt-24';

const prose: MDXComponents = {
  h2: ({ className, ...props }: ComponentPropsWithoutRef<'h2'>) => (
    <h3
      {...props}
      className={cn(
        HEADING_ANCHOR_OFFSET,
        'mt-12 mb-3 text-xl leading-tight font-semibold tracking-tight text-balance text-foreground first:mt-0',
        className
      )}
    />
  ),
  h3: ({ className, ...props }: ComponentPropsWithoutRef<'h3'>) => (
    <h4
      {...props}
      className={cn(
        HEADING_ANCHOR_OFFSET,
        'mt-8 mb-2 text-base leading-snug font-semibold text-balance text-foreground first:mt-0',
        className
      )}
    />
  ),
  p: ({ className, ...props }: ComponentPropsWithoutRef<'p'>) => (
    <p {...props} className={cn('mt-4 max-w-prose leading-7 text-pretty break-words first:mt-0', className)} />
  ),
  ul: ({ className, ...props }: ComponentPropsWithoutRef<'ul'>) => (
    <ul
      {...props}
      className={cn('mt-4 max-w-prose list-disc space-y-1.5 ps-6 marker:text-muted-foreground first:mt-0', className)}
    />
  ),
  ol: ({ className, ...props }: ComponentPropsWithoutRef<'ol'>) => (
    <ol
      {...props}
      className={cn(
        'mt-4 max-w-prose list-decimal space-y-1.5 ps-6 marker:text-muted-foreground marker:tabular-nums first:mt-0',
        className
      )}
    />
  ),
  li: ({ className, ...props }: ComponentPropsWithoutRef<'li'>) => (
    <li {...props} className={cn('ps-1 leading-7 text-pretty [&>p]:mt-1 [&>ul]:mt-1.5 [&>ol]:mt-1.5', className)} />
  ),
  strong: ({ className, ...props }: ComponentPropsWithoutRef<'strong'>) => (
    <strong {...props} className={cn('font-semibold text-foreground', className)} />
  ),
  code: ({ className, ...props }: ComponentPropsWithoutRef<'code'>) => (
    <code {...props} className={cn('bg-muted px-1 py-0.5 font-mono text-[0.875em] break-words', className)} />
  ),
  pre: ({ className, ...props }: ComponentPropsWithoutRef<'pre'>) => (
    <pre
      {...props}
      className={cn(
        'mt-4 overflow-x-auto border bg-muted p-4 text-sm first:mt-0 [&>code]:bg-transparent [&>code]:p-0',
        className
      )}
    />
  ),
  blockquote: ({ className, ...props }: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote
      {...props}
      className={cn('mt-4 max-w-prose border-s-2 border-border ps-4 text-muted-foreground first:mt-0', className)}
    />
  ),
  hr: (props: ComponentPropsWithoutRef<'hr'>) => <hr {...props} className="my-10 border-border" />,
  a: ({ href = '', className, children, ...props }: ComponentPropsWithoutRef<'a'>) => {
    const linkClass = cn(
      'font-medium text-foreground underline decoration-primary/60 decoration-1 underline-offset-4 transition-colors hover:decoration-primary hover:decoration-2',
      className
    );
    if (href.startsWith('/') || href.startsWith('#')) {
      return (
        <Link href={href} className={linkClass}>
          {children}
        </Link>
      );
    }
    return (
      <a {...props} href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {children}
        <span className="sr-only"> (se abre en otra pestaña)</span>
      </a>
    );
  },
  table: ({ className, ...props }: ComponentPropsWithoutRef<'table'>) => (
    // Las tablas anchas scrollean dentro de su contenedor, nunca la página. Enfocable para poder
    // desplazarla con el teclado.
    <div
      role="region"
      aria-label="Tabla"
      tabIndex={0}
      className="mt-5 overflow-x-auto border outline-none first:mt-0 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <table {...props} className={cn('w-full border-collapse text-sm', className)} />
    </div>
  ),
  thead: ({ className, ...props }: ComponentPropsWithoutRef<'thead'>) => (
    <thead {...props} className={cn('bg-muted', className)} />
  ),
  tr: ({ className, ...props }: ComponentPropsWithoutRef<'tr'>) => (
    <tr {...props} className={cn('border-b last:border-b-0', className)} />
  ),
  th: ({ className, ...props }: ComponentPropsWithoutRef<'th'>) => (
    <th
      scope="col"
      {...props}
      className={cn('px-3 py-2 text-start align-bottom font-semibold whitespace-nowrap text-foreground', className)}
    />
  ),
  td: ({ className, ...props }: ComponentPropsWithoutRef<'td'>) => (
    <td {...props} className={cn('min-w-32 px-3 py-2 align-top leading-relaxed tabular-nums', className)} />
  ),
};

export const manualMdxComponents: MDXComponents = { ...prose, ...vocabulary };
