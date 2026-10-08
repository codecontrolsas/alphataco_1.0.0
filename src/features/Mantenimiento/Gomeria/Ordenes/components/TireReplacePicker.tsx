'use client';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { tireRetreadLabels, tireTreadTypeLabels } from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { getAvailableTiresForVehicle, type AvailableTire } from '../actions/actions.server';

// ─── Props ───────────────────────────────────────────────────────────────────

interface TireReplacePickerProps {
  /**
   * Vehículo que se está atendiendo: de él sale la empresa del stock. Las cubiertas nuevas se
   * dan de alta en el catálogo o con una entrada en Almacenes (desde el QR no se crean).
   */
  vehicleId: string;
  onSelect: (tire: AvailableTire) => void;
  selectedTireId?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TireReplacePicker({ vehicleId, onSelect, selectedTireId }: TireReplacePickerProps) {
  const [search, setSearch] = useState('');

  const { data: tires = [], isLoading } = useQuery({
    queryKey: ['available-tires', vehicleId],
    queryFn: () => getAvailableTiresForVehicle(vehicleId),
    staleTime: 30 * 1000,
  });

  const filtered = tires.filter(
    (t) =>
      search.trim() === '' ||
      t.serial_number.toLowerCase().includes(search.toLowerCase()) ||
      (t.brand?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (t.tire_type?.size ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        placeholder="Buscar por serie, marca o medida..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-sm"
      />

      {tires.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          No hay cubiertas disponibles en stock. Se dan de alta en el catálogo de cubiertas o con una entrada en
          Almacenes.
        </p>
      ) : (
        <ScrollArea className="h-52">
          <div className="space-y-1 pr-2">
            {filtered.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">Sin resultados para &quot;{search}&quot;</p>
            ) : (
              filtered.map((tire) => (
                <TirePickerRow key={tire.id} tire={tire} selected={tire.id === selectedTireId} onSelect={onSelect} />
              ))
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

interface TirePickerRowProps {
  tire: AvailableTire;
  selected: boolean;
  onSelect: (tire: AvailableTire) => void;
}

function TirePickerRow({ tire, selected, onSelect }: TirePickerRowProps) {
  const treadType = tire.tire_type?.tread_type;
  const treadLabel = treadType ? tireTreadTypeLabels[treadType] ?? treadType : '—';
  const retreadLabel = tire.retread_level ? tireRetreadLabels[tire.retread_level] : null;
  const isMissing = tire.status === 'MISSING';

  return (
    <button
      type="button"
      onClick={() => onSelect(tire)}
      className={cn(
        'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
        selected && 'border-primary bg-primary/5',
        isMissing && !selected && 'border-destructive/30 bg-destructive/5'
      )}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">{tire.serial_number}</span>
          {isMissing && (
            <Badge variant="destructive" className="text-[10px] py-0">
              Extraviada
            </Badge>
          )}
          {tire.is_new ? (
            <Badge variant="success" className="text-[10px] py-0">
              Nueva
            </Badge>
          ) : retreadLabel ? (
            <Badge variant="yellow" className="text-[10px] py-0">
              {retreadLabel}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] py-0">
              Usada
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{tire.brand?.name ?? '—'}</span>
          <span>·</span>
          <span>{tire.tire_type?.size ?? '—'}</span>
          <span>·</span>
          <span>{treadLabel}</span>
          {tire.tread_depth != null && (
            <>
              <span>·</span>
              <span>{Number(tire.tread_depth).toFixed(0)} %</span>
            </>
          )}
          {tire.material_unit?.warehouse && (
            <>
              <span>·</span>
              <span>{tire.material_unit.warehouse.name}</span>
            </>
          )}
        </div>
        {isMissing && selected && (
          <p className="text-[10px] text-destructive mt-1">
            Al usarla, dejará de estar extraviada y pasará a estado instalada.
          </p>
        )}
      </div>
      {selected && <CheckCircle2 className="ml-2 h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}
