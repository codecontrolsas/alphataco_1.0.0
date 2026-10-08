import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input placeholder:text-muted-foreground bg-card dark:bg-background hover:border-fg-subtle aria-invalid:border-danger flex field-sizing-content min-h-16 w-full border px-2.5 py-2 text-base transition-[color,border-color] duration-(--duration-fast) disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
