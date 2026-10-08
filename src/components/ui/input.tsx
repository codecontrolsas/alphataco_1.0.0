import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // DISENO §4.8: en oscuro el campo queda más hundido que el panel. El foco es el outline global de 2px.
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input bg-card dark:bg-background h-8 w-full min-w-0 border px-2.5 py-1 text-base transition-[color,border-color] duration-(--duration-fast) file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'hover:border-fg-subtle aria-invalid:border-danger',
        className
      )}
      {...props}
    />
  );
}

export { Input };
