'use client';

import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { SplitLayout } from '@/shared/components/common/SplitLayout';
import type { Control } from 'react-hook-form';
import { useOrderChecklist } from '../hooks/useOrderChecklist';
import type { PreparteFormController } from '../hooks/usePreparteFormController';
import type { PreparteItem } from '../schemas/preparte-form';
import { OrderSummaryAside } from './OrderSummaryAside';
import { CustomerContractSection } from './preparte-form/CustomerContractSection';
import { ItemsSection } from './preparte-form/ItemsSection';
import { LocationSection } from './preparte-form/LocationSection';
import type { Cliente } from '../types/entities';

/** Barra inferior fija de la variante página: faltantes, cancelar y crear. */
function PageSubmitBar({
  control,
  isSubmitting,
  submitDisabled,
  onCancel,
}: {
  control: Control<PreparteItem>;
  isSubmitting: boolean;
  submitDisabled: boolean;
  onCancel: () => void;
}) {
  const missing = useOrderChecklist(control).filter((entry) => !entry.done).length;
  const blocked = isSubmitting || submitDisabled;

  return (
    <div className="bg-background/90 sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t py-3 backdrop-blur-sm">
      <p aria-live="polite" className="text-muted-foreground text-sm">
        {missing > 0 ? (
          <>
            Faltan <span className="text-foreground font-medium tabular-nums">{missing}</span>{' '}
            {missing === 1 ? 'dato obligatorio' : 'datos obligatorios'}
          </>
        ) : (
          'Todo listo para crear el pedido'
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={blocked}>
          Cancelar
        </Button>
        <Button type="submit" disabled={blocked} data-testid="guardar-preparte-button">
          {isSubmitting ? 'Creando...' : 'Crear pedido'}
        </Button>
      </div>
    </div>
  );
}

interface PreparteFormPageLayoutProps {
  controller: PreparteFormController;
  clientes: Cliente[];
  isEditing: boolean;
  submitDisabled: boolean;
  onCancel: () => void;
}

/** Variante página del formulario de pedido: secciones en tarjetas, resumen lateral y barra de guardado. */
export function PreparteFormPageLayout({ controller, clientes, isEditing, submitDisabled, onCancel }: PreparteFormPageLayoutProps) {
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
    setShowItemChangeReason,
    setSelectedFile,
    isSubmitting,
    submitHandler,
  } = controller;

  return (
    <Form {...form}>
      <form onSubmit={submitHandler} className="space-y-6">
        <SplitLayout
          main={
            <>
              <SectionCard title="Cliente y contrato" description="Define qué servicios se pueden pedir.">
                <CustomerContractSection
                  form={form}
                  clientes={clientes}
                  contratos={contratos}
                  isEditing={isEditing}
                  isLoading={isLoading}
                  isLoadingContratos={isLoadingContratos}
                  variant="page"
                />
              </SectionCard>

              <SectionCard title="Ubicación en el cliente" description="Dónde se presta el servicio.">
                <LocationSection
                  form={form}
                  clientes={clientes}
                  isEditing={isEditing}
                  isLoading={isLoading}
                  sectorList={sectorList}
                  areaList={areaList}
                  equipmentList={equipmentList}
                  isLoadingSectors={isLoadingSectors}
                  isLoadingAreas={isLoadingAreas}
                  isLoadingEquipments={isLoadingEquipments}
                  variant="page"
                />
              </SectionCard>

              <SectionCard
                title="Ítems, fechas y jornada"
                description="Cada ítem lleva su jornada, tipo, fechas y observaciones."
              >
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
                  variant="page"
                />
              </SectionCard>

              <SectionCard
                title="Imagen y observaciones"
                description="Adjuntá el pedido del cliente. Las observaciones se cargan en cada ítem."
              >
                <div className="space-y-2">
                  <Label htmlFor="preparte-attachment">Documento adjunto (imagen o PDF)</Label>
                  <Input
                    id="preparte-attachment"
                    type="file"
                    accept="image/*,application/pdf"
                    className="bg-background"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    data-testid="archivo-adjunto-input"
                  />
                  <p className="text-muted-foreground text-xs">Es opcional. Se adjunta a todos los pedidos creados.</p>
                </div>
              </SectionCard>
            </>
          }
          aside={
            <OrderSummaryAside
              control={form.control}
              clientes={clientes}
              contratos={contratos}
              contractItems={contractItems}
            />
          }
        />

        <PageSubmitBar
          control={form.control}
          isSubmitting={isSubmitting}
          submitDisabled={submitDisabled}
          onCancel={onCancel}
        />
      </form>
    </Form>
  );
}
