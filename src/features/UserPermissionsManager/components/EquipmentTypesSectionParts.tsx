'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AlertCircle, Truck } from 'lucide-react';

/**
 * Piezas compartidas del bloque "Tipos de equipamiento" (ticket 690), que aparece dentro
 * del módulo Mantenimiento en el editor de permisos del rol y en el del usuario.
 */

interface SectionHeaderProps {
  /** id del título, para `aria-labelledby` del grupo de casillas */
  titleId: string;
  description: string;
  visibleCount?: number;
  total?: number;
  compact?: boolean;
}

export function EquipmentTypesSectionHeader({
  titleId,
  description,
  visibleCount,
  total,
  compact = false,
}: SectionHeaderProps) {
  return (
    <div className="flex items-start gap-2">
      <Truck className={cn('mt-0.5 shrink-0 text-primary', compact ? 'size-3.5' : 'size-4')} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p id={titleId} className={cn('font-semibold', compact ? 'text-xs' : 'text-sm')}>
          Tipos de equipamiento
        </p>
        <p className={cn('text-muted-foreground text-pretty', compact ? 'text-[11px]' : 'text-xs')}>{description}</p>
      </div>
      {total !== undefined && total > 0 && visibleCount !== undefined && (
        <Badge
          variant="outline"
          className={cn('tabular-nums', compact ? 'text-[9px] h-4 px-1' : 'text-[10px] h-5 px-1.5')}
          aria-label={`${visibleCount} de ${total} tipos visibles`}
        >
          {visibleCount}/{total}
        </Badge>
      )}
    </div>
  );
}

export function EquipmentTypesSectionSkeleton({ rows = 6, compact = false }: { rows?: number; compact?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={cn('w-full rounded-md', compact ? 'h-7' : 'h-9')} />
      ))}
    </div>
  );
}

export function EquipmentTypesSectionEmpty() {
  return (
    <p className="rounded-md border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
      No hay tipos de equipamiento activos. Se crean en Configuración › Flota › Tipos y subtipos, con &quot;Aplica a:
      Otros Equipos&quot;.
    </p>
  );
}

export function EquipmentTypesSectionError({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
  return (
    <Alert variant="destructive" className="py-2">
      <AlertCircle aria-hidden="true" />
      <AlertTitle className="text-xs">No se pudieron cargar los tipos de equipamiento</AlertTitle>
      <AlertDescription className="text-xs">
        <Button type="button" variant="outline" size="xs" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? 'Reintentando...' : 'Reintentar'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
