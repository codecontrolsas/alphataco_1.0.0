import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const cardVariants = cva('border border-border bg-card text-card-foreground', {
  variants: {
    variant: {
      default: '',
      outlined: 'border-border-strong bg-transparent',
      filled: 'border-transparent bg-muted text-foreground',
      elevated: '',
      ghost: 'border-transparent bg-transparent',
      primary: 'border-primary/30 bg-primary-soft',
      secondary: 'bg-panel-2',
      success: 'border-success-border bg-success-soft text-success-text',
      warning: 'border-warning-border bg-warning-soft text-warning-text',
      destructive: 'border-danger-border bg-danger-soft text-danger-text',
    },
    size: {
      sm: 'text-sm',
      default: '',
      lg: 'text-lg',
    },
    padding: {
      none: '',
      sm: 'p-3',
      default: 'p-0',
      lg: 'p-6',
      xl: 'p-8',
    },
    text_color: {
      default: 'text-card-foreground',
      success: 'text-success-text',
      warning: 'text-warning-text',
      destructive: 'text-danger-text',
    },
    rounded: {
      none: 'rounded-none',
      sm: 'rounded-none',
      default: 'rounded-none',
      lg: 'rounded-none',
      full: 'rounded-full',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
    padding: 'default',
    rounded: 'default',
  },
});

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, size, padding, rounded, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card"
      className={cn(cardVariants({ variant, size, padding, rounded }), 'flex flex-col gap-6 py-6', className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-title" className={cn('text-section font-semibold', className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-description" className={cn('text-muted-foreground text-sm', className)} {...props} />;
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-6', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-6 py-4 [.border-t]:pt-6 [.border-t]:mt-4', className)}
      {...props}
    />
  );
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
