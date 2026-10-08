'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { PreventiveInfoCard } from '@/features/Mantenimiento/components/PreventiveInfoCard';
import { MIN_APPROVAL_DESCRIPTION_LENGTH } from '@/features/Mantenimiento/constants/approval';
import { isNonPropagatingChecklistItem } from '@/features/Mantenimiento/constants/non-propagating-checklist-items';
import { RepairGroupBadge } from '@/features/Mantenimiento/shared/components/RepairGroupBadge';
import { cn } from '@/lib/utils';
import { AlertCircle, AlertTriangle, Check, Info, Loader2, MessageSquarePlus, Pencil, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RepairItemPhotos } from '../../shared/components/RepairItemPhotos';
import {
  getRepairItemDescription,
  getRepairItemGroupName,
  getRepairItemImages,
  getRepairItemLabel,
} from '../../shared/repair-item-label';
import type { MaintenanceRequestData } from '../actions/queries.server';
import { useApproveMaintenanceRequestItems, useRejectMaintenanceRequestItems } from '../hooks/useMaintenanceRequests';

interface SolicitudApprovalDialogProps {
  request: MaintenanceRequestData;
  open: boolean;
  onClose: () => void;
}

type DeviationItem = {
  /** checklist_deviation_id — null en los items de carga manual, que no vienen de un checklist */
  id: string | null;
  itemId: string; // maintenance_request_item.id
  item_code: string;
  item_label: string;
  /** Grupo de reparaciones del que salio el item, null si se cargo suelto */
  group_name: string | null;
  section_code: string | null;
  driver_comment: string | null;
  is_critical: boolean;
  is_non_propagating: boolean;
  /** Aclaracion que escribio quien cargo el item (ticket 592) */
  description: string | null;
  /** Fotos del item cargado manualmente (ticket 592) */
  images: string[];
};

// Estado simplificado: solo aprobado o rechazado con motivo
type ItemDecision = {
  status: 'approved' | 'rejected' | 'pending';
  rejectionReason: string;
  validatorComment: string;
  showCommentField: boolean;
};

