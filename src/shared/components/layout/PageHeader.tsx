import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** Título de la página (h1). */
  title: React.ReactNode;
  /** Módulo o contexto, en `text-overline`. */
  overline?: React.ReactNode;
  /** Fila de datos: códigos (`data-code`), badges de estado, "Actualizado …". */
  meta?: React.ReactNode;
  /** Una línea de ayuda. */
  description?: React.ReactNode;
  /** Foto 48×48 de las fichas (empleado, equipo). */
  media?: React.ReactNode;
  /** Acciones en orden: secundarias…, primary ÚLTIMA, menú ⋯ al final. */
  actions?: React.ReactNode;
  /** Tabs de la página, pegadas al borde inferior. */
  tabs?: React.ReactNode;
  className?: string;
}

/**
 * Encabezado de página: banda `bg-card` a todo el ancho del área de contenido.
 *
 * La banda se extiende al ancho del `@container/page` del layout del dashboard con
 * `w-[100cqw] ml-[calc(50%-50cqw)]` y se pega al header de la app con el margen negativo. Por eso
 * tiene que ser el primer elemento de la página y no estar dentro de otro `@container` ni de un
 * ancestro con `overflow-hidden`. Su contenido vuelve a centrarse con el mismo `max-w` y gutter
 * que la página, así el h1 alinea con el breadcrumb y con el contenido.
 *
 * Server Component (sin hooks): se puede usar desde páginas server y desde client components.
 */
export function PageHeader({ title, overline, meta, description, media, actions, tabs, className }: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        '@container/ph -mt-4 ml-[calc(50%-50cqw)] w-[100cqw] border-b border-border-strong bg-card md:-mt-6',
        className
      )}
    >
      <div className="mx-auto flex max-w-(--page-max) flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 py-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {media ?? null}
          <div className="min-w-0 space-y-1">
            {overline ? <p className="text-overline text-muted-foreground">{overline}</p> : null}
            <h1 className="text-page-title text-balance @max-xl/ph:text-[1.125rem]">{title}</h1>
            {meta ? (
              <div className="flex flex-wrap items-center gap-3 text-caption text-muted-foreground">{meta}</div>
            ) : null}
            {description ? (
              <p className="max-w-prose text-body text-pretty text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex w-full flex-wrap items-center gap-2 @xl/ph:w-auto [&>[data-slot=button][data-variant=primary]]:w-full @xl/ph:[&>[data-slot=button][data-variant=primary]]:w-auto">
            {actions}
          </div>
        ) : null}
      </div>
      {tabs ? <div className="mx-auto max-w-(--page-max) px-4 md:px-6">{tabs}</div> : null}
    </header>
  );
}
