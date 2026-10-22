'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ItemComments } from '@/features/Mantenimiento/components/ItemComments';
import { RepairGroupBadge } from '@/features/Mantenimiento/shared/components/RepairGroupBadge';
import { RepairItemPhotos } from '@/features/Mantenimiento/shared/components/RepairItemPhotos';
import { PREVENTIVE_TYPES, type PreventiveType } from '@/features/Mantenimiento/shared/preventive-maintenance';
import { getRepairItemGroupName, getRepairItemImages } from '@/features/Mantenimiento/shared/repair-item-label';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { AlertTriangle, Ban, MessageSquare, Pencil, Plus, RotateCcw, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import type { OrderManagementItem } from '../../actions/queries.server';
import { AddItemInlineForm } from '../AddItemInlineForm';
import type { LocalItem } from '../ManageOrderWizard';
import { getItemLabel } from './helpers';

interface Step1TasksProps {
  order: OrderManagementItem;
  localItems: LocalItem[];
  repairTypes: Array<{ id: string; name: string }>;
  onAddItem: (description: string, repairTypeIds: string[]) => void;
  onDeleteItem: (itemId: string) => void;
  onRejectItem?: (itemId: string, reason: string) => void;
  onRestoreItem?: (itemId: string) => void;
  onEditRepairTypes: (item: LocalItem) => void;
  onChiefCommentChange: (itemId: string, comment: string) => void;
}

export function Step1Tasks({
  order,
  localItems,
  repairTypes,
  onAddItem,
  onDeleteItem,
  onRejectItem,
  onRestoreItem,
  onEditRepairTypes,
  onChiefCommentChange,
}: Step1TasksProps) {
  const [editingCommentItemId, setEditingCommentItemId] = useState<string | null>(null);
  const [rejectDialogItemId, setRejectDialogItemId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [addFormOpen, setAddFormOpen] = useState(false);

  const regularItems = localItems.filter((item) => !item.is_diagnostico && !item._deleted && !item._rejected);
  const rejectedItems = localItems.filter((item) => !item.is_diagnostico && !item._deleted && item._rejected);

  // Items sin repair type asignado
  const itemsWithoutRepairType = regularItems.filter((item) => {
    if (item._isTemp && item._tempRepairTypeIds) {
      return item._tempRepairTypeIds.length === 0;
    }
    const pivotTypes = item.maintenance_order_item_repair_types || [];
    return pivotTypes.length === 0 && !item.types_of_repairs;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium">Desvíos de reparación ({regularItems.length})</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Revise y ajuste los desvíos. Cada uno debe tener al menos un tipo de reparación.
          </p>
        </div>
        <PermissionGuard module="mantenimiento" tab="gestion_ordenes" action="create">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={addFormOpen}
            aria-controls="add-item-inline"
            onClick={() => setAddFormOpen((prev) => !prev)}
          >
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
            Agregar reparación
          </Button>
        </PermissionGuard>
      </div>

      {/* Agregar ítem inline: sin modal encima del wizard */}
      {addFormOpen && (
        <PermissionGuard module="mantenimiento" tab="gestion_ordenes" action="create">
          <section id="add-item-inline" aria-label="Agregar reparación" className="rounded-lg border bg-muted/20 p-4">
            <h4 className="mb-3 text-sm font-medium">Agregar reparación</h4>
            <AddItemInlineForm repairTypes={repairTypes} onAdd={onAddItem} onClose={() => setAddFormOpen(false)} />
          </section>
        </PermissionGuard>
      )}

      {/* Warning: items sin repair type */}
      {itemsWithoutRepairType.length > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-warn-subtle border border-warn/30 text-warn-subtle-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs">
            {itemsWithoutRepairType.length} desvío(s) sin tipo de reparación asignado. Asigne al menos uno para
            continuar.
          </span>
        </div>
      )}

      {/* Items list */}
      {regularItems.length === 0 && order.source === 'preventive' ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center space-y-2">
            <Wrench className="h-8 w-8 mx-auto text-muted-foreground" />
            <h4 className="font-medium">Mantenimiento Preventivo</h4>
            <Badge variant="secondary">
              {PREVENTIVE_TYPES[order.preventive_type as PreventiveType] ?? order.preventive_type ?? 'Preventivo'}
            </Badge>
            <p className="text-sm text-muted-foreground">
              Este pedido es de mantenimiento preventivo. Puede agregar ítems manualmente si es necesario.
            </p>
          </CardContent>
        </Card>
      ) : regularItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No hay desvíos en este pedido</p>
      ) : (
        <div className="space-y-2">
          {regularItems.map((item) => {
            let repairTypeNames: string[] = [];
            let hasAutorizable = false;

            if (item._isTemp && item._tempRepairTypeIds) {
              repairTypeNames = item._tempRepairTypeIds
                .map((id) => repairTypes.find((rt) => rt.id === id)?.name)
                .filter((name): name is string => !!name);
            } else {
              const pivotRepairTypes = item.maintenance_order_item_repair_types || [];
              repairTypeNames =
                pivotRepairTypes.length > 0
                  ? pivotRepairTypes.map((rt) => rt.types_of_repairs?.name).filter((name): name is string => !!name)
                  : item.types_of_repairs?.name
                    ? [String(item.types_of_repairs.name)]
                    : [];
              hasAutorizable =
                pivotRepairTypes.some((rt) => rt.types_of_repairs?.autorizable) || !!item.types_of_repairs?.autorizable;
            }

            const deviation = item.maintenance_request_items?.checklist_deviations;
            const canDelete = item._isTemp || !item.maintenance_request_item_id;
            const hasWorkOrder = !!item.work_order_id;
            const isEditingComment = editingCommentItemId === item.id;
            const hasChiefComment = !!item.workshop_chief_comment;
            const itemLabel = getItemLabel(item);
            const itemImages = getRepairItemImages(item);
            const groupName = getRepairItemGroupName(item);

            return (
              <div
                key={item.id}
                className={`group relative flex flex-col p-3 border rounded-lg transition-colors hover:bg-muted/30 ${
                  item._isTemp
                    ? 'border-dashed border-info/30 bg-info-subtle/30'
                    : hasWorkOrder
                      ? 'border-l-4 border-l-emerald-500'
                      : repairTypeNames.length === 0
                        ? 'border-l-4 border-l-amber-400'
                        : 'border-l-4 border-l-primary/40'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    {/* Status + Repair type badges */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item._isTemp && (
                        <Badge variant="outline" className="text-[10px] text-info border-info/30 px-1.5 py-0">
                          Nuevo
                        </Badge>
                      )}
                      {hasWorkOrder && (
                        <Badge variant="success" className="text-xs px-2 py-0.5">
                          OT generada
                        </Badge>
                      )}
                      {repairTypeNames.length > 0 ? (
                        repairTypeNames.map((name, idx) => (
                          <Badge key={idx} variant="default" className="text-xs px-2 py-0.5">
                            {name}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="secondary" className="text-xs px-2 py-0.5">
                          Sin tipo asignado
                        </Badge>
                      )}
                      {hasAutorizable && (
                        <Badge variant="warning" className="text-xs px-2 py-0.5">
                          Autorizable
                        </Badge>
                      )}
                      {/* Grupo de origen: al expandir un grupo entran varias
                          reparaciones juntas y hay que poder distinguirlas */}
                      <RepairGroupBadge groupName={groupName} />
                    </div>
                    {/* Description - READ ONLY */}
                    {itemLabel && <p className="text-sm text-foreground">{itemLabel}</p>}
                    {/* Deviation info */}
                    {deviation && (
                      <p className="text-xs text-muted-foreground/80 italic">
                        Desvio: {String(deviation.item_label || deviation.item_code)}
                      </p>
                    )}
                    {/* Fotos que cargo el supervisor: son el contexto para decidir
                        el tipo de reparacion y, en el paso siguiente, el sector */}
                    {itemImages.length > 0 && (
                      <RepairItemPhotos images={itemImages} label={itemLabel} size="sm" className="pt-0.5" />
                    )}
                    {/* Comments with attribution */}
                    <ItemComments
                      item={item}
                      source={order.maintenance_requests?.source}
                      fallbackAuthorName={order.maintenance_requests?.supervisor_name}
                    />
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1.5 ml-3 shrink-0">
                    {!item._isTemp && !hasWorkOrder && (
                      <PermissionGuard module="mantenimiento" tab="gestion_ordenes" action="update">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => onEditRepairTypes(item)}
                        >
                          <Wrench className="h-3 w-3 mr-1" />
                          Asignar tarea
                        </Button>
                      </PermissionGuard>
                    )}
                    {!canDelete && !hasWorkOrder && !item._rejected && onRejectItem && (
                      <PermissionGuard module="mantenimiento" tab="gestion_ordenes" action="update">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive/60 hover:text-destructive"
                          onClick={() => {
                            setRejectDialogItemId(item.id);
                            setRejectionReason('');
                          }}
                          title="Rechazar item"
                        >
                          <Ban className="h-3 w-3 mr-1" />
                          Rechazar
                        </Button>
                      </PermissionGuard>
                    )}
                    {canDelete && !hasWorkOrder && (
                      <PermissionGuard module="mantenimiento" tab="gestion_ordenes" action="delete">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive/60 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                          onClick={() => onDeleteItem(item.id)}
                          title="Eliminar item"
                          aria-label="Eliminar item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </PermissionGuard>
                    )}
                  </div>
                </div>

                {/* Chief comment section */}
                {!hasWorkOrder && (
                  <div className="mt-2">
                    {isEditingComment ? (
                      <div className="space-y-1.5">
                        <Textarea
                          value={item.workshop_chief_comment || ''}
                          onChange={(e) => onChiefCommentChange(item.id, e.target.value)}
                          placeholder="Escriba su comentario..."
                          className="min-h-[60px] text-sm"
                          autoFocus
                        />
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => setEditingCommentItemId(null)}
                          >
                            Cerrar
                          </Button>
                        </div>
                      </div>
                    ) : hasChiefComment ? (
                      <div className="flex items-start gap-2 p-2 rounded border bg-ok-subtle border-ok/30 text-sm">
                        <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-ok shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-ok-subtle-foreground text-xs">Mi comentario</span>
                          <p className="mt-0.5 text-sm italic">{item.workshop_chief_comment}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 shrink-0 text-ok hover:text-ok-subtle-foreground"
                          onClick={() => setEditingCommentItemId(item.id)}
                          aria-label="Editar mi comentario"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingCommentItemId(item.id)}
                      >
                        <MessageSquare className="h-3 w-3 mr-1" />
                        Agregar comentario
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Rejected items section */}
      {rejectedItems.length > 0 && (
        <div className="space-y-2 mt-4">
          <h4 className="text-sm font-medium text-destructive">Desvíos rechazados ({rejectedItems.length})</h4>
          {rejectedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 border border-destructive/30 rounded-lg bg-destructive/5 opacity-70"
            >
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Badge variant="destructive" className="text-xs px-2 py-0.5">
                    Rechazado
                  </Badge>
                </div>
                {item.description && <p className="text-sm text-foreground line-through">{String(item.description)}</p>}
                {item._rejectionReason && (
                  <p className="text-xs text-destructive italic">Motivo: {item._rejectionReason}</p>
                )}
              </div>
              {onRestoreItem && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs ml-3 shrink-0"
                  onClick={() => onRestoreItem(item.id)}
                  title="Restaurar item"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Restaurar
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reject confirmation dialog */}
      <AlertDialog open={!!rejectDialogItemId} onOpenChange={(open) => !open && setRejectDialogItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechazar desvío</AlertDialogTitle>
            <AlertDialogDescription>
              El desvío rechazado no se incluirá en las órdenes de trabajo. Ingrese el motivo del rechazo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Motivo del rechazo..."
            className="min-h-[80px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!rejectionReason.trim()}
              onClick={() => {
                if (rejectDialogItemId && rejectionReason.trim() && onRejectItem) {
                  onRejectItem(rejectDialogItemId, rejectionReason.trim());
                  setRejectDialogItemId(null);
                  setRejectionReason('');
                }
              }}
            >
              Rechazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
