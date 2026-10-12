import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

// Estilos de las 6 variantes semánticas (escritos completos: Tailwind solo emite clases literales).
const PRIMARY = 'bg-primary text-primary-foreground hover:bg-primary-hover';
const SECONDARY = 'border border-input bg-card text-foreground hover:bg-accent';
const GHOST = 'text-foreground hover:bg-accent';
const DANGER = 'bg-danger text-destructive-foreground hover:bg-danger/90';
const DANGER_GHOST = 'text-danger-text hover:bg-danger-soft';
const LINK = 'text-primary-text underline-offset-4 hover:underline';

const SIZE_MD = 'h-8 px-3 has-[>svg]:px-2.5';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-label font-medium transition-[background-color,color,border-color] duration-(--duration-fast) disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger pointer-coarse:min-h-11 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: PRIMARY,
        secondary: SECONDARY,
        ghost: GHOST,
        danger: DANGER,
        'danger-ghost': DANGER_GHOST,
        link: LINK,
        // Alias de los nombres anteriores (se eliminan en la Fase 9 del rediseño).
        default: PRIMARY,
        brand: PRIMARY,
        success: PRIMARY,
        outline: SECONDARY,
        surface: SECONDARY,
        surfaceMuted: SECONDARY,
        destructive: DANGER,
      },
      size: {
        md: SIZE_MD,
        xs: "h-6 gap-1 px-2 text-caption has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-7 px-2.5 has-[>svg]:px-2',
        lg: 'h-10 px-4 has-[>svg]:px-3',
        icon: 'size-8 pointer-coarse:min-w-11',
        'icon-sm': 'size-7 pointer-coarse:min-w-11',
        // Alias conservados.
        default: SIZE_MD,
        'icon-xs': "size-6 pointer-coarse:min-w-11 [&_svg:not([class*='size-'])]:size-3",
        'icon-lg': 'size-10 pointer-coarse:min-w-11',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

/** Nombre canónico de cada variante (los alias apuntan a su equivalente nuevo). Lo lee `PageHeader`. */
const BUTTON_VARIANT_CANONICAL: Record<ButtonVariant, string> = {
  primary: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'danger',
  'danger-ghost': 'danger-ghost',
  link: 'link',
  default: 'primary',
  brand: 'primary',
  success: 'primary',
  outline: 'secondary',
  surface: 'secondary',
  surfaceMuted: 'secondary',
  destructive: 'danger',
};

const BUTTON_SIZE_CANONICAL: Record<ButtonSize, string> = {
  md: 'md',
  xs: 'xs',
  sm: 'sm',
  lg: 'lg',
  icon: 'icon',
  'icon-sm': 'icon-sm',
  default: 'md',
  'icon-xs': 'icon-xs',
  'icon-lg': 'icon-lg',
};

function Button({
  className,
  variant = 'primary',
  size = 'md',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={BUTTON_VARIANT_CANONICAL[variant ?? 'primary']}
      data-size={BUTTON_SIZE_CANONICAL[size ?? 'md']}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { BUTTON_VARIANT_CANONICAL, Button, buttonVariants };
