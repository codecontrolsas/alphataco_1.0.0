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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { invalidateAllMaintenanceQueries } from '@/features/Mantenimiento/utils/queryInvalidation';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { Logger } from '@/lib/logger';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ClipboardList, Loader2, Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { saveOrderChanges } from '../actions/items.server';
import { getOrderForManagement, type ExternalWorkshop, type OrderManagementItem, type WorkshopSector } from '../actions/queries.server';
import { setupAndGenerateWorkOrders } from '../actions/work-orders.server';
import { AddItemDialog } from './AddItemDialog';
import { AssignRepairTypesDialog } from './AssignRepairTypesDialog';
import { computeInitialWizardState } from './wizard/initial-state';
import { Step1Tasks } from './wizard/Step1Tasks';
import { Step2SectorAssignment } from './wizard/Step2SectorAssignment';
import { Step3ExecutionOrder } from './wizard/Step3ExecutionOrder';
import { Step4Confirm } from './wizard/Step4Confirm';
import { mapOrderItemToLocal, type LocalItem } from './wizard/types';
import { useWizardItems } from './wizard/useWizardItems';
import { useWizardSectors } from './wizard/useWizardSectors';
import { WizardResourceHeader } from './wizard/WizardResourceHeader';
import { WizardStepIndicator } from './wizard/WizardStepIndicator';

export type { LocalItem } from './wizard/types';

const logger = new Logger('ManageOrderWizard');

const DAY_MS = 24 * 60 * 60 * 1000;

interface ManageOrderWizardProps {
  order: OrderManagementItem | null;
  open: boolean;
  onClose: () => void;
  sectors: WorkshopSector[];
  repairTypes: Array<{ id: string; name: string }>;
  externalWorkshops: ExternalWorkshop[];
}

/**
 * Wizard de gestión de una orden (4 pasos). La sesión se monta solo mientras está abierto y se
 * identifica por el pedido: cada apertura arranca desde los datos del servidor, sin sincronizar
 * estado con efectos.
 */
export function ManageOrderWizard(props: ManageOrderWizardProps) {
  if (!props.order || !props.open) return null;
  return <ManageOrderWizardSession key={props.order.id} {...props} order={props.order} />;
}

