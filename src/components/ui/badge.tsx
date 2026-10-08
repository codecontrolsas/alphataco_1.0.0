import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

// Tonos de estado (escritos completos: Tailwind solo emite clases literales).
const SUCCESS = 'border-success-border bg-success-soft text-success-text';
const WARNING = 'border-warning-border bg-warning-soft text-warning-text';
const DANGER = 'border-danger-border bg-danger-soft text-danger-text';
const INFO = 'border-info-border bg-info-soft text-info-text';
const NEUTRAL = 'border-neutral-border bg-neutral-soft text-neutral-text';
const BRAND = 'border-primary/30 bg-primary-soft text-primary-text';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 min-h-5 px-1.5 py-px border rounded-none text-caption font-medium whitespace-nowrap overflow-hidden [&>svg]:size-3 [&>svg]:pointer-events-none transition-[color,background-color]',
  {
    variants: {
      variant: {
        success: SUCCESS,
        warning: WARNING,
        danger: DANGER,
        info: INFO,
        neutral: NEUTRAL,
        brand: BRAND,
        outline: 'border-border-strong bg-transparent text-foreground [a&]:hover:bg-accent',
        ghost: 'border-transparent [a&]:hover:bg-accent',
        link: 'border-transparent text-primary-text underline-offset-4 [a&]:hover:underline',
        // Alias de los nombres anteriores (se eliminan en la Fase 9 del rediseño).
        yellow: WARNING,
        destructive: DANGER,
        red: DANGER,
        secondary: NEUTRAL,
        default: BRAND,
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean };

export { Badge, badgeVariants, type BadgeProps };
