'use client';

import { cn } from '@/lib/utils';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { CheckCircle2, Circle } from 'lucide-react';
import { useMemo } from 'react';
import { useWatch, type Control } from 'react-hook-form';
import { useOrderChecklist } from '../hooks/useOrderChecklist';
import { countOrdersToCreate } from '../lib/preparte-form-data';
import type { PreparteFormData } from '../schemas/preparte-form';
import type { ContractItemOption, Contrato } from './preparte-form/types';
import type { Cliente } from '../types/entities';

interface OrderSummaryAsideProps {
  control: Control<PreparteFormData>;
  clientes: Cliente[];
  contratos: Contrato[];
  contractItems: ContractItemOption[];
}

const EMPTY_VALUE = '—';

/**
 * Panel lateral del alta de pedido: resumen de lo cargado (cliente, contrato, ítems y cuántos
 * pedidos se van a crear) y checklist de obligatorios. Se actualiza en vivo con `useWatch`.
 */
export function OrderSummaryAside({ control, clientes, contratos, contractItems }: OrderSummaryAsideProps) {
  const [clienteId, contratoId, items] = useWatch({ control, name: ['cliente_id', 'contrato_id', 'item'] });

  const customerName = clientes.find((c) => c.id === clienteId)?.name;
  const contractName = contratos.find((c) => c.id === contratoId)?.service_name;

  const summaryItems = useMemo(
    () =>
      (items ?? [])
        .filter((row) => row?.id)
        .map((row) => ({
          id: row.id,
          name: contractItems.find((option) => option.value === row.id)?.label ?? 'Ítem',
          quantity: row.quantity || 1,
        })),
    [items, contractItems]
  );

  const ordersCount = useMemo(() => countOrdersToCreate(items ?? []), [items]);

  const checklist = useOrderChecklist(control);

  return (
    <>
      <SectionCard title="Resumen">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">Cliente</dt>
            <dd className="font-medium">{customerName ?? EMPTY_VALUE}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Contrato</dt>
            <dd className="font-medium">{contractName ?? EMPTY_VALUE}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Ítems</dt>
            <dd>
              {summaryItems.length > 0 ? (
                <ul className="space-y-1">
                  {summaryItems.map((row) => (
                    <li key={row.id} className="font-medium">
                      {row.name} <span className="text-muted-foreground tabular-nums">× {row.quantity}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="font-medium">{EMPTY_VALUE}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Pedidos a crear</dt>
            <dd className="font-medium">
              {ordersCount > 0 ? (
                <>
                  Se {ordersCount === 1 ? 'creará' : 'crearán'}{' '}
                  <span className="tabular-nums">{ordersCount}</span> {ordersCount === 1 ? 'pedido' : 'pedidos'}
                </>
              ) : (
                <span className="text-muted-foreground font-normal">Completá ítems y fechas para calcularlo</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">N° de pedido</dt>
            <dd className="text-muted-foreground">Se asigna al guardar</dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Antes de guardar">
        <ul className="space-y-3 text-sm">
          {checklist.map((entry) => (
            <li key={entry.key} className="flex items-center gap-2.5">
              {entry.done ? (
                <CheckCircle2 aria-hidden="true" className="text-ok size-5 shrink-0" />
              ) : (
                <Circle aria-hidden="true" className="text-muted-foreground size-5 shrink-0" />
              )}
              <span className={cn(!entry.done && 'text-muted-foreground')}>{entry.label}</span>
              <span className="sr-only">{entry.done ? 'completo' : 'pendiente'}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </>
  );
}
