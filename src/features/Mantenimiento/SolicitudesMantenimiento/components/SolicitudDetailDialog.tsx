'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ItemComments } from '@/features/Mantenimiento/components/ItemComments';
import { isNonPropagatingChecklistItem } from '@/features/Mantenimiento/constants/non-propagating-checklist-items';
import { MaintenanceStatusPill } from '@/features/Mantenimiento/shared/components/MaintenanceStatusPill';
import { RepairGroupBadge } from '@/features/Mantenimiento/shared/components/RepairGroupBadge';
import { PREVENTIVE_TYPES, type PreventiveType } from '@/features/Mantenimiento/shared/preventive-maintenance';
import { formatDateTime } from '@/features/Mantenimiento/utils/dateFormat';
import { resolveDriverInfo } from '@/features/Mantenimiento/utils/driverInfo';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { RepairItemPhotos } from '../../shared/components/RepairItemPhotos';
import { getRepairItemGroupName, getRepairItemImages, getRepairItemLabel } from '../../shared/repair-item-label';
import { getResourceInternNumber, getResourceLabel } from '../../shared/maintenance-resource';
import type { MaintenanceRequestData } from '../actions/queries.server';

interface SolicitudDetailDialogProps {
  request: MaintenanceRequestData;
  open: boolean;
  onClose: () => void;
}

