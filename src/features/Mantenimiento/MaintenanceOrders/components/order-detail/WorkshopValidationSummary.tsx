'use client';

import { Badge } from '@/components/ui/badge';
import { MaintenanceStatusPill } from '@/features/Mantenimiento/shared/components/MaintenanceStatusPill';
import { getRepairItemLabel } from '@/features/Mantenimiento/shared/repair-item-label';
import { ClipboardCheck } from 'lucide-react';
import type { MaintenanceOrderData } from '../../actions/queries.server';
import { getRepairDisplayName } from '../../utils/repairDisplayName';

interface WorkshopValidationSummaryProps {
  items: MaintenanceOrderData['maintenance_order_items'];
}

/** Aviso de validación del Jefe de Taller y resumen de las OTs que se van a cerrar. */
export function WorkshopValidationSummary({ items }: WorkshopValidationSummaryProps) {
  const rows = items.flatMap((item) => {
    const wo = item.work_orders;
    if (!wo || Array.isArray(wo)) return [];
    return [{ item, wo, isExternal: !item.assigned_sector_id && !!item.assigned_workshop_id }];
  });

  return (
    <section aria-labelledby="validation-title" className="space-y-3">
      <div className="border-info/40 bg-info-subtle text-info-subtle-foreground flex gap-3 rounded-lg border p-3 text-sm">
        <ClipboardCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <h3 id="validation-title" className="font-semibold">
            Validación de Jefe de Taller
          </h3>
          <p>Revisa que todas las ordenes de trabajo esten completadas y los trabajos realizados correctamente.</p>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="bg-muted rounded-md p-3 text-sm">
          <div className="mb-2 font-medium">Resumen de Ordenes de Trabajo:</div>
          <ul className="space-y-2">
            {rows.map(({ item, wo, isExternal }) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 text-xs">
                <code className="font-mono">{wo.order_number || 'Sin N°'}</code>
                {isExternal && (
                  <Badge variant="outline" className="border-info/50 text-info-subtle-foreground text-[11px]">
                    Externo
                  </Badge>
                )}
                <span className="min-w-0 flex-1 truncate">{getRepairItemLabel(item, getRepairDisplayName(item))}</span>
                <MaintenanceStatusPill entity="workOrder" status={wo.status ?? null} size="sm" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
