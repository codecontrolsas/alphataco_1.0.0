'use client';

import { useMemo } from 'react';
import { useWatch, type Control } from 'react-hook-form';
import { getOrderChecklist, type OrderChecklistEntry } from '../lib/preparte-form-data';
import type { PreparteFormData } from '../schemas/preparte-form';

/** Checklist de obligatorios del alta de pedido, recalculado en vivo con los valores del formulario. */
export function useOrderChecklist(control: Control<PreparteFormData>): OrderChecklistEntry[] {
  const [clienteId, contratoId, areaId, requester, requestDate, items] = useWatch({
    control,
    name: ['cliente_id', 'contrato_id', 'areas_service_id', 'solicitante', 'requestDate', 'item'],
  });

  return useMemo(
    () =>
      getOrderChecklist({
        cliente_id: clienteId,
        contrato_id: contratoId,
        areas_service_id: areaId,
        solicitante: requester,
        requestDate,
        item: items,
      }),
    [clienteId, contratoId, areaId, requester, requestDate, items]
  );
}
