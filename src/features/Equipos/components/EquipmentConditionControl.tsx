'use client';

import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { updateEquipmentCondition } from '@/features/Equipos/EquipoID/lib/actions/vehicle-actions';
import { conditionIcons, conditionVariants } from '@/features/Equipos/Equipos/VehicleList/columns';
import { PermissionGuard } from '@/features/Permissions';
import { condition_enum } from '@/generated/prisma/enums';
import { conditionLabels } from '@/shared/utils/mappers';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface EquipmentConditionControlProps {
  equipmentId: string;
  condition: condition_enum | null;
  /** Tabla del equipo: la acción de condición es la misma para vehículos y equipamiento. */
  table: 'vehicles' | 'other_equipment';
  /** Tab de permisos que habilita el cambio (`detalle-equipo` o `detalle-otro-equipo`). */
  permissionTab: 'detalle-equipo' | 'detalle-otro-equipo';
}

/**
 * Condición del equipo. Solo `en preparación` se puede cambiar a mano (a operativo): el resto de
 * las condiciones las mueve el circuito de mantenimiento, así que ahí es solo un indicador.
 */
export function EquipmentConditionControl({
  equipmentId,
  condition,
  table,
  permissionTab,
}: EquipmentConditionControlProps) {
  const router = useRouter();
  const [isChanging, setIsChanging] = useState(false);
  if (!condition) return null;

  const Icon = conditionIcons[condition];
  const pill = (
    <Badge variant={conditionVariants[condition] ?? 'default'}>
      {Icon && <Icon />}
      {conditionLabels[condition] ?? condition}
    </Badge>
  );

  if (condition !== condition_enum.en_preparacion) return pill;

  const markOperative = async () => {
    setIsChanging(true);
    try {
      await updateEquipmentCondition(equipmentId, 'operativo', table);
      toast.success('Equipo actualizado a Operativo');
      router.refresh();
    } catch {
      toast.error('Error al actualizar la condición');
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <PermissionGuard module="equipos" tab={permissionTab} action="update" fallback={pill}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isChanging}
            aria-label="Cambiar la condición del equipo"
            className="focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-[3px]"
          >
            {pill}
            <ChevronDown className="text-muted-foreground size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={markOperative}>
            <CheckCircle2 className="text-ok" />
            Marcar como operativo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </PermissionGuard>
  );
}
