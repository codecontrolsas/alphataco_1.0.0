import { MIN_APPROVAL_DESCRIPTION_LENGTH } from '@/features/Mantenimiento/constants/approval';
import { isNonPropagatingChecklistItem } from '@/features/Mantenimiento/constants/non-propagating-checklist-items';
import { z } from 'zod';
import {
  getRepairItemDescription,
  getRepairItemGroupName,
  getRepairItemImages,
  getRepairItemLabel,
} from '../../../shared/repair-item-label';
import type { MaintenanceRequestData } from '../../actions/queries.server';

// Módulo sin directiva: lo comparten el formulario de ítems y el de preventivas.

export type DeviationItem = {
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

/** Extrae los desvíos pendientes de la solicitud, ya con su clasificación (crítico / informativo). */
export function buildDeviationItems(request: MaintenanceRequestData): DeviationItem[] {
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
      }) ?? []
  );
}

const itemDecisionSchema = z.object({
  itemId: z.string(),
  // Estado simplificado: solo aprobado o rechazado con motivo ('pending' = todavía sin decidir)
  status: z.enum(['approved', 'rejected', 'pending']),
  rejectionReason: z.string(),
  validatorComment: z.string(),
});

const descriptionMessage = `La descripción debe tener al menos ${MIN_APPROVAL_DESCRIPTION_LENGTH} caracteres`;

/** Validación del formulario de ítems: todos decididos, motivo en los rechazados, descripción si algo se aprueba. */
export const itemsApprovalSchema = z
  .object({
    items: z.array(itemDecisionSchema),
    description: z.string(),
  })
  .superRefine((values, ctx) => {
    values.items.forEach((item, index) => {
      if (item.status === 'pending') {
        ctx.addIssue({ code: 'custom', path: ['items', index, 'status'], message: 'Apruebe o rechace este item' });
      }
      if (item.status === 'rejected' && !item.rejectionReason.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'rejectionReason'],
          message: 'Los items rechazados deben tener un motivo',
        });
      }
    });

    // Solo se exige descripción cuando algo queda aprobado: si se rechaza todo,
    // no se genera pedido y no hay nada que describirle al taller.
    const hasApproved = values.items.some((item) => item.status === 'approved');
    if (hasApproved && values.description.trim().length < MIN_APPROVAL_DESCRIPTION_LENGTH) {
      ctx.addIssue({ code: 'custom', path: ['description'], message: descriptionMessage });
    }
  });

export type ItemsApprovalValues = z.infer<typeof itemsApprovalSchema>;

/** Validación de una solicitud preventiva: se aprueba completa (con descripción) o se rechaza (con motivo). */
export const preventiveApprovalSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    comment: z.string(),
    reason: z.string(),
    description: z.string(),
  })
  .superRefine((values, ctx) => {
    // Aprobar una preventiva siempre genera pedido, así que la descripción es obligatoria.
    if (values.action === 'approve' && values.description.trim().length < MIN_APPROVAL_DESCRIPTION_LENGTH) {
      ctx.addIssue({ code: 'custom', path: ['description'], message: descriptionMessage });
    }
    if (values.action === 'reject' && !values.reason.trim()) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Debe indicar un motivo de rechazo' });
    }
  });

export type PreventiveApprovalValues = z.infer<typeof preventiveApprovalSchema>;
