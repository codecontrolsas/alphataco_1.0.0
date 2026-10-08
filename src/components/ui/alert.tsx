import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

// DISENO §4.16: un tono por variante, siempre con sus tokens (`-border`, `-soft`, `-text`). Clases completas:
// Tailwind solo emite las que aparecen escritas.
const NEUTRAL = 'border-neutral-border bg-neutral-soft text-neutral-text';
const DANGER = 'border-danger-border bg-danger-soft text-danger-text';
const INFO = 'border-info-border bg-info-soft text-info-text';

const alertVariants = cva(
  'relative w-full border px-3 py-2.5 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-2.5 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        neutral: NEUTRAL,
        success: 'border-success-border bg-success-soft text-success-text',
        warning: 'border-warning-border bg-warning-soft text-warning-text',
        danger: DANGER,
        info: INFO,
        // Aviso dentro de un form: sin caja, solo ícono + texto.
        inline: 'border-transparent bg-transparent px-0 py-0 text-muted-foreground',
        // Alias de los nombres anteriores (se eliminan en la Fase 9 del rediseño).
        default: NEUTRAL,
        destructive: DANGER,
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
);

function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 line-clamp-1 min-h-4 font-medium', className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'text-foreground/80 col-start-2 grid justify-items-start gap-1 text-caption [&_p]:leading-relaxed',
        className
      )}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