export function SolicitudApprovalDialog({ request, open, onClose }: SolicitudApprovalDialogProps) {
  // Extraer los desvíos pendientes de la solicitud
  const pendingItems: DeviationItem[] = useMemo(() => {
    return (
      request.maintenance_request_items
        ?.filter((item) => item.status === 'pending')
        .map((item) => {
          const templateId =
            (item.checklist_deviations as { checklist_answers?: { template_id?: string | null } | null } | null)
              ?.checklist_answers?.template_id ?? null;
          const itemCode = item.checklist_deviations?.item_code || '';
          return {
            id: item.checklist_deviation_id,
            itemId: item.id,
            item_code: itemCode,
            // Un item de carga manual no tiene desvio de checklist: su titulo es
            // el texto libre o el tipo de reparacion elegido (ticket 592).
            item_label: getRepairItemLabel(item, 'Sin título'),
            group_name: getRepairItemGroupName(item),
            section_code: item.checklist_deviations?.section_code || null,
            driver_comment: item.driver_comment || item.checklist_deviations?.driver_comment || null,
            is_critical: item.checklist_deviations?.is_critical ?? false,
            is_non_propagating: isNonPropagatingChecklistItem(templateId, itemCode),
            description: getRepairItemDescription(item),
            images: getRepairItemImages(item),
          };
        }) || []
    );
  }, [request.maintenance_request_items]);

  // Estado de decisiones por item
  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>({});

  // Inicializar decisiones cuando se abre el dialog.
  // Solo se crean decisiones para items "decidibles": los no-propagables son lectura.
  useEffect(() => {
    if (open) {
      const initialDecisions: Record<string, ItemDecision> = {};
      pendingItems
        .filter((item) => !item.is_non_propagating)
        .forEach((item) => {
          initialDecisions[item.itemId] = {
            status: 'pending',
            rejectionReason: '',
            validatorComment: '',
            showCommentField: false,
          };
        });
      setDecisions(initialDecisions);
      setOrderDescription('');
      setShowDescriptionError(false);
    }
  }, [open, pendingItems]);

  const isPreventive = request.source === 'preventive';
  const [preventiveAction, setPreventiveAction] = useState<'approve' | 'reject' | null>(null);
  const [preventiveComment, setPreventiveComment] = useState('');
  const [preventiveRejectionReason, setPreventiveRejectionReason] = useState('');

  // Descripción de lo aprobado. Es lo que el taller ve para planificar sin abrir
  // el detalle, así que se exige siempre que la aprobación genere un pedido.
  const [orderDescription, setOrderDescription] = useState('');
  const [showDescriptionError, setShowDescriptionError] = useState(false);

  const isDescriptionValid = orderDescription.trim().length >= MIN_APPROVAL_DESCRIPTION_LENGTH;

  const handleDescriptionChange = (value: string) => {
    setOrderDescription(value);
    if (value.trim().length >= MIN_APPROVAL_DESCRIPTION_LENGTH) setShowDescriptionError(false);
  };

  const approveMutation = useApproveMaintenanceRequestItems();
  const rejectMutation = useRejectMaintenanceRequestItems();

  // Handlers
  const handleApproveItem = (itemId: string) => {
    setDecisions((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        status: 'approved',
        rejectionReason: '',
      },
    }));
  };

  const handleRejectItem = (itemId: string) => {
    setDecisions((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        status: 'rejected',
      },
    }));
  };

  const handleResetItem = (itemId: string) => {
    setDecisions((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        status: 'pending',
        rejectionReason: '',
      },
    }));
  };

  const handleRejectionReasonChange = (itemId: string, reason: string) => {
    setDecisions((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        rejectionReason: reason,
      },
    }));
  };

  const handleValidatorCommentChange = (itemId: string, comment: string) => {
    setDecisions((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        validatorComment: comment,
      },
    }));
  };

  const handleToggleCommentField = (itemId: string) => {
    setDecisions((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        showCommentField: !prev[itemId].showCommentField,
      },
    }));
  };

  const handleCloseCommentField = (itemId: string) => {
    setDecisions((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        validatorComment: '',
        showCommentField: false,
      },
    }));
  };

  const handleSubmit = async () => {
    // Validar que todos los items tengan una decisión
    const pendingDecisions = Object.entries(decisions).filter(([_, d]) => d.status === 'pending');
    if (pendingDecisions.length > 0) {
      toast.error('Todos los items deben ser aprobados o rechazados');
      return;
    }

    // Validar que los rechazados tengan motivo
    const rejectedWithoutReason = Object.entries(decisions).filter(
      ([_, d]) => d.status === 'rejected' && !d.rejectionReason.trim()
    );
    if (rejectedWithoutReason.length > 0) {
      toast.error('Los items rechazados deben tener un motivo');
      return;
    }

    // Construir payload (sin tipos de reparación)
    const approvedItems = Object.entries(decisions)
      .filter(([_, d]) => d.status === 'approved')
      .map(([itemId, d]) => ({
        itemId,
        validatorComment: d.validatorComment?.trim() || undefined,
      }));

    // Items "no propagables" se incluyen como aprobados automáticamente.
    // Quedan registrados en la solicitud, pero el server action los filtra al
    // crear `maintenance_order_items` por la matriz, así no llegan al taller.
    const nonPropagatingItems = pendingItems
      .filter((item) => item.is_non_propagating)
      .map((item) => ({ itemId: item.itemId, validatorComment: undefined as string | undefined }));

    const rejectedItems = Object.entries(decisions)
      .filter(([_, d]) => d.status === 'rejected')
      .map(([itemId, d]) => ({
        itemId,
        reason: d.rejectionReason,
        validatorComment: d.validatorComment?.trim() || undefined,
      }));

    // Solo se exige descripción cuando algo queda aprobado: si se rechaza todo,
    // no se genera pedido y no hay nada que describirle al taller.
    if (approvedItems.length > 0 && !isDescriptionValid) {
      setShowDescriptionError(true);
      return;
    }

    try {
      await approveMutation.mutateAsync({
        requestId: request.id,
        approvedItems: [...approvedItems, ...nonPropagatingItems],
        rejectedItems,
        description: approvedItems.length > 0 ? orderDescription.trim() : undefined,
      });

      const approvedCount = approvedItems.length;
      const rejectedCount = rejectedItems.length;
      const informationalCount = nonPropagatingItems.length;

      const descriptionParts = [
        `${approvedCount} aprobado(s)`,
        `${rejectedCount} rechazado(s)`,
        ...(informationalCount > 0 ? [`${informationalCount} solo informativo(s)`] : []),
      ];

      toast.success('Solicitud procesada', {
        description: descriptionParts.join(', '),
      });
      onClose();
    } catch {
      toast.error('Error al procesar la solicitud');
    }
  };

  const handlePreventiveSubmit = async () => {
    // Aprobar una preventiva siempre genera pedido, así que la descripción es obligatoria.
    if (preventiveAction !== 'reject' && !isDescriptionValid) {
      setShowDescriptionError(true);
      return;
    }

    try {
      if (preventiveAction === 'approve' || preventiveAction === null) {
        await approveMutation.mutateAsync({
          requestId: request.id,
          approvedItems: [],
          rejectedItems: [],
          preventiveApproval: true,
          validatorComment: preventiveComment.trim() || undefined,
          description: orderDescription.trim(),
        });
        toast.success('Solicitud preventiva aprobada');
      } else if (preventiveAction === 'reject') {
        await rejectMutation.mutateAsync({
          requestId: request.id,
          itemIds: [],
          reason: preventiveRejectionReason.trim(),
        });
        toast.success('Solicitud preventiva rechazada');
      }
      onClose();
    } catch {
      toast.error('Error al procesar la solicitud');
    }
  };

  // Separar items: decidibles (críticos / no críticos) vs solo informativos (no propagables).
  const criticalItems = pendingItems.filter((i) => i.is_critical && !i.is_non_propagating);
  const nonCriticalItems = pendingItems.filter((i) => !i.is_critical && !i.is_non_propagating);
  const informationalItems = pendingItems.filter((i) => i.is_non_propagating);

  // Contadores — solo cuentan los items que requieren decisión.
  const approvedCount = Object.values(decisions).filter((d) => d.status === 'approved').length;
  const rejectedCount = Object.values(decisions).filter((d) => d.status === 'rejected').length;
  const pendingCount = Object.values(decisions).filter((d) => d.status === 'pending').length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Validar Solicitud de Mantenimiento</DialogTitle>
          <DialogDescription>
            Revisa cada item y aprueba o rechaza con un motivo. Los tipos de reparación se asignarán en la etapa de
            Planificación.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Información del equipo y supervisor */}
          <div className="p-3 bg-muted rounded-lg space-y-1">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-sm text-muted-foreground">Equipo: </span>
                <span className="font-medium">
                  {request.vehicles?.domain || request.vehicles?.serie || 'Sin identificar'}
                </span>
              </div>
              {request.supervisor && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Supervisor: </span>
                  <span className="font-medium">
                    {(request.supervisor as { fullname?: string })?.fullname || 'Sin nombre'}
                  </span>
                </div>
              )}
            </div>
            {request.description && (
              <div className="pt-1">
                <span className="text-sm text-muted-foreground">Descripción: </span>
                <p className="font-medium whitespace-pre-wrap break-words">{request.description}</p>
              </div>
            )}
          </div>

          {isPreventive ? (
            <div className="space-y-4">
              <PreventiveInfoCard preventiveType={request.preventive_type ?? ''} />

              <div className="space-y-2">
                <Label>Comentario del validador (opcional)</Label>
                <Textarea
                  value={preventiveComment}
                  onChange={(e) => setPreventiveComment(e.target.value)}
                  placeholder="Agregar un comentario..."
                  rows={2}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                />
              </div>

              {preventiveAction !== 'reject' && (
                <ApprovalDescriptionField
                  value={orderDescription}
                  onChange={handleDescriptionChange}
                  showError={showDescriptionError}
                  disabled={approveMutation.isPending}
                />
              )}

              {preventiveAction === 'reject' && (
                <div className="space-y-2">
                  <Label>Motivo del rechazo *</Label>
                  <Textarea
                    value={preventiveRejectionReason}
                    onChange={(e) => setPreventiveRejectionReason(e.target.value)}
                    placeholder="Ingrese el motivo del rechazo..."
                    rows={3}
                    disabled={rejectMutation.isPending}
                  />
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Items Críticos */}
              {criticalItems.length > 0 && (
                <Card className="border-destructive/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-5 w-5" />
                      Items Críticos ({criticalItems.length})
                    </CardTitle>
                    <CardDescription>Estos items requieren atención inmediata</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {criticalItems.map((item) => (
                      <ItemCard
                        key={item.itemId}
                        item={item}
                        decision={decisions[item.itemId]}
                        onApprove={() => handleApproveItem(item.itemId)}
                        onReject={() => handleRejectItem(item.itemId)}
                        onReset={() => handleResetItem(item.itemId)}
                        onReasonChange={(reason) => handleRejectionReasonChange(item.itemId, reason)}
                        onValidatorCommentChange={(comment) => handleValidatorCommentChange(item.itemId, comment)}
                        onToggleCommentField={() => handleToggleCommentField(item.itemId)}
                        onCloseCommentField={() => handleCloseCommentField(item.itemId)}
                      />
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Items No Críticos */}
              {nonCriticalItems.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      Otros Items ({nonCriticalItems.length})
                    </CardTitle>
                    <CardDescription>Items que requieren mantenimiento pero no son críticos</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {nonCriticalItems.map((item) => (
                      <ItemCard
                        key={item.itemId}
                        item={item}
                        decision={decisions[item.itemId]}
                        onApprove={() => handleApproveItem(item.itemId)}
                        onReject={() => handleRejectItem(item.itemId)}
                        onReset={() => handleResetItem(item.itemId)}
                        onReasonChange={(reason) => handleRejectionReasonChange(item.itemId, reason)}
                        onValidatorCommentChange={(comment) => handleValidatorCommentChange(item.itemId, comment)}
                        onToggleCommentField={() => handleToggleCommentField(item.itemId)}
                        onCloseCommentField={() => handleCloseCommentField(item.itemId)}
                      />
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Items Solo Informativos — NO requieren decisión, NO viajan a taller */}
              {informationalItems.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2 text-muted-foreground">
                      <Info className="h-5 w-5" />
                      Solo informativos ({informationalItems.length})
                    </CardTitle>
                    <CardDescription>
                      Estos items quedan registrados en la solicitud pero no requieren decisión y no viajan a taller.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {informationalItems.map((item) => (
                      <InformationalItemCard key={item.itemId} item={item} />
                    ))}
                  </CardContent>
                </Card>
              )}

              <Separator />

              {/* Resumen */}
              <div className="p-3 bg-muted rounded-lg flex justify-between items-center">
                <div className="flex gap-4 text-sm flex-wrap">
                  <span>
                    <span className="text-green-600 dark:text-green-400 font-medium">{approvedCount}</span> aprobados
                  </span>
                  <span>
                    <span className="text-red-600 dark:text-red-400 font-medium">{rejectedCount}</span> rechazados
                  </span>
                  {pendingCount > 0 && (
                    <span>
                      <span className="text-yellow-600 dark:text-yellow-400 font-medium">{pendingCount}</span>{' '}
                      pendientes
                    </span>
                  )}
                  {informationalItems.length > 0 && (
                    <span className="text-muted-foreground">
                      <span className="font-medium">{informationalItems.length}</span> solo informativo(s)
                    </span>
                  )}
                </div>
              </div>

              {/* Solo se pide descripción si algo queda aprobado: si se rechaza
                  todo, no se genera pedido y el taller no ve nada. */}
              {approvedCount > 0 && (
                <ApprovalDescriptionField
                  value={orderDescription}
                  onChange={handleDescriptionChange}
                  showError={showDescriptionError}
                  disabled={approveMutation.isPending}
                />
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {isPreventive ? (
            <>
              <Button
                variant="outline"
                onClick={onClose}
                disabled={approveMutation.isPending || rejectMutation.isPending}
              >
                Cancelar
              </Button>
              {preventiveAction === 'reject' ? (
                <Button
                  variant="destructive"
                  onClick={handlePreventiveSubmit}
                  disabled={rejectMutation.isPending || !preventiveRejectionReason.trim()}
                >
                  {rejectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Rechazar Solicitud
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => setPreventiveAction('reject')}
                    disabled={approveMutation.isPending}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Rechazar
                  </Button>
                  <Button
                    onClick={handlePreventiveSubmit}
                    disabled={approveMutation.isPending || !isDescriptionValid}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {approveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Check className="mr-2 h-4 w-4" />
                    Aprobar Solicitud
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={approveMutation.isPending}>
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={approveMutation.isPending || pendingCount > 0 || (approvedCount > 0 && !isDescriptionValid)}
              >
                {approveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Procesar Solicitud
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Descripción obligatoria de lo que se aprueba.
 *
 * Se persiste en `maintenance_orders.description` y es lo que el taller lee en la
 * columna "Descripción" del paso 1, para saber qué hay que hacer sin tener que
 * abrir el detalle de la orden.
 */
function ApprovalDescriptionField({
  value,
  onChange,
  showError,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  showError: boolean;
  disabled: boolean;
}) {
  const length = value.trim().length;
  const isValid = length >= MIN_APPROVAL_DESCRIPTION_LENGTH;

  return (
    <div className="space-y-2">
      <Label htmlFor="approval-description">
        Descripción para el taller <span className="text-destructive">*</span>
      </Label>
      <Textarea
        id="approval-description"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Describa qué se aprueba y qué hay que hacer (mínimo ${MIN_APPROVAL_DESCRIPTION_LENGTH} caracteres)`}
        rows={3}
        disabled={disabled}
        className={showError ? 'border-destructive' : ''}
      />
      <div className="flex items-start justify-between gap-2">
        {showError ? (
          <p className="text-sm text-destructive">
            La descripción debe tener al menos {MIN_APPROVAL_DESCRIPTION_LENGTH} caracteres
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">El taller usa este texto para planificar el trabajo.</p>
        )}
        {!isValid && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {length}/{MIN_APPROVAL_DESCRIPTION_LENGTH}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Componente simplificado para renderizar cada item con botones de aprobar/rechazar
 */
function ItemCard({
  item,
  decision,
  onApprove,
  onReject,
  onReset,
  onReasonChange,
  onValidatorCommentChange,
  onToggleCommentField,
  onCloseCommentField,
}: {
  item: DeviationItem;
  decision: ItemDecision | undefined;
  onApprove: () => void;
  onReject: () => void;
  onReset: () => void;
  onReasonChange: (reason: string) => void;
  onValidatorCommentChange: (comment: string) => void;
  onToggleCommentField: () => void;
  onCloseCommentField: () => void;
}) {
  if (!decision) return null;

  const isRejected = decision.status === 'rejected';
  const isApproved = decision.status === 'approved';
  const isPending = decision.status === 'pending';
  const hasDriverComment = !!item.driver_comment;

  return (
    <div
      className={cn(
        'rounded-lg border p-4 space-y-3',
        isRejected && 'border-destructive/50 bg-destructive/5',
        isApproved && 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20',
        isPending && 'border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20'
      )}
    >
      {/* Header del item */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {item.is_critical ? (
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
            )}
            <span className="font-medium">{item.item_label}</span>
            <RepairGroupBadge groupName={item.group_name} />
            {item.is_critical && (
              <Badge variant="destructive" className="text-xs">
                CRÍTICO
              </Badge>
            )}
          </div>
          {item.section_code && (
            <p className="text-sm text-muted-foreground capitalize mt-1">
              Sección: {item.section_code.replace('_', ' ')}
            </p>
          )}
          {item.description && <p className="mt-1 text-sm italic text-muted-foreground">{item.description}</p>}
          {/* Fotos que adjunto el supervisor: son el contexto para decidir la aprobacion */}
          <RepairItemPhotos images={item.images} label={item.item_label} size="sm" className="mt-2" />
          {/* Comentario del chofer */}
          {hasDriverComment && (
            <div className="mt-2 p-2 bg-muted/50 rounded text-sm">
              <span className="text-muted-foreground">Comentario del chofer: </span>
              <span className="italic">{item.driver_comment}</span>
            </div>
          )}
        </div>

        {/* Botones de acción */}
        <div className="flex gap-2">
          {isPending && (
            <>
              <Button variant="outline" size="sm" className="text-green-600 hover:bg-green-50" onClick={onApprove}>
                <Check className="h-4 w-4 mr-1" />
                Aprobar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={onReject}
              >
                <X className="h-4 w-4 mr-1" />
                Rechazar
              </Button>
            </>
          )}
          {(isApproved || isRejected) && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              Cambiar
            </Button>
          )}
        </div>
      </div>

      {/* Botón para agregar/editar comentario del validador */}
      {!decision.showCommentField ? (
        <Button type="button" variant="outline" size="sm" onClick={onToggleCommentField} className="gap-2">
          {hasDriverComment ? (
            <>
              <Pencil className="h-4 w-4" />
              Ampliar comentario
            </>
          ) : (
            <>
              <MessageSquarePlus className="h-4 w-4" />
              Agregar comentario
            </>
          )}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={`validator-comment-${item.itemId}`} className="text-sm">
              Comentario del validador (opcional)
            </Label>
            <Button type="button" variant="ghost" size="sm" onClick={onCloseCommentField} className="h-6 w-6 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            id={`validator-comment-${item.itemId}`}
            value={decision.validatorComment}
            onChange={(e) => onValidatorCommentChange(e.target.value)}
            placeholder="Agregue observaciones adicionales..."
            rows={2}
            autoFocus
          />
        </div>
      )}

      {/* Motivo de rechazo (solo si está rechazado) */}
      {isRejected && (
        <div className="space-y-2">
          <Label htmlFor={`reason-${item.itemId}`}>Motivo del rechazo *</Label>
          <Textarea
            id={`reason-${item.itemId}`}
            value={decision.rejectionReason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Indique el motivo del rechazo..."
            rows={2}
            className={cn(!decision.rejectionReason.trim() && 'border-destructive')}
          />
        </div>
      )}

      {/* Estado visual */}
      <div className="flex justify-end">
        <Badge
          variant={isApproved ? 'success' : isRejected ? 'destructive' : 'secondary'}
        >
          {isApproved ? 'Aprobado' : isRejected ? 'Rechazado' : 'Pendiente de decisión'}
        </Badge>
      </div>
    </div>
  );
}

/**
 * Card de lectura para items "no propagables".
 * No tiene botones, no entra al conteo de pendientes, no genera trabajo en taller.
 * Queda como registro histórico de la solicitud.
 */
function InformationalItemCard({ item }: { item: DeviationItem }) {
  return (
    <div className="overflow-hidden rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30">
      {/* Banner: separa visualmente del modo decisión */}
      <div className="flex items-center gap-2 border-b border-muted-foreground/20 bg-muted/60 px-4 py-2">
        <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          No requiere decisión — no viaja a taller
        </p>
      </div>

      {/* Cuerpo */}
      <div className="space-y-2 p-4">
        <div className="flex items-start gap-2">
          {item.is_critical ? (
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/60" aria-hidden />
          ) : (
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/60" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-muted-foreground">{item.item_label}</p>
            <RepairGroupBadge groupName={item.group_name} className="mt-1" />
            {item.section_code && (
              <p className="mt-0.5 text-sm text-muted-foreground/80 capitalize">
                Sección: {item.section_code.replace('_', ' ')}
              </p>
            )}
            {item.description && <p className="mt-0.5 text-sm italic text-muted-foreground/80">{item.description}</p>}
            <RepairItemPhotos images={item.images} label={item.item_label} size="sm" className="mt-2" />
          </div>
        </div>

        {item.driver_comment && (
          <div className="rounded-md bg-background/50 p-2 text-sm">
            <p className="text-xs text-muted-foreground/80">Comentario del chofer</p>
            <p className="mt-0.5 italic text-muted-foreground">{item.driver_comment}</p>
          </div>
        )}
      </div>
    </div>
  );
}
