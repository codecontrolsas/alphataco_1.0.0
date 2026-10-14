import { Badge } from '@/components/ui/badge';
import {
  tireRetreadLabels,
  tireStatusBadges,
  tireStatusLabels,
  tireTreadTypeLabels,
} from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';

export interface TireInfo {
  serial_number: string;
  is_new: boolean;
  retread_level?: string | null;
  // Prisma returns Decimal which has a valueOf()/toString() similar to number
  tread_depth?: { valueOf(): number | string } | string | number | null;
  status: string;
  brand?: { name: string } | null;
  tire_type?: { size: string; tread_type: string } | null;
}

export function TireInfoBadge({ tire }: { tire: TireInfo }) {
  const treadType = tire.tire_type?.tread_type;
  const treadLabel = treadType ? tireTreadTypeLabels[treadType] ?? treadType : '—';
  const retreadLabel = tire.retread_level ? tireRetreadLabels[tire.retread_level] : null;
  const statusLabel = tireStatusLabels[tire.status] ?? tire.status;
  const statusVariant = tireStatusBadges[tire.status] ?? 'default';

  return (
    <div className="rounded-md border p-3 space-y-2 bg-muted/30">
      <div className="flex items-center justify-between">
        <span className="font-mono font-semibold text-sm">{tire.serial_number}</span>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>
      <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
        <span>{tire.brand?.name ?? '—'}</span>
        <span>·</span>
        <span>{tire.tire_type?.size ?? '—'}</span>
        <span>·</span>
        <span>{treadLabel}</span>
        {tire.tread_depth != null && (
          <>
            <span>·</span>
            <span>{Number(tire.tread_depth).toFixed(0)} % desgaste</span>
          </>
        )}
      </div>
      <div className="flex gap-1">
        {tire.is_new ? (
          <Badge variant="success" className="text-[10px]">
            Nueva
          </Badge>
        ) : retreadLabel ? (
          <Badge variant="yellow" className="text-[10px]">
            {retreadLabel}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            Usada
          </Badge>
        )}
      </div>
    </div>
  );
}