// Función para formatear el código de sección (sistema_electrico -> Sistema Electrico)
const formatSectionCode = (code: string | null | undefined): string => {
  if (!code) return '-';
  return code
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export function SolicitudDetailDialog({ request, open, onClose }: SolicitudDetailDialogProps) {
  const itemStatusConfig: Record<string, { label: string; variant: 'secondary' | 'success' | 'destructive' }> = {
    pending: { label: 'Pendiente', variant: 'secondary' },
    approved: { label: 'Aprobado', variant: 'success' },
    rejected: { label: 'Rechazado', variant: 'destructive' },
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle de Solicitud de Mantenimiento</DialogTitle>
          <DialogDescription>Solicitud creada el {formatDateTime(request.created_at)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Información general */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Información General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">Equipo:</span>
                  <p className="font-medium">
                    {getResourceLabel(request)}
                    {getResourceInternNumber(request) && ` (#${getResourceInternNumber(request)})`}
                    {request.other_equipment && <span className="text-muted-foreground text-sm font-normal"> · Equipamiento</span>}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Estado:</span>
                  <div className="mt-1">
                    <MaintenanceStatusPill entity="request" status={request.status} />
                  </div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Chofer:</span>
                  {(() => {
                    const driver = resolveDriverInfo(request);
                    return (
                      <div className="flex items-center gap-2">
                        {driver.fileNumber && (
                          <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{driver.fileNumber}</span>
                        )}
                        <p className="font-medium">{driver.name}</p>
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Creado por:</span>
                  <p className="font-medium">{request.profile_user?.fullname || 'No especificado'}</p>
                </div>
                {request.kilometer && (
                  <div>
                    <span className="text-sm text-muted-foreground">Kilometraje:</span>
                    <p className="font-medium">{request.kilometer} km</p>
                  </div>
                )}
                {request.engine_hours && (
                  <div>
                    <span className="text-sm text-muted-foreground">Horómetro:</span>
                    <p className="font-medium">{request.engine_hours} hs</p>
                  </div>
                )}
                {request.description && (
                  <div className="col-span-2">
                    <span className="text-sm text-muted-foreground">Descripción:</span>
                    <p className="font-medium whitespace-pre-wrap break-words">{request.description}</p>
                  </div>
                )}
              </div>

              {request.status === 'rejected' && request.rejection_reason && (
                <div className="mt-4 rounded-md bg-danger-subtle p-3 text-danger-subtle-foreground">
                  <span className="text-sm font-medium">Motivo de rechazo:</span>
                  <p className="text-sm">{request.rejection_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Tipo de mantenimiento (solo preventivo) */}
          {request.source === 'preventive' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tipo de Mantenimiento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium text-sm">Mantenimiento Preventivo</h4>
                  <Badge variant="secondary">
                    {PREVENTIVE_TYPES[request.preventive_type as PreventiveType] ??
                      request.preventive_type ??
                      'Preventivo'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Items (desvíos / necesidades) — siempre que existan */}
          {request.maintenance_request_items && request.maintenance_request_items.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {request.source === 'preventive' ? 'Necesidades' : 'Desvíos'} (
                  {request.maintenance_request_items.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {request.maintenance_request_items.map((item) => {
                    const templateId =
                      (
                        item.checklist_deviations as {
                          checklist_answers?: { template_id?: string | null } | null;
                        } | null
                      )?.checklist_answers?.template_id ?? null;
                    const itemCode = item.checklist_deviations?.item_code ?? null;
                    const isNonPropagating = isNonPropagatingChecklistItem(templateId, itemCode);
                    const isCritical = item.checklist_deviations?.is_critical ?? false;

                    // Card "Solo informativo" — sin badge de estado, banner explícito.
                    if (isNonPropagating) {
                      return (
                        <div
                          key={item.id}
                          className="overflow-hidden rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30"
                        >
                          <div className="flex items-center gap-2 border-b border-muted-foreground/20 bg-muted/60 px-3 py-1.5">
                            <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
                            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              No requiere decisión — no viaja a taller
                            </p>
                          </div>
                          <div className="space-y-1.5 p-3">
                            <div className="flex items-start gap-2">
                              {isCritical ? (
                                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/60" aria-hidden />
                              ) : (
                                <AlertTriangle
                                  className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/60"
                                  aria-hidden
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-muted-foreground">
                                  {getRepairItemLabel(item, 'Sin título')}
                                </p>
                                <RepairGroupBadge groupName={getRepairItemGroupName(item)} className="mt-1" />
                                {item.checklist_deviations?.section_code && (
                                  <p className="text-sm text-muted-foreground/80">
                                    Sección: {formatSectionCode(item.checklist_deviations.section_code)}
                                  </p>
                                )}
                                <RepairItemPhotos
                                  images={getRepairItemImages(item)}
                                  label={getRepairItemLabel(item)}
                                  size="sm"
                                  className="mt-2"
                                />
                              </div>
                            </div>
                            <ItemComments
                              item={{ maintenance_request_items: item }}
                              source={request.source}
                              fallbackAuthorName={request.profile_maintenance_requests_supervisor_idToprofile?.fullname}
                            />
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={item.id} className="p-3 border rounded-lg space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">{getRepairItemLabel(item, 'Sin título')}</p>
                            {item.checklist_deviations?.section_code && (
                              <p className="text-sm text-muted-foreground">
                                Sección: {formatSectionCode(item.checklist_deviations.section_code)}
                              </p>
                            )}
                            <RepairItemPhotos
                              images={getRepairItemImages(item)}
                              label={getRepairItemLabel(item)}
                              size="sm"
                              className="mt-2"
                            />
                          </div>
                          <Badge variant={itemStatusConfig[item.status]?.variant || 'secondary'}>
                            {itemStatusConfig[item.status]?.label || item.status}
                          </Badge>
                        </div>

                        {item.types_of_repairs && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Tipo de reparación: </span>
                            <Badge variant="secondary">{item.types_of_repairs.name}</Badge>
                          </div>
                        )}

                        <ItemComments
                          item={{ maintenance_request_items: item }}
                          source={request.source}
                          fallbackAuthorName={request.profile_maintenance_requests_supervisor_idToprofile?.fullname}
                        />

                        {item.status === 'rejected' && item.rejection_reason && (
                          <div className="rounded bg-danger-subtle p-2 text-sm text-danger-subtle-foreground">
                            <span className="font-medium">Motivo: </span>
                            <span>{item.rejection_reason}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
