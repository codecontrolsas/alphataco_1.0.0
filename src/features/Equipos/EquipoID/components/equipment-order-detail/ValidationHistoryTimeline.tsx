'use client';

import { Separator } from '@/components/ui/separator';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { AlertTriangle, CheckCircle2, Clock, History, XCircle, type LucideIcon } from 'lucide-react';
import type { EquipmentOrderDetail } from '../../lib/actions/vehicle-operations-actions';

type ValidationHistory = EquipmentOrderDetail['validationHistory'];

const ACTION_CONFIG: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  workshop_approved: { label: 'Aprobado por Jefe de Taller', icon: CheckCircle2, color: 'text-emerald-600' },
  operations_approved: { label: 'Aprobado por Operaciones', icon: CheckCircle2, color: 'text-emerald-600' },
  workshop_item_rejected: { label: 'Items rechazados por Jefe de Taller', icon: XCircle, color: 'text-red-600' },
  operations_item_rejected: { label: 'Items rechazados por Operaciones', icon: XCircle, color: 'text-red-600' },
  workshop_agreed_ops_rejection: {
    label: 'Jefe de Taller de acuerdo con rechazo',
    icon: AlertTriangle,
    color: 'text-amber-600',
  },
  workshop_disagreed_ops_rejection: {
    label: 'Jefe de Taller en desacuerdo con rechazo',
    icon: AlertTriangle,
    color: 'text-amber-600',
  },
  status_change: { label: 'Cambio de estado', icon: Clock, color: 'text-blue-600' },
};

const FALLBACK_CONFIG = { icon: Clock, color: 'text-muted-foreground' };

interface RejectedItem {
  repairName: string;
  sectorName: string;
  comment: string;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Ítems rechazados que el servidor guarda en el `metadata` (JSON libre) del registro de actividad. */
function readRejectedItems(metadata: unknown): RejectedItem[] {
  if (!metadata || typeof metadata !== 'object' || !('rejected_items' in metadata)) return [];

  const rejected = metadata.rejected_items;
  if (!Array.isArray(rejected)) return [];

  return rejected.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    return [
      {
        repairName: asText(record.repair_name),
        sectorName: asText(record.sector_name),
        comment: asText(record.comment),
      },
    ];
  });
}

export function ValidationHistoryTimeline({ history }: { history: ValidationHistory }) {
  if (history.length === 0) return null;

  return (
    <>
      <Separator />
      <div className="space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <History className="h-4 w-4" />
          Historial de Validaciones
        </h4>
        <div className="space-y-2">
          {history.map((entry) => {
            const known = ACTION_CONFIG[entry.action_type];
            const label = known?.label ?? entry.action_type;
            const Icon = known?.icon ?? FALLBACK_CONFIG.icon;
            const color = known?.color ?? FALLBACK_CONFIG.color;
            const rejectedItems = readRejectedItems(entry.metadata);

            return (
              <div key={entry.id} className="border rounded-md p-3 text-sm">
                <div className="flex items-start gap-2">
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`font-medium ${color}`}>{label}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatArgentinaDateTime(entry.performed_at)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      por {entry.profile?.fullname || 'Sistema'}
                    </div>
                    {entry.notes && <p className="text-xs mt-1 text-muted-foreground italic">{entry.notes}</p>}
                    {rejectedItems.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {rejectedItems.map((item, index) => (
                          <div
                            key={`${item.repairName}-${index}`}
                            className="text-xs bg-destructive/5 border border-destructive/10 rounded px-2 py-1"
                          >
                            <span className="font-medium">{item.repairName}</span>
                            <span className="text-muted-foreground"> ({item.sectorName})</span>
                            {item.comment && <span className="text-destructive/80"> - {item.comment}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
