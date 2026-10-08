'use client';

import { CancelDeliveryDialog } from '@/features/Clothing/EmployeeDeliveries/components/CancelDeliveryDialog';
import { DeliveryReceiptButton } from '@/features/Clothing/pdf/DeliveryReceiptButton';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Acciones de fila de las tablas de entregas: constancia PDF + anular (solo entregas vigentes y con
 * permiso `empleados:indumentaria_empleado:delete`, resuelto en el servidor y pasado como `canCancel`).
 */
export function DeliveryRowActions({
  deliveryId,
  employeeLabel,
  canCancel,
  isCancelled,
  hasStock,
  queryKey,
}: {
  deliveryId: string;
  employeeLabel: string;
  canCancel: boolean;
  isCancelled: boolean;
  /** La entrega descontó stock (las anteriores a Almacenes etapa 5 no). */
  hasStock: boolean;
  /** Key de la query de la tabla, para refrescarla tras anular. */
  queryKey: readonly unknown[];
}) {
  const queryClient = useQueryClient();
  return (
    <div className="flex items-center gap-1">
      <DeliveryReceiptButton deliveryId={deliveryId} compact />
      {canCancel && !isCancelled && (
        <CancelDeliveryDialog
          deliveryId={deliveryId}
          employeeLabel={employeeLabel}
          hasStock={hasStock}
          onCancelled={() => queryClient.invalidateQueries({ queryKey: [...queryKey] })}
        />
      )}
    </div>
  );
}

/** "[legajo] Apellido Nombre" para el titulo del dialogo. */
export function formatEmployeeLabel(
  emp: { file: string | number | null; lastname: string | null; firstname: string | null } | null | undefined
) {
  if (!emp) return 'el empleado';
  return `[${emp.file ?? ''}] ${emp.lastname ?? ''} ${emp.firstname ?? ''}`.trim();
}
