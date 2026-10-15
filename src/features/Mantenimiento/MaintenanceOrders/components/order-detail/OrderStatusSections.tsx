'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { CommentAuthorLine, commentStyleConfig } from '@/features/Mantenimiento/components/ItemComments';
import { RepairItemPhotos } from '@/features/Mantenimiento/shared/components/RepairItemPhotos';
import { getRepairItemImages, getRepairItemLabel } from '@/features/Mantenimiento/shared/repair-item-label';
import { getItemComments } from '@/features/Mantenimiento/utils/driverInfo';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { Clock, HardHat, XCircle } from 'lucide-react';
import moment from 'moment';
import type { MaintenanceOrderData } from '../../actions/queries.server';

/** Ítem rechazado por Operaciones, tal como lo guarda el metadata del log de actividad. */
export interface OpsRejectedItem {
  repair_id: string;
  repair_name: string;
  sector_name: string;
  comment: string;
}

/** Sólo se usa `isPending` y `mutate` de cada mutación: el tipo se deja lo más laxo posible. */
type PendingMutation = { isPending: boolean };

export interface OrderStatusSectionsProps {
  order: MaintenanceOrderData;
  items: MaintenanceOrderData['maintenance_order_items'];
  status: string;
  context: 'workshop' | 'operations';
  operationsNotes: string;
  setOperationsNotes: (value: string) => void;
  opsRejectionComment: string;
  setOpsRejectionComment: (value: string) => void;
  opsRejectedItems: OpsRejectedItem[];
  resetRejectionState: () => void;
  setShowOpsItemRejectDialog: (value: boolean) => void;
  setShowOperationsRejectDialog: (value: boolean) => void;
  operationsValidateMutation: PendingMutation & { mutate: () => void };
  operationsRejectItemsMutation: PendingMutation;
  operationsRejectMutation: PendingMutation;
  handleOpsRejectionMutation: PendingMutation & { mutate: (vars: { agree: boolean; comment?: string }) => void };
}

/**
 * Bloques del detalle que dependen del estado de la orden: validación de Operaciones,
 * rechazo de Operaciones, rechazo del taller e información de cierre.
 *
 * Se extrajeron del diálogo (1.877 líneas) para que cada estado del circuito quede en su
 * propio bloque; el diálogo conserva la cabecera, los ítems, el timeline y los modales.
 */
