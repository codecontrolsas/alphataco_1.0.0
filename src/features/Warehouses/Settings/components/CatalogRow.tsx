'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, RotateCcw, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

interface CatalogRowProps {
  title: ReactNode;
  materialCount: number;
  isActive: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onReactivate: () => void;
  busy?: boolean;
}

/** Fila de un catalogo simple (categoria o unidad) con sus acciones. */
export function CatalogRow({
  title,
  materialCount,
  isActive,
  canUpdate,
  canDelete,
  onEdit,
  onRemove,
  onReactivate,
  busy,
}: CatalogRowProps) {
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={isActive ? 'truncate' : 'truncate text-muted-foreground'}>{title}</span>
          {!isActive && <Badge variant="outline">Inactiva</Badge>}
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {materialCount === 0 ? 'Sin materiales' : materialCount === 1 ? '1 material' : `${materialCount} materiales`}
        </p>
      </div>
      {canUpdate && (
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Editar" onClick={onEdit} disabled={busy}>
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      {canUpdate && !isActive && (
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Reactivar" onClick={onReactivate} disabled={busy}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}
      {canDelete && isActive && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          aria-label="Dar de baja"
          onClick={onRemove}
          disabled={busy}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
}
