import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default: 'bg-brand-subtle text-brand-subtle-foreground [a&]:hover:bg-brand-subtle/80',
        secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/80',
        destructive: 'bg-danger-subtle text-danger-subtle-foreground [a&]:hover:bg-danger-subtle/80',
        outline: 'border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        ghost: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        link: 'text-brand-ink underline-offset-4 [a&]:hover:underline',
        success: 'bg-ok-subtle text-ok-subtle-foreground [a&]:hover:bg-ok-subtle/80',
        yellow: 'bg-warn-subtle text-warn-subtle-foreground [a&]:hover:bg-warn-subtle/80',
        warning: 'bg-warn-subtle text-warn-subtle-foreground [a&]:hover:bg-warn-subtle/80',
        red: 'bg-danger-subtle text-danger-subtle-foreground [a&]:hover:bg-danger-subtle/80',
        info: 'bg-info-subtle text-info-subtle-foreground [a&]:hover:bg-info-subtle/80',
        pending: 'bg-pending-subtle text-pending-subtle-foreground [a&]:hover:bg-pending-subtle/80',
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