export function OrderStatusSections({
  order,
  items,
  status,
  context,
  operationsNotes,
  setOperationsNotes,
  opsRejectionComment,
  setOpsRejectionComment,
  opsRejectedItems,
  resetRejectionState,
  setShowOpsItemRejectDialog,
  setShowOperationsRejectDialog,
  operationsValidateMutation,
  operationsRejectItemsMutation,
  operationsRejectMutation,
  handleOpsRejectionMutation,
}: OrderStatusSectionsProps) {
  return (
    <>
            {/* ================================================================ */}
            {/* OPERATIONS VALIDATION                                            */}
            {/* ================================================================ */}
            {status === 'pending_operations_validation' && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Validacion de Operaciones</h4>

                  {order.workshop_validated_at && (
                    <div className="bg-muted p-3 rounded-md text-sm">
                      <div className="font-medium mb-1">Validado por Jefe de Taller</div>
                      <div className="text-xs text-muted-foreground">
                        Fecha: {moment(order.workshop_validated_at).format('DD/MM/YYYY HH:mm')}
                      </div>
                      {order.workshop_validation_notes && (
                        <div className="text-xs mt-1">Notas: {order.workshop_validation_notes}</div>
                      )}
                    </div>
                  )}

                  {context === 'operations' ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Al validar, la orden se cerrara y el equipo volvera a condicion &quot;Operativo&quot;.
                      </p>

                      <Textarea
                        placeholder="Notas de validacion de operaciones (opcional)"
                        value={operationsNotes}
                        onChange={(e) => setOperationsNotes(e.target.value)}
                      />

                      <PermissionGuard module="mantenimiento" tab="seguimiento_taller" action="update">
                        <div className="flex gap-2">
                          <Button
                            onClick={() => operationsValidateMutation.mutate()}
                            disabled={operationsValidateMutation.isPending}
                            className="flex-1"
                          >
                            {operationsValidateMutation.isPending ? 'Validando...' : 'Validar y Cerrar Orden'}
                          </Button>
                          <Button
                            onClick={() => {
                              resetRejectionState();
                              setShowOpsItemRejectDialog(true);
                            }}
                            variant="destructive"
                            disabled={operationsRejectItemsMutation.isPending}
                          >
                            Rechazar Items
                          </Button>
                          <Button
                            onClick={() => setShowOperationsRejectDialog(true)}
                            variant="outline"
                            disabled={operationsRejectMutation.isPending}
                            size="sm"
                          >
                            Rechazar Todo
                          </Button>
                        </div>
                      </PermissionGuard>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Pendiente de validacion por el area de Operaciones.</p>
                  )}
                </div>
              </>
            )}

            {/* ================================================================ */}
            {/* OPERATIONS REJECTED - workshop chief must decide                 */}
            {/* ================================================================ */}
            {status === 'operations_rejected' && context === 'workshop' && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
                    <h4 className="text-sm font-semibold text-destructive flex items-center gap-2 mb-2">
                      <XCircle className="h-4 w-4" />
                      Items Rechazados por Operaciones
                    </h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      Operaciones rechazo los siguientes items. Decide si estas de acuerdo (se envian al operador para
                      correccion) o en desacuerdo (vuelve a operaciones).
                    </p>

                    {opsRejectedItems.length > 0 ? (
                      <div className="space-y-2 mb-4">
                        {opsRejectedItems.map((item, idx) => (
                          <div key={idx} className="bg-background border rounded-md p-2.5 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.repair_name}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {item.sector_name}
                              </Badge>
                            </div>
                            {item.comment && (
                              <p className="text-xs text-muted-foreground mt-1 italic">&quot;{item.comment}&quot;</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mb-4">No se encontraron detalles del rechazo.</p>
                    )}

                    <Textarea
                      placeholder="Comentario (requerido si no estas de acuerdo)"
                      value={opsRejectionComment}
                      onChange={(e) => setOpsRejectionComment(e.target.value)}
                      className="mb-3"
                    />

                    <PermissionGuard module="mantenimiento" tab="ordenes_mantenimiento" action="update">
                      <div className="flex gap-2">
                        <Button
                          onClick={() =>
                            handleOpsRejectionMutation.mutate({
                              agree: true,
                              comment: opsRejectionComment || undefined,
                            })
                          }
                          disabled={handleOpsRejectionMutation.isPending}
                          variant="destructive"
                          className="flex-1"
                        >
                          {handleOpsRejectionMutation.isPending ? 'Procesando...' : 'De acuerdo - Enviar al operador'}
                        </Button>
                        <Button
                          onClick={() =>
                            handleOpsRejectionMutation.mutate({
                              agree: false,
                              comment: opsRejectionComment,
                            })
                          }
                          disabled={handleOpsRejectionMutation.isPending || !opsRejectionComment.trim()}
                          variant="outline"
                        >
                          No estoy de acuerdo
                        </Button>
                      </div>
                    </PermissionGuard>
                  </div>
                </div>
              </>
            )}

            {/* Operations sees their own rejection status */}
            {status === 'operations_rejected' && context === 'operations' && (
              <>
                <Separator />
                <div className="bg-warn-subtle border border-warn/40 rounded-md p-4">
                  <h4 className="text-sm font-semibold text-warn-subtle-foreground flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4" />
                    Pendiente de revision por Jefe de Taller
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Los items rechazados estan siendo revisados por el jefe de taller.
                  </p>
                </div>
              </>
            )}

            {/* ================================================================ */}
            {/* WORKSHOP REJECTED - show rejected items with reasons             */}
            {/* ================================================================ */}
            {status === 'workshop_rejected' && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
                    <h4 className="text-sm font-semibold text-destructive flex items-center gap-2 mb-2">
                      <XCircle className="h-4 w-4" />
                      Items Rechazados por Taller
                    </h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      El jefe de taller rechazo los siguientes items de esta orden.
                    </p>
                    {(() => {
                      const rejectedItems = items.filter((item) => item.is_rejected);
                      if (rejectedItems.length === 0) {
                        return <p className="text-xs text-muted-foreground">No se encontraron detalles del rechazo.</p>;
                      }
                      return (
                        <div className="space-y-3">
                          {rejectedItems.map((item) => {
                            const itemLabel = getRepairItemLabel(item, 'Item sin nombre');
                            const itemImages = getRepairItemImages(item);

                            const sectorName =
                              item.workshop_sectors &&
                              typeof item.workshop_sectors === 'object' &&
                              'name' in item.workshop_sectors
                                ? (item.workshop_sectors.name as string)
                                : null;

                            const itemComments = getItemComments(
                              item,
                              order?.maintenance_requests?.source,
                              order?.maintenance_requests?.profile_maintenance_requests_supervisor_idToprofile?.fullname
                            );

                            // Get rejected_by profile name
                            const rejectedByProfile = (item as Record<string, unknown>)?.rejected_by_profile as {
                              fullname?: string | null;
                            } | null;
                            const rejectedByName = rejectedByProfile?.fullname || null;

                            return (
                              <div key={item.id} className="bg-background border rounded-md p-3 text-sm space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{itemLabel}</span>
                                  {sectorName && (
                                    <Badge variant="outline" className="text-[10px]">
                                      {sectorName}
                                    </Badge>
                                  )}
                                </div>

                                <RepairItemPhotos images={itemImages} label={itemLabel} size="sm" />

                                {itemComments.length > 0 && (
                                  <div className="space-y-1">
                                    {itemComments.map((comment, cidx) => {
                                      const cfg = commentStyleConfig[comment.style];
                                      return (
                                        <div
                                          key={cidx}
                                          className={`text-xs p-2 rounded border ${cfg.container} ${cfg.border}`}
                                        >
                                          <CommentAuthorLine comment={comment} size="xs" />
                                          <span
                                            className={`mt-0.5 block ${comment.style !== 'description' ? 'italic' : ''}`}
                                          >
                                            {comment.text}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {item.rejection_reason && (
                                  <div className="bg-destructive/5 border border-destructive/10 rounded px-2.5 py-2 text-xs space-y-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-medium text-destructive">Motivo del rechazo:</span>
                                    </div>
                                    {rejectedByName && (
                                      <div className="flex items-center gap-1.5">
                                        <HardHat className="h-3 w-3 shrink-0 text-destructive" />
                                        <span className="font-semibold text-destructive">{rejectedByName}</span>
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] px-1 py-0 border-destructive/30 text-destructive"
                                        >
                                          Jefe de Taller
                                        </Badge>
                                      </div>
                                    )}
                                    <p className="italic">{item.rejection_reason}</p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}

            {/* ================================================================ */}
            {/* COMPLETED - basic validation info                                */}
            {/* ================================================================ */}
            {status === 'completed' && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Informacion de Cierre</h4>

                  {order.workshop_validated_at && (
                    <div className="bg-muted p-3 rounded-md text-sm">
                      <div className="font-medium mb-1">Validado por Jefe de Taller</div>
                      <div className="text-xs text-muted-foreground">
                        Fecha: {moment(order.workshop_validated_at).format('DD/MM/YYYY HH:mm')}
                      </div>
                      {order.workshop_validation_notes && (
                        <div className="text-xs mt-1">Notas: {order.workshop_validation_notes}</div>
                      )}
                    </div>
                  )}

                  {order.operations_validated_at && (
                    <div className="bg-muted p-3 rounded-md text-sm">
                      <div className="font-medium mb-1">Validado por Operaciones</div>
                      <div className="text-xs text-muted-foreground">
                        Fecha: {moment(order.operations_validated_at).format('DD/MM/YYYY HH:mm')}
                      </div>
                      {order.operations_validation_notes && (
                        <div className="text-xs mt-1">Notas: {order.operations_validation_notes}</div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
    </>
  );
}
