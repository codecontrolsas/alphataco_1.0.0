'use client';

import type { VehicleById } from '@/app/dashboard/equipment/action/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EquipmentConditionControl } from '@/features/Equipos/components/EquipmentConditionControl';
import { PermissionGuard } from '@/features/Permissions';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { reasonForTerminationLabels } from '@/shared/utils/mappers';
import { ArrowLeft, Pencil, Truck } from 'lucide-react';
import moment from 'moment';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { VehicleQuickActions } from './vehicle-quick-actions';

type Vehicle = NonNullable<VehicleById>;

function VehicleIdentity({ vehicle }: { vehicle: Vehicle }) {
  const name = [vehicle.brand_vehicles?.name, vehicle.model_vehicles?.name].filter(Boolean).join(' ');
  const details = [vehicle.type?.name, vehicle.year, vehicle.intern_number].filter(Boolean).join(' · ');

  return (
    <div className="flex min-w-0 items-center gap-5">
      <div className="bg-muted flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl">
        {vehicle.picture ? (
          <img src={vehicle.picture} alt={name} className="size-full object-cover" />
        ) : (
          <Truck className="text-muted-foreground size-8" aria-hidden />
        )}
      </div>

      <div className="min-w-0 space-y-1.5">
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {vehicle.domain && (
            <span className="border-foreground bg-card rounded-md border-2 px-2.5 font-mono text-xl font-semibold tracking-wider">
              {vehicle.domain}
            </span>
          )}
          <span className="text-xl font-semibold tracking-tight">{name || 'Equipo sin marca'}</span>
        </h1>
        <p className="text-muted-foreground">{details}</p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <EquipmentConditionControl
            equipmentId={vehicle.id}
            condition={vehicle.condition}
            table="vehicles"
            permissionTab="detalle-equipo"
          />
          <Badge variant={vehicle.is_active ? 'success' : 'destructive'}>
            {vehicle.is_active ? 'Activo' : 'Dado de baja'}
          </Badge>
          {!vehicle.is_active && vehicle.termination_date && (
            <span className="text-danger-subtle-foreground text-sm">
              Baja el <span className="font-mono">{moment.utc(vehicle.termination_date).format('DD/MM/YYYY')}</span>
              {vehicle.reason_for_termination &&
                ` · ${reasonForTerminationLabels[vehicle.reason_for_termination] ?? vehicle.reason_for_termination}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Franja con los datos de uso del equipo. */
function VehicleFacts({ vehicle, sectorName }: { vehicle: Vehicle; sectorName?: string }) {
  const contractors = vehicle.contractor_equipment.map((ce) => ce.customers?.name).filter(Boolean);
  const facts = [
    {
      label: 'Kilometraje',
      value: vehicle.kilometer ? `${Number(vehicle.kilometer).toLocaleString('es-AR')} km` : 'Sin dato',
      mono: true,
    },
    {
      label: 'Horas de motor',
      value: vehicle.engine_hours ? `${Number(vehicle.engine_hours).toLocaleString('es-AR')} h` : 'Sin dato',
      mono: true,
    },
    { label: 'Sector', value: sectorName || 'Sin dato', mono: false },
    { label: 'Afectado a', value: contractors.length ? contractors.join(', ') : 'Sin afectar', mono: false },
  ];

  return (
    <dl className="bg-card grid grid-cols-2 divide-x divide-y rounded-xl border md:grid-cols-4 md:divide-y-0">
      {facts.map((fact) => (
        <div key={fact.label} className="space-y-1 px-5 py-4">
          <dt className="text-muted-foreground text-sm">{fact.label}</dt>
          <dd className={fact.mono ? 'font-mono text-xl font-semibold tabular-nums' : 'truncate text-lg font-semibold'}>
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Cabecera de la ficha del vehículo (modo lectura): identidad, acciones y datos de uso. */
export function VehicleHeader({ vehicle, sectorName }: { vehicle: VehicleById; sectorName?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (!vehicle) return null;

  const handleEdit = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('action', 'edit');
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="-ml-2">
        <ArrowLeft />
        Volver
      </Button>

      <RecordHeader
        identity={<VehicleIdentity vehicle={vehicle} />}
        actions={
          <>
            <PermissionGuard module="equipos" tab="detalle-equipo" action="update">
              <Button variant="outline" onClick={handleEdit}>
                <Pencil />
                Editar
              </Button>
              <VehicleQuickActions
                condition={vehicle.condition}
                equipmentId={vehicle.id}
                isActive={vehicle.is_active ?? undefined}
              />
            </PermissionGuard>
          </>
        }
      />

      <VehicleFacts vehicle={vehicle} sectorName={sectorName} />
    </div>
  );
}
