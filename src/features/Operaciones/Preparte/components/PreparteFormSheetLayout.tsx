'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Building, Loader2 } from 'lucide-react';
import type { PreparteFormController } from '../hooks/usePreparteFormController';
import type { Cliente } from '../types/entities';
import { CustomerContractSection } from './preparte-form/CustomerContractSection';
import { ItemsSection } from './preparte-form/ItemsSection';
import { LocationSection } from './preparte-form/LocationSection';

interface PreparteFormSheetLayoutProps {
  controller: PreparteFormController;
  clientes: Cliente[];
  isEditing: boolean;
  onCancel: () => void;
}

/** Variante compacta del formulario de pedido (la del Sheet de edición). */
export function PreparteFormSheetLayout({ controller, clientes, isEditing, onCancel }: PreparteFormSheetLayoutProps) {
  const {
    form,
    contratos,
    contractItems,
    isLoading,
    isLoadingContratos,
    isLoadingItems,
    sectorList,
    areaList,
    equipmentList,
    isLoadingSectors,
    isLoadingAreas,
    isLoadingEquipments,
    selectedItems,
    setSelectedItems,
    handleAddItem,
    originalItemId,
    showItemChangeReason,
    setShowItemChangeReason,
    setSelectedFile,
    isSubmitting,
    submitHandler,
  } = controller;

  return (
    <div className=" gap-4 space-y-4 rounded-lg dark:bg-slate-900 bg-slate-50 p-4 w-full">
      <Form {...form}>
        <form onSubmit={submitHandler} className="space-y-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building className="h-4 w-4" />
              Datos del Cliente
            </h4>
            <CustomerContractSection
              form={form}
              clientes={clientes}
              contratos={contratos}
              isEditing={isEditing}
              isLoading={isLoading}
              isLoadingContratos={isLoadingContratos}
            />

            <LocationSection
              form={form}
              clientes={clientes}
              isEditing={isEditing}
              sectorList={sectorList}
              areaList={areaList}
              equipmentList={equipmentList}
              isLoadingSectors={isLoadingSectors}
              isLoadingAreas={isLoadingAreas}
              isLoadingEquipments={isLoadingEquipments}
            />

            <ItemsSection
              form={form}
              contractItems={contractItems}
              isEditing={isEditing}
              isLoading={isLoading}
              isLoadingItems={isLoadingItems}
              selectedItems={selectedItems}
              setSelectedItems={setSelectedItems}
              handleAddItem={handleAddItem}
              originalItemId={originalItemId}
              setShowItemChangeReason={setShowItemChangeReason}
            />

            {/* Campo de motivo de cambio de item (solo visible cuando se cambia el item en edición) */}
            {isEditing && showItemChangeReason && (
              <FormField
                control={form.control}
                name="item_change_reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-amber-600">Motivo del cambio de ítem *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Ingrese el motivo por el cual se está cambiando el ítem..."
                        className="min-h-[80px] bg-background border-amber-300"
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Este cambio quedará registrado en el historial del pedido.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Imagen del pedido - No usa FormField porque es manejado localmente */}
            {isEditing ? (
              <div className="space-y-2">
                <FormLabel>
                  {`Cambiar imagen del pedido${form?.watch('numero_pedido') ? ` (aplica a todo el N° ${form.watch('numero_pedido')})` : ''}`}
                </FormLabel>
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  className="bg-background"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <FormLabel>Documento adjunto (Imagen o PDF)</FormLabel>
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  className="bg-background"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  data-testid="archivo-adjunto-input"
                />
              </div>
            )}

            <div className="flex justify-end space-x-4 pt-4">
              <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} data-testid="guardar-preparte-button">
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" aria-hidden="true" />
                    {isEditing ? 'Actualizando...' : 'Guardando...'}
                  </>
                ) : isEditing ? (
                  'Actualizar'
                ) : (
                  'Guardar'
                )}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
