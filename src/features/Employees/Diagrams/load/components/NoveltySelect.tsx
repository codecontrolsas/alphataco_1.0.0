'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NoveltyDot } from './NoveltyBadge';

export interface NoveltyOption {
  id: string;
  name: string | null;
  color?: string | null;
  short_description?: string | null;
}

interface NoveltySelectProps {
  options: readonly NoveltyOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  disabled?: boolean;
  isLoading?: boolean;
  ariaLabel?: string;
}

/** Selector de novedad con el color de cada una. Sirve para tipos de novedad y para novedades de un diagrama. */
export function NoveltySelect({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  isLoading,
  ariaLabel,
}: NoveltySelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || isLoading}>
      <SelectTrigger className="w-full" aria-label={ariaLabel}>
        <SelectValue placeholder={isLoading ? 'Cargando…' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <span className="flex min-w-0 items-center gap-2">
              <NoveltyDot color={option.color} />
              <span className="truncate">{option.name ?? 'Sin nombre'}</span>
              {option.short_description ? (
                <span className="text-muted-foreground font-mono text-xs">{option.short_description}</span>
              ) : null}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
