'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MaintenanceStatusPill } from '@/features/Mantenimiento/shared/components/MaintenanceStatusPill';
import type { ManualRepair } from '@/features/Mantenimiento/shared/components/ManualRepairsInput';
import {
  PREVENTIVE_TYPES,
  PREVENTIVE_TYPE_DESCRIPTIONS,
  PREVENTIVE_TYPE_ICONS,
  type PreventiveType,
} from '@/features/Mantenimiento/shared/preventive-maintenance';
import { cn } from '@/lib/utils';
import { conditionLabels } from '@/shared/utils/mappers';
import { CheckCircle, User, Wrench } from 'lucide-react';
import type { CurrentUserForSupervisorCheck } from '../../actions/queries.server';
import type { RequestType, ResourceOption, SelectedDeviation, SupervisorOption } from './types';

export interface StepConfirmProps {
  currentUser: CurrentUserForSupervisorCheck | undefined;
  driverFileNumber?: string | null;
  driverName?: string | null;
  engineHours: string;
  isCurrentUserSupervisor: boolean | null;
  isOtherEquipment: boolean;
  kilometer: string;
  manualRepairs: ManualRepair[];
  preventiveDescription: string;
  requestType: RequestType;
  selectedDeviations: SelectedDeviation[];
  selectedEquipment: ResourceOption | undefined;
  selectedPreventiveType: PreventiveType | '';
  selectedSupervisor: SupervisorOption | undefined;
}

/** Paso "Confirmar": resumen de lo que se va a crear antes de enviar. */
export function StepConfirm({
  currentUser,
  driverFileNumber,
  driverName,
  engineHours,
  isCurrentUserSupervisor,
  isOtherEquipment,
  kilometer,
  manualRepairs,
  preventiveDescription,
  requestType,
  selectedDeviations,
  selectedEquipment,
  selectedPreventiveType,
  selectedSupervisor,
}: StepConfirmProps) {
      // Determinar el supervisor para mostrar en el resumen
    const supervisorToShow = isCurrentUserSupervisor
      ? { fullName: currentUser?.fullname, email: currentUser?.email }
      : selectedSupervisor;

    return (
      <div className="space-y-4">
        <div
          className={cn(
            'rounded-lg border p-4',
            isCurrentUserSupervisor
              ? 'border-ok/30 bg-ok-subtle text-ok-subtle-foreground'
              : 'border-info/30 bg-info-subtle text-info-subtle-foreground'
          )}
        >
          <div className="mb-2 flex items-center gap-2 font-medium">
            <CheckCircle aria-hidden="true" className="h-5 w-5" />
            {isCurrentUserSupervisor ? 'Resumen del Pedido' : 'Resumen de la Solicitud'}
          </div>
          <p className="text-sm">
            {isCurrentUserSupervisor
              ? 'Verifica la información antes de crear el pedido de mantenimiento.'
              : 'Verifica la información antes de enviar la solicitud al supervisor.'}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{isOtherEquipment ? 'Equipamiento' : 'Equipo'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{selectedEquipment?.label}</p>
            <p className="text-sm text-muted-foreground">
              {[selectedEquipment?.typeName, selectedEquipment?.subTypeName].filter(Boolean).join(' · ')}
            </p>
            {!isOtherEquipment && kilometer && <p className="text-sm tabular-nums">Kilometraje: {kilometer} km</p>}
            {engineHours && <p className="text-sm tabular-nums">Horómetro: {engineHours} hs</p>}
            {driverName && (
              <div className="flex items-center gap-2 mt-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Chofer:</span>
                {driverFileNumber && (
                  <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{driverFileNumber}</span>
                )}
                <span className="font-medium">{driverName}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {requestType === 'preventive' ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tipo de mantenimiento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <Wrench className="h-3 w-3" />
                  Mantenimiento Preventivo
                </Badge>
              </div>
              {selectedPreventiveType && (
                <Card className="mt-2">
                  <CardContent className="p-3 flex items-center gap-3">
                    {(() => {
                      const Icon = PREVENTIVE_TYPE_ICONS[selectedPreventiveType as PreventiveType];
                      return <Icon className="h-6 w-6 text-muted-foreground" />;
                    })()}
                    <div>
                      <p className="font-medium text-sm">
                        {PREVENTIVE_TYPES[selectedPreventiveType as PreventiveType]}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {PREVENTIVE_TYPE_DESCRIPTIONS[selectedPreventiveType as PreventiveType]}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {preventiveDescription.trim() && (
                <div className="space-y-1 pt-1">
                  <p className="text-xs font-medium text-muted-foreground">Descripción</p>
                  <p className="text-sm whitespace-pre-line">{preventiveDescription.trim()}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : requestType === 'manual' ? (
          /* Carga manual: no hay desvíos de checklist, lo que se confirma son las
             reparaciones que escribió el supervisor. */
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Reparaciones ({manualRepairs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {manualRepairs.map((repair) => {
                  return (
                    <li key={repair.localId} className="text-sm flex items-start gap-2">
                      <span aria-hidden="true" className="text-muted-foreground">•</span>
                      <div>
                        <span className="font-medium">{repair.freeText}</span>
                        {repair.images.length > 0 && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {repair.images.length} {repair.images.length === 1 ? 'foto' : 'fotos'}
                          </Badge>
                        )}
                        {repair.description.trim() && (
                          <p className="text-sm text-muted-foreground mt-1 italic">
                            &quot;{repair.description.trim()}&quot;
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Items con Desvío ({selectedDeviations.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {selectedDeviations.map((d) => (
                  <li key={d.itemId} className="text-sm flex items-start gap-2">
                    <span aria-hidden="true" className="text-muted-foreground">•</span>
                    <div>
                      <span className="font-medium">{d.itemLabel}</span>
                      {d.isCritical && (
                        <Badge variant="destructive" className="ml-2 text-xs">
                          Crítico
                        </Badge>
                      )}
                      {d.comment && (
                        <p className="text-sm text-muted-foreground mt-1 italic">&quot;{d.comment}&quot;</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Supervisor {isCurrentUserSupervisor ? '(Tú)' : 'Asignado'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{supervisorToShow?.fullName}</p>
            <p className="text-sm text-muted-foreground">{supervisorToShow?.email}</p>
            {isCurrentUserSupervisor && (
              <Badge variant="success" className="mt-2">
                Supervisor del pedido
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Estado inicial según el flujo: sin N° de orden, que se asigna recién al ingresar a taller */}
        <div className="rounded-lg bg-muted p-3">
          <p className="text-sm font-medium">
            {isCurrentUserSupervisor ? 'Estado inicial del pedido' : 'Estado inicial de la solicitud'}
          </p>
          <div className="mt-1">
            {isCurrentUserSupervisor ? (
              <MaintenanceStatusPill entity="order" status="pending_scheduling" />
            ) : (
              <MaintenanceStatusPill entity="request" status="pending_approval" />
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {isCurrentUserSupervisor
              ? 'El pedido aparecerá en "Pedidos de Mantenimiento" → "Pendientes" para asignarle fecha.'
              : 'La solicitud aparecerá en "Pendientes de Validar" para que el supervisor la apruebe.'}
          </p>
        </div>
      </div>
    );
}
