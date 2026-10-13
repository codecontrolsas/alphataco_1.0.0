import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const cardVariants = cva('rounded-xl border bg-card text-card-foreground', {
  variants: {
    variant: {
      default: 'border-border bg-card text-card-foreground',
      outlined: 'border-2 border-border bg-transparent',
      filled: 'border-0 bg-muted text-muted-foreground',
      elevated: 'border-0 shadow-md bg-card text-card-foreground',
      ghost: 'border-0 shadow-none bg-transparent',
      primary: 'border-primary bg-primary/5 text-primary border-2',
      secondary: 'border-secondary bg-secondary/5 text-secondary border-2',
      success:
        'border-ok/40 bg-ok-subtle text-ok-subtle-foreground border [&_*]:text-ok-subtle-foreground [&_.card-description]:opacity-80 [&_.card-footer]:opacity-80',
      warning:
        'border-warn/40 bg-warn-subtle text-warn-subtle-foreground border [&_*]:text-warn-subtle-foreground [&_.card-description]:opacity-80 [&_.card-footer]:opacity-80',
      destructive:
        'border-danger/40 bg-danger-subtle text-danger-subtle-foreground border [&_*]:text-danger-subtle-foreground [&_.card-description]:opacity-80 [&_.card-footer]:opacity-80',
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
      success: 'text-ok-subtle-foreground',
      warning: 'text-warn-subtle-foreground',
      destructive: 'text-destructive',
    },
    rounded: {
      none: 'rounded-none',
      sm: 'rounded-sm',
      default: 'rounded-xl',
      lg: 'rounded-2xl',
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
  return <div data-slot="card-title" className={cn('leading-none font-semibold', className)} {...props} />;
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