function ManageOrderWizardSession({
  order,
  onClose,
  sectors,
  repairTypes,
}: ManageOrderWizardProps & { order: OrderManagementItem }) {
  const queryClient = useQueryClient();

  // Estado inicial: ítems del pedido y paso en el que corresponde arrancar (calculado una sola vez).
  const [initial] = useState(() => {
    const items = order.maintenance_order_items.map(mapOrderItemToLocal);
    return { items, ...computeInitialWizardState(items, sectors) };
  });

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(initial.step);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editingRepairTypesItem, setEditingRepairTypesItem] = useState<LocalItem | null>(null);

  // Paso 4: fechas (hoy y +7 días, en hora argentina)
  const [plannedStartDate, setPlannedStartDate] = useState(() => argentinaDate());
  const [plannedEndDate, setPlannedEndDate] = useState(() => argentinaDate(new Date(Date.now() + 7 * DAY_MS)));

  const items = useWizardItems(initial.items, repairTypes);
  const sectorsState = useWizardSectors(initial.sectorOrder, items.localItems, items.eligibleItems, sectors);

  const canGenerate =
    sectorsState.sectorOrder.length > 0 &&
    !!plannedStartDate &&
    !!plannedEndDate &&
    plannedEndDate >= plannedStartDate;

  const invalidateAfterSave = () => {
    invalidateAllMaintenanceQueries(queryClient);
    queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
  };

  // ─── Navegación ───────────────────────────────────────────

  const handleNext = async () => {
    if (currentStep === 1 && !items.canAdvanceFromStep1) {
      toast.error(
        items.eligibleItems.length === 0
          ? 'Agregue al menos un nuevo item para continuar'
          : 'Todos los items deben tener al menos un tipo de reparacion asignado'
      );
      return;
    }
    if (currentStep === 2 && !sectorsState.canAdvanceFromStep2) {
      toast.error('Todos los items deben tener un sector asignado');
      return;
    }

    // Se guardan los cambios del paso 1 antes de avanzar
    if (currentStep === 1 && items.hasStep1Changes) {
      try {
        setIsSavingStep(true);
        const saved = await saveOrderChanges(order.id, items.pendingChanges);
        if (!saved.ok) {
          toast.error(saved.message);
          return;
        }
        const { repairTypes: delta } = saved;
        if (delta.removed > 0) toast.info(`Se quitaron ${delta.removed} tipos de reparación`);
        const fresh = await getOrderForManagement(order.id);
        items.replaceFromServer(fresh.maintenance_order_items || []);
        invalidateAfterSave();
      } catch (error) {
        logger.error('Error guardando cambios del paso 1', { data: { error } });
        toast.error('Error al guardar los cambios. Intente nuevamente.');
        return;
      } finally {
        setIsSavingStep(false);
      }
    }

    // Al pasar al paso 3 se arma el orden de sectores
    if (currentStep === 2) sectorsState.buildSectorOrder();
    setCurrentStep((prev) => Math.min(prev + 1, 4) as 1 | 2 | 3 | 4);
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1) as 1 | 2 | 3 | 4);
  };

  // ─── Generar OTs ──────────────────────────────────────────

  const handleGenerate = async () => {
    if (!canGenerate) return;

    setIsGenerating(true);
    try {
      const assignmentsBySector = new Map<string, string[]>();
      for (const item of items.eligibleItems) {
        const sectorId = sectorsState.sectorAssignments.get(item.id) || item.assigned_sector_id;
        if (!sectorId) continue;
        const bucket = assignmentsBySector.get(sectorId) ?? [];
        bucket.push(item.id);
        assignmentsBySector.set(sectorId, bucket);
      }

      const result = await setupAndGenerateWorkOrders(
        order.id,
        items.pendingChanges,
        Array.from(assignmentsBySector.entries()).map(([sectorId, itemIds]) => ({ sectorId, itemIds })),
        sectorsState.sectorOrder.map((so) => ({ sectorId: so.sectorId, sequenceOrder: so.sequenceOrder })),
        { plannedStartDate, plannedEndDate }
      );

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(`${result.workOrders.length} orden(es) de trabajo generada(s) exitosamente`);
      invalidateAfterSave();
      onClose();
    } catch (error) {
      logger.error('Error en wizard de generacion', { data: { error } });
      toast.error('Error al generar ordenes de trabajo');
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Cierre ───────────────────────────────────────────────

  const hasAnyUnsavedChanges = items.hasStep1Changes || sectorsState.sectorAssignments.size > 0;

  const handleClose = () => {
    if (hasAnyUnsavedChanges) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    onClose();
  };

  const handleSaveRejectionsAndClose = async () => {
    if (!items.hasStep1Changes) return;
    try {
      setIsSavingStep(true);
      const saved = await saveOrderChanges(order.id, items.pendingChanges);
      if (!saved.ok) {
        toast.error(saved.message);
        return;
      }
      invalidateAfterSave();
      toast.success('Cambios guardados exitosamente');
      onClose();
    } catch (error) {
      logger.error('Error guardando rechazos', { data: { error } });
      toast.error('Error al guardar los cambios');
    } finally {
      setIsSavingStep(false);
    }
  };

  const savingLabel = (
    <>
      <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
      Guardando...
    </>
  );

  return (
    <>
      <Dialog open onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          {/* Header fijo */}
          <DialogHeader className="space-y-3 shrink-0">
            <DialogTitle className="flex items-center justify-between">
              <span className="font-mono text-lg">{order.order_number || 'Orden sin numero'}</span>
              <Badge variant="outline" className="text-xs">
                Paso {currentStep} de 4
              </Badge>
            </DialogTitle>
            <WizardResourceHeader order={order} />
            <WizardStepIndicator currentStep={currentStep} />
          </DialogHeader>

          {/* Contenido con scroll */}
          <div className="flex-1 min-h-0 overflow-y-auto mt-4 pr-1">
            {currentStep === 1 && (
              <>
                {items.eligibleItems.length === 0 && items.regularItems.length > 0 && !items.allItemsRejected && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 mb-4">
                    <ClipboardList className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="text-xs">
                      Todos los items ya tienen OT generada. Agregue un nuevo item para continuar con el wizard.
                    </span>
                  </div>
                )}
                <Step1Tasks
                  order={order}
                  localItems={items.localItems}
                  repairTypes={repairTypes}
                  onAddItem={() => setAddItemOpen(true)}
                  onDeleteItem={items.handleDeleteItem}
                  onRejectItem={items.handleRejectItem}
                  onRestoreItem={items.handleRestoreItem}
                  onEditRepairTypes={setEditingRepairTypesItem}
                  onDescriptionChange={items.handleDescriptionChange}
                  onChiefCommentChange={items.handleChiefCommentChange}
                />
              </>
            )}

            {currentStep === 2 && (
              <Step2SectorAssignment
                localItems={items.localItems}
                sectors={sectors}
                sectorAssignments={sectorsState.sectorAssignments}
                onAssignmentChange={sectorsState.handleAssignmentChange}
                onBatchAssignment={sectorsState.handleBatchAssignment}
                repairTypes={repairTypes}
              />
            )}

            {currentStep === 3 && (
              <Step3ExecutionOrder
                localItems={items.localItems}
                sectorAssignments={sectorsState.sectorAssignments}
                sectorOrder={sectorsState.sectorOrder}
                onReorder={sectorsState.handleReorder}
                onDragReorder={sectorsState.handleDragReorder}
                repairTypes={repairTypes}
              />
            )}

            {currentStep === 4 && (
              <Step4Confirm
                localItems={items.localItems}
                sectors={sectors}
                sectorAssignments={sectorsState.sectorAssignments}
                sectorOrder={sectorsState.sectorOrder}
                repairTypes={repairTypes}
                plannedStartDate={plannedStartDate}
                plannedEndDate={plannedEndDate}
                onStartDateChange={setPlannedStartDate}
                onEndDateChange={setPlannedEndDate}
              />
            )}
          </div>

          {/* Navegación */}
          <Separator className="mt-2" />
          <div className="flex items-center justify-between pt-2 shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={handleBack} disabled={currentStep === 1 || isSavingStep}>
              <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
              Anterior
            </Button>

            <div className="flex items-center gap-2">
              {currentStep === 1 && items.allItemsRejected && items.hasStep1Changes ? (
                <Button type="button" size="sm" onClick={handleSaveRejectionsAndClose} disabled={isSavingStep}>
                  {isSavingStep ? (
                    savingLabel
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-1" aria-hidden="true" />
                      Guardar cambios
                    </>
                  )}
                </Button>
              ) : currentStep < 4 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleNext}
                  disabled={isSavingStep || (currentStep === 1 && items.eligibleItems.length === 0)}
                >
                  {isSavingStep ? (
                    savingLabel
                  ) : (
                    <>
                      Siguiente
                      <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" />
                    </>
                  )}
                </Button>
              ) : (
                <PermissionGuard module="mantenimiento" tab="gestion_ordenes" action="create">
                  <Button type="button" size="sm" onClick={handleGenerate} disabled={!canGenerate || isGenerating}>
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
                        Generando...
                      </>
                    ) : (
                      <>
                        <ClipboardList className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        Generar {sectorsState.sectorOrder.length} OT(s)
                      </>
                    )}
                  </Button>
                </PermissionGuard>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sub-diálogos */}
      <AddItemDialog
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        repairTypes={repairTypes}
        onAdd={items.handleAddItem}
      />

      {editingRepairTypesItem && (
        <AssignRepairTypesDialog
          key={editingRepairTypesItem.id}
          item={editingRepairTypesItem}
          repairTypes={repairTypes}
          open={!!editingRepairTypesItem}
          onClose={() => setEditingRepairTypesItem(null)}
          onUpdate={items.handleUpdateRepairTypes}
        />
      )}

      {/* Confirmación de descarte */}
      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hay cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription>
              Si cierra ahora, los cambios no guardados se perderan. ¿Desea continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Descartar cambios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
