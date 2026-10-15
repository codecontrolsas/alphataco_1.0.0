'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { OtherEquipmentDetail } from '@/features/Equipos/OtherEquipment/actions/actionsServer';
import { EquipmentConditionControl } from '@/features/Equipos/components/EquipmentConditionControl';
import { EquipmentStatusActions } from '@/features/Equipos/components/EquipmentStatusActions';
import { PermissionGuard } from '@/features/Permissions';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { terminationReasonEquipmentLabels } from '@/shared/utils/mappers';
import { Package, Pencil } from 'lucide-react';
import moment from 'moment';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

function EquipmentIdentity({ equipment }: { equipment: OtherEquipmentDetail }) {
  const name = [equipment.brand_vehicles?.name, equipment.model_vehicles?.name].filter(Boolean).join(' ');
  const identifier = equipment.serial_number || equipment.intern_number;
  const details = [
    [equipment.type?.name, equipment.sub_type?.name].filter(Boolean).join(' / '),
    equipment.year,
    equipment.serial_number ? equipment.intern_number : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const picture = equipment.pictures?.[0];

  return (
    <div className="flex min-w-0 items-center gap-5">
      <div className="bg-muted flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl">
        {picture ? (
          <img src={picture} alt={name || 'Equipo'} className="size-full object-cover" />
        ) : (
          <Package className="text-muted-foreground size-8" aria-hidden />
        )}
      </div>

      <div className="min-w-0 space-y-1.5">
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {identifier && (
            <span className="border-foreground bg-card rounded-md border-2 px-2.5 font-mono text-xl font-semibold tracking-wider">
              {identifier}
            </span>
          )}
          <span className="text-xl font-semibold tracking-tight">{name || 'Equipo sin marca'}</span>
        </h1>
        <p className="text-muted-foreground">{details}</p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <EquipmentConditionControl
            equipmentId={equipment.id}
            condition={equipment.condition}
            table="other_equipment"
            permissionTab="detalle-otro-equipo"
          />
          <Badge variant={equipment.is_active ? 'success' : 'destructive'}>
            {equipment.is_active ? 'Activo' : 'Dado de baja'}
          </Badge>
          {!equipment.is_active && equipment.termination_date && (
            <span className="text-danger-subtle-foreground text-sm">
              Baja el <span className="font-mono">{moment.utc(equipment.termination_date).format('DD/MM/YYYY')}</span>
              {equipment.reason_for_termination &&
                ` · ${terminationReasonEquipmentLabels[equipment.reason_for_termination] ?? equipment.reason_for_termination}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Franja con los datos de uso del equipo. */
function EquipmentFacts({ equipment }: { equipment: OtherEquipmentDetail }) {
  const contractors = equipment.contractor_other_equipment.map((rel) => rel.customers.name).filter(Boolean);
  const facts = [
    {
      label: 'Horómetro',
      value: equipment.horometer != null ? `${equipment.horometer.toLocaleString('es-AR')} h` : 'Sin dato',
      mono: true,
    },
    { label: 'Sector', value: equipment.hierarchy?.name || 'Sin dato', mono: false },
    { label: 'Afectado a', value: contractors.length ? contractors.join(', ') : 'Sin afectar', mono: false },
    {
      label: 'Vehículo vinculado',
      value: equipment.vehicles?.domain || 'Sin vincular',
      mono: !!equipment.vehicles?.domain,
    },
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

/** Cabecera de la ficha del equipamiento (modo lectura): identidad, acciones y datos de uso. */
export function OtherEquipmentHeader({ equipment }: { equipment: OtherEquipmentDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleEdit = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('action', 'edit');
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <RecordHeader
        identity={<EquipmentIdentity equipment={equipment} />}
        actions={
          <PermissionGuard module="equipos" tab="detalle-otro-equipo" action="update">
            <Button variant="outline" onClick={handleEdit}>
              <Pencil />
              Editar
            </Button>
            <EquipmentStatusActions kind="other" equipmentId={equipment.id} isActive={equipment.is_active ?? false} />
          </PermissionGuard>
        }
      />

      <EquipmentFacts equipment={equipment} />
    </div>
  );
}
