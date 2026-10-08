import { cn } from '@/lib/utils';

interface StatusScreenProps {
  /** Overline mono: "ERROR 404", "ERROR 500". */
  code: string;
  /** Título (h1). */
  title: React.ReactNode;
  description: React.ReactNode;
  /** Bloques extra (detalle del error, callouts). */
  children?: React.ReactNode;
  /** Botones: primary primero. */
  actions: React.ReactNode;
  /** `main` fuera del shell (404, error de app, error global); `section` dentro del dashboard. */
  as?: 'main' | 'section';
  className?: string;
}

/**
 * Layout común de las pantallas de borde (404, error de app, error del dashboard y error global).
 * Alineado a la izquierda, sin ilustración. Sin hooks ni directiva: sirve desde server y client.
 */
export function StatusScreen({
  code,
  title,
  description,
  children,
  actions,
  as: Comp = 'section',
  className,
}: StatusScreenProps) {
  return (
    <Comp className={cn('mx-auto w-full max-w-xl space-y-6 px-4', className)}>
      <div className="space-y-2">
        <p className="font-mono text-overline text-muted-foreground">{code}</p>
        <h1 className="text-display text-balance">{title}</h1>
        <p className="text-body text-pretty text-muted-foreground">{description}</p>
      </div>
      {children}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </Comp>
  );
}
