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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/features/Mantenimiento/shared/components/SearchableSelect';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Layers, Search, Wrench, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getMaintenanceTaskGroupsWithRepairTypes } from '../actions/queries.server';

const NONE_GROUP_VALUE = '__none__';

interface AddItemDialogProps {
  open: boolean;
  onClose: () => void;
  repairTypes: Array<{ id: string; name: string }>;
  onAdd: (description: string, repairTypeIds: string[]) => void;
}

export function AddItemDialog({ open, onClose, repairTypes, onAdd }: AddItemDialogProps) {
  const [description, setDescription] = useState('');
  const [selectedRepairTypeIds, setSelectedRepairTypeIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>(NONE_GROUP_VALUE);

  const { data: groups, isLoading: isLoadingGroups } = useQuery({
    queryKey: ['maintenance-task-groups-with-repair-types'],
    queryFn: () => getMaintenanceTaskGroupsWithRepairTypes(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const filteredRepairTypes = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) return repairTypes;
    return repairTypes.filter((rt) => rt.name.toLowerCase().includes(normalized));
  }, [repairTypes, searchQuery]);

  const selectedRepairTypes = useMemo(
    () =>
      selectedRepairTypeIds
        .map((id) => repairTypes.find((rt) => rt.id === id))
        .filter((rt): rt is { id: string; name: string } => rt !== undefined),
    [selectedRepairTypeIds, repairTypes]
  );

  const selectedGroup = useMemo(() => groups?.find((g) => g.id === selectedGroupId), [groups, selectedGroupId]);

  const handleToggleRepairType = (repairTypeId: string) => {
    setSelectedRepairTypeIds((prev) =>
      prev.includes(repairTypeId) ? prev.filter((id) => id !== repairTypeId) : [...prev, repairTypeId]
    );
  };

  const handleClearSelection = () => {
    setSelectedRepairTypeIds([]);
    setSelectedGroupId(NONE_GROUP_VALUE);
  };

  const handleSelectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    if (groupId === NONE_GROUP_VALUE) return;
    const group = groups?.find((g) => g.id === groupId);
    if (!group) return;
    const availableIds = new Set(repairTypes.map((rt) => rt.id));
    const groupRepairTypeIds = group.repairTypes.map((rt) => rt.id).filter((id) => availableIds.has(id));
    setSelectedRepairTypeIds((prev) => {
      const next = new Set(prev);
      groupRepairTypeIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
    if (groupRepairTypeIds.length === 0) {
      toast.info('El grupo no tiene tareas disponibles para esta orden');
    } else if (groupRepairTypeIds.length < group.repairTypes.length) {
      const omitted = group.repairTypes.length - groupRepairTypeIds.length;
      toast.info(`Se cargaron ${groupRepairTypeIds.length} tareas (${omitted} no disponibles para esta orden)`);
    }
  };

  const handleSubmit = () => {
    if (!description.trim()) {
      toast.error('La descripción es requerida');
      return;
    }
    onAdd(description.trim(), selectedRepairTypeIds);
    handleClose();
  };

  const handleClose = () => {
    setDescription('');
    setSelectedRepairTypeIds([]);
    setSearchQuery('');
    setSelectedGroupId(NONE_GROUP_VALUE);
    onClose();
  };

  const totalCount = repairTypes.length;
  const selectedCount = selectedRepairTypeIds.length;
  const filteredCount = filteredRepairTypes.length;
  const groupsAvailable = (groups?.length ?? 0) > 0;

  // Opciones del combobox: "Sin grupo" primero y el resto con el conteo de tareas.
  // Se puede buscar tambien por el nombre de las tareas del grupo, que es lo que
  // el supervisor suele recordar.
  const groupOptions = useMemo(
    () => [
      { value: NONE_GROUP_VALUE, label: 'Sin grupo' },
      ...(groups ?? []).map((group) => ({
        value: group.id,
        label: group.repairTypes.length > 0 ? `${group.name} (${group.repairTypes.length})` : group.name,
        keywords: group.repairTypes.map((type) => type.name ?? '').join(' '),
      })),
    ],
    [groups]
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Agregar Reparación</DialogTitle>
          <DialogDescription>Agregar una reparación extra a la orden de mantenimiento</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 flex-1 overflow-y-auto min-h-0">
          <div className="space-y-2">
            <Label htmlFor="repair-description">
              Descripción <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="repair-description"
              placeholder="Describa brevemente la reparación a realizar"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2" htmlFor="task-group">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Grupo de tareas (opcional)
            </Label>
            <p className="text-xs text-muted-foreground">
              Al elegir un grupo se tildan automáticamente sus tareas. Podés destildar las que no quieras cargar.
            </p>
            {isLoadingGroups ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <SearchableSelect
                id="task-group"
                value={selectedGroupId}
                onValueChange={handleSelectGroup}
                disabled={!groupsAvailable}
                options={groupOptions}
                placeholder={groupsAvailable ? 'Seleccionar un grupo de tareas' : 'No hay grupos disponibles'}
                searchPlaceholder="Buscar grupo o tarea..."
                emptyMessage="No se encontro el grupo"
              />
            )}
            {selectedGroup?.description && (
              <p className="text-xs text-muted-foreground italic">{selectedGroup.description}</p>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  Tipos de reparación
                </Label>
                <p className="text-xs text-muted-foreground">Seleccione las tareas a realizar (opcional)</p>
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
                        const isSelected = selectedRepairTypeIds.includes(repairType.id);
                        return (
                          <div
                            key={repairType.id}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors',
                              isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/50'
                            )}
                            onClick={() => handleToggleRepairType(repairType.id)}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleRepairType(repairType.id)}
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

                {selectedCount > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Seleccionados ({selectedCount})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedRepairTypes.map((repairType) => (
                        <Badge key={repairType.id} variant="secondary" className="text-xs gap-1 pr-1">
                          {repairType.name}
                          <button
                            type="button"
                            onClick={() => handleToggleRepairType(repairType.id)}
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
        </div>

        <DialogFooter className="gap-2 shrink-0">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!description.trim()}>
            Agregar
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
