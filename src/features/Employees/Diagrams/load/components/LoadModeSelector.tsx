'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';

export interface LoadModeOption<T extends string> {
  value: T;
  title: string;
  description: string;
  icon: LucideIcon;
}

interface LoadModeSelectorProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly LoadModeOption<T>[];
  ariaLabel: string;
}

/** Tarjetas de «qué se carga»: un grupo de radios (teclado con flechas) con una descripción por opción. */
export function LoadModeSelector<T extends string>({ value, onChange, options, ariaLabel }: LoadModeSelectorProps<T>) {
  const groupId = useId();

  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as T)}
      aria-label={ariaLabel}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {options.map((option) => {
        const inputId = `${groupId}-${option.value}`;
        const selected = option.value === value;
        const Icon = option.icon;

        return (
          <label
            key={option.value}
            htmlFor={inputId}
            className={cn(
              'focus-within:ring-ring/50 flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors focus-within:ring-[3px]',
              selected ? 'border-brand bg-brand-subtle' : 'hover:bg-accent/50'
            )}
          >
            <RadioGroupItem value={option.value} id={inputId} className="mt-0.5" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon aria-hidden="true" className="text-brand-ink size-4" />
                {option.title}
              </span>
              <span className="text-muted-foreground text-xs">{option.description}</span>
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
