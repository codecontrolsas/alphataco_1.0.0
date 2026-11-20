'use client';

import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { getBoardColumns } from '../actions/board.server';
import type { BoardData } from '../lib/types';
import { BoardColumn } from './BoardColumn';

// El panel de la orden es pesado: se baja recién cuando alguien abre una tarjeta.
const OrderDetailDialog = dynamic(
  () => import('../../MaintenanceOrders/components/OrderDetailDialog').then((m) => m.OrderDetailDialog),
  { ssr: false }
);

export const WORK_ORDERS_BOARD_QUERY_KEY = ['maintenance', 'work-orders-board'] as const;

/**
 * Tablero de solo lectura. Desde `md` las columnas van en fila con scroll horizontal y `snap-x`; en pantallas
 * angostas se ve una columna a la vez y el selector de arriba (con el total de cada una) hace de encabezado.
 * Comparte el prefijo `['maintenance']`: cualquier acción de mantenimiento lo refresca.
 */
export function WorkOrdersBoardView({ initialData }: { initialData: BoardData }) {
  const { data, refetch, isFetching } = useQuery({
    queryKey: WORK_ORDERS_BOARD_QUERY_KEY,
    queryFn: () => getBoardColumns(),
    initialData,
  });
  const [activeId, setActiveId] = useState<string>(initialData.columns[0]?.id ?? '');
  const [orderId, setOrderId] = useState<string | null>(null);

  const active = data.columns.some((column) => column.id === activeId) ? activeId : (data.columns[0]?.id ?? '');

  return (
    <div className="min-w-0 space-y-3" aria-busy={isFetching}>
      {/* Selector de columna: solo en pantallas angostas. Botones con `aria-pressed`: la columna elegida es la única visible. */}
      <div role="group" aria-label="Columna del tablero" className="flex min-w-0 gap-1 overflow-x-auto border-b md:hidden">
        {data.columns.map((column) => (
          <button
            key={column.id}
            type="button"
            aria-pressed={column.id === active}
            onClick={() => setActiveId(column.id)}
            className={cn(
              '-mb-px flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap',
              'focus-visible:outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2',
              column.id === active ? 'border-brand text-foreground' : 'text-muted-foreground border-transparent'
            )}
          >
            {column.label}
            <span className="bg-muted rounded-full px-1.5 py-px font-mono text-xs tabular-nums">{column.total ?? '—'}</span>
          </button>
        ))}
      </div>

      <div className="flex min-w-0 snap-x snap-mandatory flex-col gap-3 md:flex-row md:items-start md:overflow-x-auto md:pb-2">
        {data.columns.map((column) => (
          <BoardColumn
            key={column.id}
            column={column}
            active={column.id === active}
            onOpen={setOrderId}
            onRetry={() => void refetch()}
          />
        ))}
      </div>

      <OrderDetailDialog orderId={orderId} open={!!orderId} onClose={() => setOrderId(null)} context="workshop" />
    </div>
  );
}
