'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';

/**
 * Campo de contraseña con "mostrar/ocultar" y aviso de bloqueo de mayúsculas.
 * Pasa todo lo demás al `Input` (incluido el `ref` de react-hook-form).
 */
export function PasswordInput({ className, onKeyUp, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = React.useState(false);
  const [capsLock, setCapsLock] = React.useState(false);

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          {...props}
          type={visible ? 'text' : 'password'}
          className={cn('pr-11', className)}
          onKeyUp={(event) => {
            setCapsLock(event.getModifierState('CapsLock'));
            onKeyUp?.(event);
          }}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 absolute top-1 right-1 grid size-8 place-items-center rounded-md outline-none focus-visible:ring-[3px]"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {capsLock && <p className="text-muted-foreground text-sm">Tenés las mayúsculas activadas.</p>}
    </div>
  );
}
