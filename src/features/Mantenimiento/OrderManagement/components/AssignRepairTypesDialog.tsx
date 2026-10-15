'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { CheckCircle2, Search, Wrench, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { OrderManagementItem } from '../actions/queries.server';
import type { LocalItem } from './ManageOrderWizard';

type OrderItem = OrderManagementItem['maintenance_order_items'][number];

interface AssignRepairTypesDialogProps {
  item: LocalItem | OrderItem;
  repairTypes: Array<{ id: string; name: string }>;
  open: boolean;
  onClose: () => void;
  onUpdate: (itemId: string, repairTypeIds: string[]) => void;
}

export function AssignRepairTypesDialog({ item, repairTypes, open, onClose, onUpdate }: AssignRepairTypesDialogProps) {
  // Inicializar desde pivot (prioridad) o legacy
  const pivotTypes = item.maintenance_order_item_repair_types || [];
  const initialIds =
    pivotTypes.length > 0
      ? (pivotTypes.map((rt) => rt.repair_type_id).filter(Boolean) as string[])
      : item.repair_type_id
        ? [item.repair_type_id]
        : [];

  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRepairTypes = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) return repairTypes;
    return repairTypes.filter((rt) => rt.name.toLowerCase().includes(normalized));
  }, [repairTypes, searchQuery]);

  const selectedRepairTypes = useMemo(
    () =>
      selectedIds
        .map((id) => repairTypes.find((rt) => rt.id === id))
        .filter((rt): rt is { id: string; name: string } => rt !== undefined),
    [selectedIds, repairTypes]
  );

  const handleToggle = (repairTypeId: string) => {
    setSelectedIds((prev) =>
      prev.includes(repairTypeId) ? prev.filter((id) => id !== repairTypeId) : [...prev, repairTypeId]
    );
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleSubmit = () => {
    if (selectedIds.length === 0) {
      toast.error('Debe seleccionar al menos un tipo de reparacion');
      return;
    }

    onUpdate(item.id, selectedIds);
    handleClose();
  };

  const handleClose = () => {
    setSearchQuery('');
    onClose();
  };

  // Vista previa de bajas respecto de lo que el diálogo mostró al abrirse.
  const removedTypes = initialIds
    .filter((id) => !selectedIds.includes(id))
    .map((id) => repairTypes.find((rt) => rt.id === id)?.name ?? 'Tipo')
    .join(', ');
  const removedCount = initialIds.filter((id) => !selectedIds.includes(id)).length;

  const totalCount = repairTypes.length;
  const selectedCount = selectedIds.length;
  const filteredCount = filteredRepairTypes.length;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Asignar Tipos de Reparación</DialogTitle>
          <DialogDescription>Seleccione las tareas a realizar para la resolución del desvío</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 flex-1 overflow-y-auto min-h-0">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                Tipos de reparación
              </Label>
              <p className="text-xs text-muted-foreground">Debe seleccionar al menos una tarea</p>
            </div>
            <Badge variant="outline" className="text-xs whitespace-nowrap">
              {selectedCount} de {totalCount}
            </Badge>
          </div>

          {totalCount > 0 ? (
            <>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar tipo de reparación..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
                {selectedCount > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={handleClearSelection}>
                    Limpiar
                  </Button>
                )}
              </div>

              <ScrollArea className="h-[260px] border rounded-md">
                {filteredCount > 0 ? (
                  <div className="p-1">
                    {filteredRepairTypes.map((repairType) => {
                      const isSelected = selectedIds.includes(repairType.id);
                      return (
                        <div
                          key={repairType.id}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors',
                            isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/50'
                          )}
                          onClick={() => handleToggle(repairType.id)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggle(repairType.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="text-sm flex-1">{repairType.name}</span>
                          {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[260px] text-center px-6">
                    <Search className="h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-sm font-medium">Sin resultados</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      No encontramos tipos que coincidan con &quot;{searchQuery}&quot;
                    </p>
                  </div>
                )}
              </ScrollArea>

              {removedCount > 0 && (
                <p className="text-xs font-medium text-destructive" role="status">
                  Se quitan {removedCount}: {removedTypes}
                </p>
              )}

              {selectedCount > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Seleccionados ({selectedCount})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRepairTypes.map((repairType) => (
                      <Badge key={repairType.id} variant="secondary" className="text-xs gap-1 pr-1">
                        {repairType.name}
                        <button
                          type="button"
                          onClick={() => handleToggle(repairType.id)}
                          className="ml-0.5 rounded-sm p-0.5 hover:bg-foreground/10 focus:outline-none focus:ring-1 focus:ring-ring"
                          aria-label={`Quitar ${repairType.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center border rounded-md">
              <Wrench className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium">Sin tipos de reparación</p>
              <p className="text-xs text-muted-foreground mt-1">No hay tipos de reparación disponibles</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 shrink-0">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={selectedCount === 0}>
            Guardar
            {selectedCount > 0 && (
              <span className="ml-1.5 text-xs opacity-80">
                · {selectedCount} {selectedCount === 1 ? 'tarea' : 'tareas'}
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
