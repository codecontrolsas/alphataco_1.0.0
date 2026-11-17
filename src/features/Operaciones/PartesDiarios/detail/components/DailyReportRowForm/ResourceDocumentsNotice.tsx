'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getRowResourcesDocumentWarnings } from '@/features/Documentacion/CumplimientoClientes/actions/customer-compliance';
import { useQuery } from '@tanstack/react-query';
import { FileWarning } from 'lucide-react';

interface Props {
  customerId: string | null;
  customerName: string | null;
  /** Fecha del parte (`YYYY-MM-DD`). */
  date: string | undefined;
  employeeIds: string[];
  equipmentIds: string[];
}

/**
 * Aviso NO bloqueante: personas o equipos de la línea que no cumplen la documentación que pide el cliente en la fecha
 * del parte (falta, está rechazada o vencida). Se puede guardar igual. Sin permiso de documentación no muestra nada.
 */
export function ResourceDocumentsNotice({ customerId, customerName, date, employeeIds, equipmentIds }: Props) {
  const sortedEmployees = [...employeeIds].sort();
  const sortedEquipment = [...equipmentIds].sort();
  const enabled = Boolean(customerId && date && sortedEmployees.length + sortedEquipment.length > 0);

  const { data } = useQuery({
    queryKey: ['row-resource-documents', customerId, date, sortedEmployees.join(','), sortedEquipment.join(',')],
    queryFn: () =>
      getRowResourcesDocumentWarnings({
        customerId: customerId!,
        date: date!,
        employeeIds: sortedEmployees,
        equipmentIds: sortedEquipment,
      }),
    enabled,
    staleTime: 60_000,
    // Un error acá no debe molestar a quien carga el parte: el aviso es informativo.
    retry: false,
  });

  const warnings = enabled ? data ?? [] : [];

  return (
    <div aria-live="polite">
      {warnings.length > 0 && (
        <Alert variant="warning" role="note">
          <FileWarning aria-hidden="true" />
          <AlertTitle className="line-clamp-none">
            {warnings.length === 1 ? '1 recurso no cumple' : `${warnings.length} recursos no cumplen`} la documentación
            que pide {customerName ?? 'el cliente'}
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-1">
              {warnings.map((w) => (
                <li key={w.id}>
                  <span className="font-medium">{w.label}</span>: {w.issues.join(', ')}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">Es un aviso: la línea se puede guardar igual.</p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
