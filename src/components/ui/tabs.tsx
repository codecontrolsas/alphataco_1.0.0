'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Tabs as TabsPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

function Tabs({ className, orientation = 'horizontal', ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn('group/tabs flex gap-2 data-[orientation=horizontal]:flex-col', className)}
      {...props}
    />
  );
}

// DISENO §4.9. `default` son pestañas subrayadas; `segmented` es el control de vista/densidad.
// Las pestañas no se parten en dos líneas: en mobile scrollean en horizontal, con fade lateral solo en el borde que
// tiene pestañas ocultas (`scroll-fade-x`; sin desborde no hay máscara).
const UNDERLINE_LIST =
  'border-border border-b group-data-[orientation=horizontal]/tabs:max-w-full group-data-[orientation=horizontal]/tabs:overflow-x-auto group-data-[orientation=horizontal]/tabs:scroll-fade-x';

const tabsListVariants = cva(
  'group/tabs-list text-muted-foreground inline-flex w-fit items-center justify-start group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:items-stretch',
  {
    variants: {
      variant: {
        default: UNDERLINE_LIST,
        segmented: 'border-input h-8 border',
        // Alias: hasta la Fase 1 era la variante subrayada; ahora es igual a `default`.
        line: UNDERLINE_LIST,
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function TabsList({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      // `line` es alias de `default`: el trigger lee un solo nombre canónico.
      data-variant={variant === 'line' ? 'default' : variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // El outline de foco va hacia adentro: la lista subrayada scrollea y recortaría uno hacia afuera.
        "text-muted-foreground hover:text-foreground data-[state=active]:text-foreground relative inline-flex h-10 flex-1 items-center justify-center gap-1.5 px-3 text-[13px] font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-(--duration-fast) focus-visible:outline-offset-[-2px] disabled:pointer-events-none disabled:opacity-50 group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Subrayada: barra de acento de 2px abajo (a la izquierda en vertical).
        'group-data-[variant=default]/tabs-list:data-[state=active]:shadow-[inset_0_-2px_0_var(--primary)] group-data-[orientation=vertical]/tabs:group-data-[variant=default]/tabs-list:data-[state=active]:shadow-[inset_2px_0_0_var(--primary)]',
        // Segmented: ítems separados por hairline y el activo invertido.
        'group-data-[variant=segmented]/tabs-list:border-input group-data-[variant=segmented]/tabs-list:h-full group-data-[variant=segmented]/tabs-list:not-first:border-l group-data-[variant=segmented]/tabs-list:data-[state=active]:bg-foreground group-data-[variant=segmented]/tabs-list:data-[state=active]:text-background',
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants };
