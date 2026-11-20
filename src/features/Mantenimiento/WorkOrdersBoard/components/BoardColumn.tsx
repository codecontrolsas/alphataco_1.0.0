'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { BOARD_COLUMN_LIMIT, type BoardColumnData } from '../lib/types';
import { BoardCard } from './BoardCard';

interface BoardColumnProps {
  column: BoardColumnData;
  /** En pantallas angostas solo se ve la columna elegida en el selector. */
  active: boolean;
  onOpen: (orderId: string) => void;
  onRetry: () => void;
}

/** Una columna del tablero: cabecera con el total real, y sus tarjetas con vacío, error y reintento propios. */
export function BoardColumn({ column, active, onOpen, onRetry }: BoardColumnProps) {
  const headingId = `board-col-${column.id}`;
  const showing = column.items.length;
  const truncated = column.total !== null && column.total > showing;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'bg-muted/30 flex min-w-0 snap-start flex-col rounded-xl border md:w-80 md:shrink-0',
        !active && 'max-md:hidden'
      )}
    >
      <header className="space-y-1 border-b px-3 py-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h3 id={headingId} className="min-w-0 truncate text-sm font-semibold">
            {column.label}
          </h3>
          <Badge variant="secondary" aria-label={column.total === null ? 'sin datos' : `${column.total} órdenes`}>
            {column.total ?? '—'}
          </Badge>
        </div>
        <p className="text-muted-foreground text-xs text-pretty">{column.description}</p>
        {truncated ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            Mostrando {BOARD_COLUMN_LIMIT} de {column.total}. Las más antiguas primero.
          </p>
        ) : null}
      </header>

      <div className="max-h-[70vh] min-h-24 overflow-y-auto p-2">
        {column.error ? (
          <StateBlock
            variant="error"
            className="py-6"
            title={column.error}
            description="Es un problema de conexión o de permisos, no significa que esté vacía."
            action={
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                Reintentar
              </Button>
            }
          />
        ) : showing === 0 ? (
          <StateBlock variant="empty" className="py-6" title={column.emptyTitle} description={column.emptyDescription} />
        ) : (
          <ul className="space-y-2">
            {column.items.map((card) => (
              <BoardCard key={card.id} card={card} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
