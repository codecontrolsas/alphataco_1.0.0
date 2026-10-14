'use client';

import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getConditionChangeAvailability,
  updateEquipmentCondition,
} from '@/features/Equipos/EquipoID/lib/actions/vehicle-actions';
import { invalidateVehicleLists } from '@/features/Equipos/EquipoID/lib/invalidate-vehicle-lists';
import { REACTIVATION_TARGET_CONDITIONS } from '@/features/Equipos/EquipoID/lib/vehicle-status';
import { conditionIcons, conditionVariants } from '@/features/Equipos/Equipos/VehicleList/columns';
import { PermissionGuard } from '@/features/Permissions';
import { condition_enum } from '@/generated/prisma/enums';
import { conditionLabels } from '@/shared/utils/mappers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
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
 * Condición del equipo. Se cambia a mano desde `en preparación` (a operativo) y desde `no operativo`
 * (reactivación) cuando no hay mantenimiento pendiente; el resto lo mueve el circuito de mantenimiento,
 * así que ahí es solo un indicador.
 */
export function EquipmentConditionControl({
  equipmentId,
  condition,
  table,
  permissionTab,
}: EquipmentConditionControlProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isChanging, setIsChanging] = useState(false);
  if (!condition) return null;

  const Icon = conditionIcons[condition];
  const pill = (
    <Badge variant={conditionVariants[condition] ?? 'default'}>
      {Icon && <Icon />}
      {conditionLabels[condition] ?? condition}
    </Badge>
  );

  const changeCondition = async (target: condition_enum) => {
    setIsChanging(true);
    try {
      const result = await updateEquipmentCondition(equipmentId, target, table);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`Equipo actualizado a ${conditionLabels[target] ?? target}`);
      invalidateVehicleLists(queryClient);
      queryClient.invalidateQueries({ queryKey: ['other-equipment-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['inactive-other-equipment-list'] });
      queryClient.invalidateQueries({ queryKey: ['condition-change-availability', table, equipmentId] });
      router.refresh();
    } catch {
      toast.error('Error al actualizar la condición');
    } finally {
      setIsChanging(false);
    }
  };

  if (condition === condition_enum.no_operativo) {
    return (
      <PermissionGuard module="equipos" tab={permissionTab} action="update" fallback={pill}>
        <ReactivationControl
          table={table}
          equipmentId={equipmentId}
          pill={pill}
          isChanging={isChanging}
          onChange={changeCondition}
        />
      </PermissionGuard>
    );
  }

  if (condition !== condition_enum.en_preparacion) return pill;

  const markOperative = () => changeCondition(condition_enum.operativo);

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

interface ReactivationControlProps {
  table: 'vehicles' | 'other_equipment';
  equipmentId: string;
  pill: ReactNode;
  isChanging: boolean;
  onChange: (target: condition_enum) => void;
}

/** Reactivación de un equipo `no operativo`: se bloquea con el motivo si tiene mantenimiento pendiente. */
function ReactivationControl({ table, equipmentId, pill, isChanging, onChange }: ReactivationControlProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['condition-change-availability', table, equipmentId],
    queryFn: () => getConditionChangeAvailability(table, equipmentId),
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1" role="status" aria-label="Verificando mantenimiento pendiente">
        {pill}
        <Loader2 className="text-muted-foreground size-4 animate-spin" />
      </span>
    );
  }

  // Sin respuesta o con pendientes: solo indicador, con el motivo accesible.
  if (isError || !data?.canChange) {
    const reason = isError ? 'No se pudo verificar si el equipo tiene mantenimiento pendiente' : data?.reason;
    if (!reason) return pill;
    return (
      <span title={`No se puede cambiar la condición. ${reason}`} className="inline-flex flex-col gap-0.5">
        {pill}
        <span className="text-muted-foreground max-w-xs text-xs">{reason}</span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isChanging}
          aria-label="Reactivar el equipo: cambiar la condición"
          className="focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-[3px]"
        >
          {pill}
          {isChanging ? (
            <Loader2 className="text-muted-foreground size-4 animate-spin" />
          ) : (
            <ChevronDown className="text-muted-foreground size-4" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {REACTIVATION_TARGET_CONDITIONS.map((target) => (
          <DropdownMenuItem key={target} onClick={() => onChange(target)}>
            <CheckCircle2 className="text-ok" />
            Marcar como {(conditionLabels[target] ?? target).toLowerCase()}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
