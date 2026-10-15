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
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Logger } from '@/lib/logger';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  assignTemplateToSubType,
  getSubTypesForTemplateAssign,
  unassignTemplateFromSubType,
  type SubTypeForAssign,
} from '../actions/template-crud.server';

const logger = new Logger('TemplateAssignDialog');

// ============================================================================
// PROPS
// ============================================================================

interface TemplateAssignDialogProps {
  templateId: string;
  templateName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TemplateAssignDialog({ templateId, templateName, open, onOpenChange }: TemplateAssignDialogProps) {
  const queryClient = useQueryClient();

  // ─── State ────────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toUnassign, setToUnassign] = useState<Set<string>>(new Set());
  const [showConflictWarning, setShowConflictWarning] = useState(false);
  const [conflictSubTypes, setConflictSubTypes] = useState<SubTypeForAssign[]>([]);

  // ─── Fetch sub_types ──────────────────────────────────────────────────────
  const { data: subTypes = [], isLoading: isLoadingSubTypes } = useQuery({
    queryKey: ['sub-types-for-assign'],
    queryFn: () => getSubTypesForTemplateAssign(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  // ─── Mutation (assigns/unassigns sequentially) ────────────────────────────
  const { mutate: doAssign, isPending: isAssigning } = useMutation({
    mutationFn: async ({ subTypeIds, unassignIds }: { subTypeIds: string[]; unassignIds: string[] }) => {
      for (const subTypeId of subTypeIds) {
        await assignTemplateToSubType(subTypeId, templateId);
      }
      for (const subTypeId of unassignIds) {
        await unassignTemplateFromSubType(subTypeId);
      }
    },
    onSuccess: (_data, vars) => {
      logger.info('Template assignment updated successfully');
      const assigned = vars.subTypeIds.length;
      const unassigned = vars.unassignIds.length;
      if (assigned > 0 && unassigned > 0) {
        toast.success(
          `Plantilla "${templateName}" asignada a ${assigned} y desasignada de ${unassigned} subtipo${unassigned > 1 ? 's' : ''}`
        );
      } else if (assigned > 0) {
        toast.success(`Plantilla "${templateName}" asignada a ${assigned} subtipo${assigned > 1 ? 's' : ''}`);
      } else {
        toast.success(`Plantilla "${templateName}" desasignada de ${unassigned} subtipo${unassigned > 1 ? 's' : ''}`);
      }
      queryClient.invalidateQueries({ queryKey: ['tire-templates'] });
      queryClient.invalidateQueries({ queryKey: ['sub-types-for-assign'] });
      handleClose();
    },
    onError: (error) => {
      logger.error('Error updating template assignment', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al actualizar la asignación');
    },
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function getSubTypeLabel(subType: SubTypeForAssign): string {
    const typeName = subType.type_sub_type_typeTotype?.name;
    return typeName ? `${typeName} / ${subType.name}` : subType.name;
  }

  function handleClose() {
    setSelectedIds(new Set());
    setToUnassign(new Set());
    setShowConflictWarning(false);
    setConflictSubTypes([]);
    onOpenChange(false);
  }

  function toggleSubType(subType: SubTypeForAssign) {
    const hasSameTemplate = subType.tire_template_id === templateId;

    if (hasSameTemplate) {
      // Toggle the "unassign" intent for a currently-assigned subtype
      setToUnassign((prev) => {
        const next = new Set(prev);
        if (next.has(subType.id)) {
          next.delete(subType.id); // revert: keep assigned
        } else {
          next.add(subType.id); // mark for unassignment
        }
        return next;
      });
      return;
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(subType.id)) {
        next.delete(subType.id);
      } else {
        next.add(subType.id);
      }
      return next;
    });
  }

  function handleAssignClick() {
    if (selectedIds.size === 0 && toUnassign.size === 0) return;

    // Check if any selected sub_types have a different template
    const conflicts = subTypes.filter(
      (st) => selectedIds.has(st.id) && st.tire_template_id !== null && st.tire_template_id !== templateId
    );

    if (conflicts.length > 0) {
      setConflictSubTypes(conflicts);
      setShowConflictWarning(true);
      return;
    }

    doAssign({ subTypeIds: [...selectedIds], unassignIds: [...toUnassign] });
  }

  function handleConflictConfirm() {
    setShowConflictWarning(false);
    doAssign({ subTypeIds: [...selectedIds], unassignIds: [...toUnassign] });
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Asignar plantilla a subtipos</DialogTitle>
            <DialogDescription>
              Seleccioná los subtipos para asignarles la plantilla <strong>&quot;{templateName}&quot;</strong>. Los
              subtipos ya asignados pueden destildarse para desasignar la plantilla.
            </DialogDescription>
          </DialogHeader>

          {/* ─── SubType list ─────────────────────────────────────────── */}
          <div className="py-2">
            {isLoadingSubTypes ? (
              <div className="space-y-2 px-1">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-muted h-8 animate-pulse rounded" />
                ))}
              </div>
            ) : (
              <Command className="border rounded-md">
                <CommandInput placeholder="Buscar subtipo..." />
                <CommandList className="max-h-64">
                  <CommandEmpty>No se encontraron subtipos.</CommandEmpty>
                  <CommandGroup>
                    {subTypes.map((subType) => {
                      const isSelected = selectedIds.has(subType.id);
                      const hasSameTemplate = subType.tire_template_id === templateId;
                      const isMarkedForUnassign = toUnassign.has(subType.id);
                      const hasDiffTemplate =
                        subType.tire_template_id !== null && subType.tire_template_id !== templateId;

                      // A subtype with this template appears checked unless marked for unassignment
                      const isChecked = isSelected || (hasSameTemplate && !isMarkedForUnassign);

                      return (
                        <CommandItem
                          key={subType.id}
                          value={getSubTypeLabel(subType)}
                          onSelect={() => toggleSubType(subType)}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2">
                            <Checkbox checked={isChecked} className="shrink-0" />
                            <span
                              className={`font-medium ${isMarkedForUnassign ? 'line-through text-muted-foreground' : ''}`}
                            >
                              {getSubTypeLabel(subType)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {hasSameTemplate && !isMarkedForUnassign && (
                              <Badge variant="secondary" className="text-xs">
                                Ya asignada
                              </Badge>
                            )}
                            {hasSameTemplate && isMarkedForUnassign && (
                              <Badge variant="destructive" className="text-xs">
                                Desasignar
                              </Badge>
                            )}
                            {hasDiffTemplate && subType.tire_template && (
                              <Badge variant="outline" className="text-xs max-w-[120px] truncate">
                                {subType.tire_template.name}
                              </Badge>
                            )}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            )}
          </div>

          {/* ─── Selection count ────────────────────────────────────────── */}
          {(selectedIds.size > 0 || toUnassign.size > 0) && (
            <p className="text-sm text-muted-foreground">
              {selectedIds.size > 0 && <span>{selectedIds.size} por asignar</span>}
              {selectedIds.size > 0 && toUnassign.size > 0 && <span> · </span>}
              {toUnassign.size > 0 && <span>{toUnassign.size} por desasignar</span>}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={isAssigning}>
              Cancelar
            </Button>
            <Button
              onClick={handleAssignClick}
              disabled={(selectedIds.size === 0 && toUnassign.size === 0) || isAssigning}
            >
              {isAssigning ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Conflict confirmation dialog ─────────────────────────────────── */}
      <AlertDialog open={showConflictWarning} onOpenChange={setShowConflictWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar plantilla de subtipos?</AlertDialogTitle>
            <AlertDialogDescription>
              {conflictSubTypes.length === 1 ? (
                <>
                  El subtipo <strong>{getSubTypeLabel(conflictSubTypes[0])}</strong> ya tiene la plantilla{' '}
                  <strong>&quot;{conflictSubTypes[0].tire_template?.name}&quot;</strong>. Al cambiar, sus vehículos
                  generarán nuevas posiciones al ingresar a gomería.
                </>
              ) : (
                <>
                  {conflictSubTypes.length} subtipos ya tienen otra plantilla asignada. Al cambiar, sus vehículos
                  generarán nuevas posiciones al ingresar a gomería.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAssigning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConflictConfirm}
              disabled={isAssigning}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isAssigning ? 'Asignando...' : 'Cambiar plantilla'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
