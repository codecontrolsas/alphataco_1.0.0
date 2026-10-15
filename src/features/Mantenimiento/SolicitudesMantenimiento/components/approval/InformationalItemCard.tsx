import { RepairGroupBadge } from '@/features/Mantenimiento/shared/components/RepairGroupBadge';
import { AlertCircle, Info } from 'lucide-react';
import { RepairItemPhotos } from '../../../shared/components/RepairItemPhotos';
import type { DeviationItem } from './approval-schema';

/**
 * Card de lectura para items "no propagables".
 * No tiene botones, no entra al conteo de pendientes, no genera trabajo en taller.
 * Queda como registro histórico de la solicitud.
 */
export function InformationalItemCard({ item }: { item: DeviationItem }) {
  return (
    <div className="border-muted-foreground/30 bg-muted/30 overflow-hidden rounded-lg border border-dashed">
      {/* Banner: separa visualmente del modo decisión */}
      <div className="border-muted-foreground/20 bg-muted/60 flex items-center gap-2 border-b px-4 py-2">
        <Info className="text-muted-foreground h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          No requiere decisión — no viaja a taller
        </p>
      </div>

      <div className="space-y-2 p-4">
        <div className="min-w-0">
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 font-medium">
            {item.item_label}
            {item.is_critical && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Crítico
              </span>
            )}
          </p>
          <RepairGroupBadge groupName={item.group_name} className="mt-1" />
          {item.section_code && (
            <p className="text-muted-foreground mt-0.5 text-sm capitalize">
              Sección: {item.section_code.replace('_', ' ')}
            </p>
          )}
          {item.description && <p className="text-muted-foreground mt-0.5 text-sm italic">{item.description}</p>}
          <RepairItemPhotos images={item.images} label={item.item_label} size="sm" className="mt-2" />
        </div>

        {item.driver_comment && (
          <div className="bg-background/50 rounded-md p-2 text-sm">
            <p className="text-muted-foreground text-xs">Comentario del chofer</p>
            <p className="text-muted-foreground mt-0.5 italic">{item.driver_comment}</p>
          </div>
        )}
      </div>
    </div>
  );
}
