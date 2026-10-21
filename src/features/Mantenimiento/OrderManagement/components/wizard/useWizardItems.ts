import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { OrderManagementItem } from '../../actions/queries.server';
import type { OrderChangeSet } from '../../schemas/order-changes';
import {
  buildRepairTypeBaseline,
  emptyChanges,
  mapOrderItemToLocal,
  type LocalItem,
} from './types';

/**
 * Estado del paso 1 del wizard: ítems locales + cambios pendientes de guardar.
 *
 * Los tipos de reparación se guardan como ALTAS y BAJAS contra el `baseline` que el servidor
 * devolvió al cargar el pedido (se renueva en cada `replaceFromServer`): nunca se manda el
 * conjunto final para que el servidor borre por diferencia.
 */
export function useWizardItems(initialItems: LocalItem[], repairTypes: Array<{ id: string; name: string }>) {
  const [localItems, setLocalItems] = useState<LocalItem[]>(initialItems);
  const [pendingChanges, setPendingChanges] = useState<OrderChangeSet>(emptyChanges);
  const [baseline, setBaseline] = useState(() => buildRepairTypeBaseline(initialItems));

  const regularItems = useMemo(() => localItems.filter((item) => !item.is_diagnostico && !item._deleted), [localItems]);
  const eligibleItems = useMemo(
    () => regularItems.filter((item) => !item.work_order_id && !item._rejected),
    [regularItems]
  );
  const rejectedItems = useMemo(() => regularItems.filter((item) => item._rejected), [regularItems]);

  // Todos los ítems sin OT están rechazados: se pueden guardar los rechazos directamente
  const allItemsRejected = eligibleItems.length === 0 && rejectedItems.length > 0;

  const hasStep1Changes = useMemo(() => {
    const c = pendingChanges;
    return (
      c.adds.length > 0 ||
      c.deletes.length > 0 ||
      c.repairTypeUpdates.length > 0 ||
      c.descriptionUpdates.length > 0 ||
      c.chiefCommentUpdates.length > 0 ||
      (c.rejections || []).length > 0 ||
      (c.restorations || []).length > 0
    );
  }, [pendingChanges]);

  const canAdvanceFromStep1 = useMemo(() => {
    if (eligibleItems.length === 0) return false;
    // Todos los ítems deben tener al menos 1 tipo de reparación
    return eligibleItems.every((item) => {
      if (item._isTemp && item._tempRepairTypeIds) return item._tempRepairTypeIds.length > 0;
      const pivotTypes = item.maintenance_order_item_repair_types || [];
      return pivotTypes.length > 0 || !!item.types_of_repairs;
    });
  }, [eligibleItems]);

  const handleAddItem = useCallback((description: string, repairTypeIds: string[]) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const newItem: LocalItem = {
      id: tempId,
      description,
      is_diagnostico: false,
      maintenance_request_item_id: null,
      repair_type_id: repairTypeIds[0] || null,
      assigned_sector_id: null,
      assigned_workshop_id: null,
      sector_sequence_order: null,
      types_of_repairs: null,
      maintenance_order_item_repair_types: [],
      maintenance_request_items: null,
      workshop_sectors: null,
      // Un item creado a mano en el wizard todavia no tiene fotos ni grupo
      images: [],
      maintenance_request_groups: null,
      work_order_id: null,
      workshop_chief_comment: null,
      _isTemp: true,
      _tempRepairTypeIds: repairTypeIds,
    };

    setLocalItems((prev) => [...prev, newItem]);
    setPendingChanges((prev) => ({ ...prev, adds: [...prev.adds, { description, repairTypeIds }] }));
    toast.info('Item agregado');
  }, []);

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      const item = localItems.find((i) => i.id === itemId);
      if (!item) return;

      if (item._isTemp) {
        setLocalItems((prev) => prev.filter((i) => i.id !== itemId));
        setPendingChanges((prev) => ({
          ...prev,
          adds: prev.adds.filter((a) => a.description !== item.description),
        }));
        return;
      }

      if (item.maintenance_request_item_id) {
        toast.error('No se puede eliminar un item que proviene de una solicitud');
        return;
      }

      setLocalItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, _deleted: true } : i)));
      setPendingChanges((prev) => ({ ...prev, deletes: [...prev.deletes, itemId] }));
      toast.info('Item eliminado');
    },
    [localItems]
  );

  const handleRejectItem = useCallback((itemId: string, reason: string) => {
    setLocalItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, _rejected: true, _rejectionReason: reason } : i)));
    setPendingChanges((prev) => ({ ...prev, rejections: [...(prev.rejections || []), { itemId, reason }] }));
    toast.info('Item rechazado');
  }, []);

  const handleRestoreItem = useCallback((itemId: string) => {
    setLocalItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, _rejected: false, _rejectionReason: undefined } : i))
    );
    setPendingChanges((prev) => {
      const updatedRejections = (prev.rejections || []).filter((r) => r.itemId !== itemId);
      // Si ya estaba rechazado en la base (no es un rechazo pendiente), se registra como restauración
      const wasPendingRejection = (prev.rejections || []).some((r) => r.itemId === itemId);
      const updatedRestorations = wasPendingRejection ? prev.restorations || [] : [...(prev.restorations || []), itemId];
      return { ...prev, rejections: updatedRejections, restorations: updatedRestorations };
    });
    toast.info('Item restaurado');
  }, []);

  const handleUpdateRepairTypes = useCallback(
    (itemId: string, repairTypeIds: string[]) => {
      const item = localItems.find((i) => i.id === itemId);
      if (!item) return;

      if (item._isTemp) {
        setLocalItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, _tempRepairTypeIds: repairTypeIds } : i)));
        setPendingChanges((prev) => ({
          ...prev,
          adds: prev.adds.map((a) => (a.description === item.description ? { ...a, repairTypeIds } : a)),
        }));
      } else {
        const repairTypeObjs = repairTypeIds
          .map((rtId) => {
            const rt = repairTypes.find((r) => r.id === rtId);
            return rt
              ? {
                  id: '',
                  company_id: '',
                  maintenance_order_item_id: itemId,
                  created_at: null,
                  repair_type_id: rtId,
                  types_of_repairs: { id: rt.id, name: rt.name, autorizable: false },
                }
              : null;
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        setLocalItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? { ...i, repair_type_id: repairTypeIds[0] || null, maintenance_order_item_repair_types: repairTypeObjs }
              : i
          )
        );

        // Altas y bajas contra el baseline del servidor; si vuelve a quedar igual, no hay cambio.
        const serverIds = baseline.get(itemId) ?? [];
        const add = repairTypeIds.filter((id) => !serverIds.includes(id));
        const remove = serverIds.filter((id) => !repairTypeIds.includes(id));

        setPendingChanges((prev) => {
          const others = prev.repairTypeUpdates.filter((u) => u.itemId !== itemId);
          return {
            ...prev,
            repairTypeUpdates: add.length > 0 || remove.length > 0 ? [...others, { itemId, add, remove }] : others,
          };
        });
      }
      toast.info('Tipos de reparacion actualizados');
    },
    [localItems, repairTypes, baseline]
  );

  const handleDescriptionChange = useCallback((itemId: string, newDescription: string) => {
    setLocalItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, description: newDescription } : i)));
    setPendingChanges((prev) => ({
      ...prev,
      descriptionUpdates: [
        ...prev.descriptionUpdates.filter((u) => u.itemId !== itemId),
        { itemId, description: newDescription },
      ],
    }));
  }, []);

  const handleChiefCommentChange = useCallback((itemId: string, comment: string) => {
    setLocalItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, workshop_chief_comment: comment } : i)));
    setPendingChanges((prev) => ({
      ...prev,
      chiefCommentUpdates: [...prev.chiefCommentUpdates.filter((u) => u.itemId !== itemId), { itemId, comment }],
    }));
  }, []);

  /** Reemplaza el estado local por el del servidor (tras guardar) y renueva el baseline. */
  const replaceFromServer = useCallback((items: OrderManagementItem['maintenance_order_items']) => {
    const mapped = items.map(mapOrderItemToLocal);
    setLocalItems(mapped);
    setBaseline(buildRepairTypeBaseline(mapped));
    setPendingChanges(emptyChanges());
  }, []);

  return {
    localItems,
    pendingChanges,
    regularItems,
    eligibleItems,
    rejectedItems,
    allItemsRejected,
    hasStep1Changes,
    canAdvanceFromStep1,
    handleAddItem,
    handleDeleteItem,
    handleRejectItem,
    handleRestoreItem,
    handleUpdateRepairTypes,
    handleDescriptionChange,
    handleChiefCommentChange,
    replaceFromServer,
  };
}
