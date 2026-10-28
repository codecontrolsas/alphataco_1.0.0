'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { signOutMaintenanceSession } from '@/features/Mantenimiento/actions/maintenance-actions';
import { ActionButton } from '@/features/Mantenimiento/shared/components/action-button';
import { MaintenanceHeader } from '@/features/Mantenimiento/shared/components/maintenance-header';
import { PendingDeviationsAlert } from '@/features/Mantenimiento/shared/components/pending-deviations-alert';
import {
  AlertCircle,
  CheckCircle,
  CircleDot,
  ClipboardList,
  LogOut,
  Truck,
  Wrench,
  Wrench as WrenchIcon,
  XCircle,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

interface EquipmentDashboardClientProps {
  equipment: {
    id: string;
    domain: string | null;
    serie: string | null;
    intern_number: string | null;
    picture: string | null;
    brand: string;
    model: string;
    year: string;
    kilometer: string;
    engine_hours?: string | null;
    condition: string;
    type: string;
    sub_type: string;
    is_active: boolean;
    tire_template_id: string | null;
  };
  equipmentId: string;
  isGuest: boolean;
  isAnonymous: boolean;
  /** Opciones que ofrece la pantalla: las de un módulo apagado para la empresa del equipo no se muestran. */
  options: { request: boolean; checklists: boolean; tireService: boolean };
  employeeName?: string | null;
  employeeCuil?: string | null;
}

export default function EquipmentDashboardClient({
  equipment,
  equipmentId,
  isGuest,
  isAnonymous,
  options,
  employeeName,
  employeeCuil,
}: EquipmentDashboardClientProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await signOutMaintenanceSession();
    router.push('/maintenance/thanks');
  };

  // Configuración de condición
  const conditionConfig: Record<
    string,
    { icon: typeof CheckCircle; label: string; variant: 'success' | 'destructive' | 'secondary' | 'warning' }
  > = {
    operativo: { icon: CheckCircle, label: 'Operativo', variant: 'success' },
    'no operativo': { icon: XCircle, label: 'No Operativo', variant: 'destructive' },
    'en reparacion': { icon: WrenchIcon, label: 'En Reparación', variant: 'secondary' },
    'operativo condicionado': { icon: AlertCircle, label: 'Operativo Condicionado', variant: 'warning' },
    'en preparacion': { icon: WrenchIcon, label: 'En Preparación', variant: 'secondary' },
  };

  const condition = conditionConfig[equipment.condition] || conditionConfig.operativo;
  const ConditionIcon = condition.icon;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <MaintenanceHeader title="Acciones" employeeName={employeeName} employeeCuil={employeeCuil} />

      <main className="flex-1 p-4 space-y-6 pb-24">
        {/* Equipment Info Card */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start gap-4 sm:gap-6">
              {/* Equipment Image */}
              <div className="flex-shrink-0">
                <div className="h-20 w-20 sm:h-28 sm:w-28 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                  {equipment.picture ? (
                    <Image
                      src={equipment.picture}
                      alt={`${equipment.brand} ${equipment.model}`}
                      width={112}
                      height={112}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <Truck className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Equipment Info */}
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate font-mono tracking-tight">
                      {equipment.domain || equipment.serie || 'Sin identificador'}
                    </h1>
                    <p className="text-sm sm:text-base text-muted-foreground mt-0.5">
                      {equipment.brand} {equipment.model} • {equipment.year}
                    </p>
                  </div>
                  <Badge variant={condition.variant} className="shrink-0">
                    <ConditionIcon aria-hidden="true" className="h-3 w-3 mr-1.5" />
                    {condition.label}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Tipo</p>
                    <p className="text-base font-medium">{equipment.type || '-'}</p>
                  </div>
                  {equipment.sub_type && (
                    <div>
                      <p className="text-sm text-muted-foreground">Subtipo</p>
                      <p className="text-base font-medium">{equipment.sub_type}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">N° Interno</p>
                    <p className="text-base font-medium tabular-nums">{equipment.intern_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Kilometraje</p>
                    <p className="text-base font-medium tabular-nums">{equipment.kilometer} km</p>
                  </div>
                  {equipment.engine_hours && (
                    <div>
                      <p className="text-sm text-muted-foreground">Horómetro</p>
                      <p className="text-base font-medium tabular-nums">{equipment.engine_hours} hs</p>
                    </div>
                  )}
                </div>

                {!equipment.is_active && (
                  <div className="pt-2 border-t">
                    <Badge variant="destructive" className="text-xs">
                      Equipo dado de baja
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alerta de desvíos pendientes */}
        <PendingDeviationsAlert equipmentId={equipmentId} />

        {/* Actions */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground px-1">Seleccione una opción</h2>

          <div className="space-y-3">
            {!isGuest && options.request && (
              <ActionButton
                icon={Wrench}
                label="Solicitar Mantenimiento"
                description="Reportar una falla o solicitar reparación"
                variant="default"
                onClick={() => router.push(`/maintenance/equipment/${equipmentId}/request`)}
              />
            )}

            {options.checklists && (
              <ActionButton
                icon={ClipboardList}
                label="Completar Checklist"
                description="Realizar inspección de mantenimiento"
                onClick={() => router.push(`/maintenance/equipment/${equipmentId}/checklists`)}
              />
            )}

            {options.tireService && equipment.tire_template_id && !isAnonymous && (
              <ActionButton
                icon={CircleDot}
                label="Operación de Gomería"
                description="Gestionar cubiertas del equipo"
                onClick={() => router.push(`/maintenance/equipment/${equipmentId}/tire-service`)}
              />
            )}
          </div>
        </div>

        {/* Logout Button */}
        <div className="pt-4">
          <Button type="button" variant="outline" onClick={handleLogout} className="w-full h-12 text-base">
            <LogOut aria-hidden="true" className="h-5 w-5 mr-2" />
            Salir del Sistema
          </Button>
        </div>
      </main>
    </div>
  );
}
