import { cn } from '@/lib/utils';

/**
 * Contenedor de contenido (`DISENO.md` §4.3): hairline, sin sombra ni rounded.
 *
 * Sin padding propio: el DataTable va directo adentro y hace de header con su toolbar. Para el
 * resto, `PanelHeader` + `PanelBody` (+ `PanelFooter`). Nunca un panel dentro de otro: adentro va
 * `Section`. Declara `@container/panel` para que lo de adentro se adapte al ancho del panel.
 *
 * Server Component (sin hooks): se puede usar desde páginas server y desde client components.
 */
function Panel({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      data-slot="panel"
      className={cn('@container/panel border border-border bg-card text-card-foreground', className)}
      {...props}
    />
  );
}

interface PanelHeaderProps {
  title: React.ReactNode;
  /** Nivel del título. `h2` en el cuerpo de una página (debajo del h1 del `PageHeader`). */
  titleAs?: 'h2' | 'h3';
  /** Contexto corto sobre el título, en `text-overline`. */
  overline?: string;
  /** Acciones a la derecha. Usar botones `size="sm"`. */
  actions?: React.ReactNode;
  className?: string;
}

function PanelHeader({ title, titleAs: Title = 'h2', overline, actions, className }: PanelHeaderProps) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        'flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-1.5',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        {overline ? <p className="truncate text-overline text-muted-foreground">{overline}</p> : null}
        <Title className="truncate text-section">{title}</Title>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function PanelBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="panel-body" className={cn('p-4', className)} {...props} />;
}

function PanelFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-footer"
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 border-t border-border bg-panel-2 px-4 py-3',
        className
      )}
      {...props}
    />
  );
}

interface SectionProps {
  /** Se escribe en caso natural: `text-overline` lo pasa a mayúsculas por CSS. */
  title: string;
  /** Nivel del título: `h3` dentro de un `Panel` con header; `h2` si la sección va suelta en la página. */
  titleAs?: 'h2' | 'h3' | 'h4';
  /** Una acción opcional (botón `variant="link"`). */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Divisor de contenido dentro de un panel o de una página (`DISENO.md` §4.5): overline + hairline.
 * Reemplaza los `Separator` + `h3` sueltos. Entre secciones, `gap-8` en el padre.
 */
function Section({ title, titleAs: Title = 'h3', action, children, className }: SectionProps) {
  return (
    <section data-slot="section" className={cn('space-y-3', className)}>
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <Title className="min-w-0 truncate text-overline text-muted-foreground">{title}</Title>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export { Panel, PanelBody, PanelFooter, PanelHeader, Section };
