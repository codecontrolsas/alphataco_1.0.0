'use client';

import { useClothingContext } from '@/app/clothing/clothing-layout-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { EmployeeForDelivery } from '@/features/Clothing/ClothingDelivery/actions/queries.server';
import { getDeliveryWarehouses, getEmployeeForDeliveryById } from '@/features/Clothing/ClothingDelivery/actions/queries.server';
import { StepAddItems, type WizardItem } from '@/features/Clothing/ClothingDelivery/components/StepAddItems';
import { StepConfirm } from '@/features/Clothing/ClothingDelivery/components/StepConfirm';
import { StepDeliveryType } from '@/features/Clothing/ClothingDelivery/components/StepDeliveryType';
import { StepSelectEmployee } from '@/features/Clothing/ClothingDelivery/components/StepSelectEmployee';
import { StepSignature } from '@/features/Clothing/ClothingDelivery/components/StepSignature';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Briefcase, CheckCircle2, Package, Pen, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const logger = new Logger('Clothing/DeliveryWizard');

// ============================================================================
// TYPES
// ============================================================================

type WizardData = {
  employee: EmployeeForDelivery | null;
  deliveryType: string | null;
  /** Deposito elegido (Almacenes etapa 5). Si la empresa tiene uno solo, se usa ese sin elegir. */
  warehouseId: string | null;
  items: WizardItem[];
  signatureUrl: string | null;
  notes: string;
};

const INITIAL_DATA: WizardData = {
  employee: null,
  deliveryType: null,
  warehouseId: null,
  items: [{ clothingItemId: '', itemName: '', quantity: 1, hasCertificate: false }],
  signatureUrl: null,
  notes: '',
};

// ============================================================================
// STEPS DEFINITION
// ============================================================================

const STEPS = [
  { title: 'Empleado', description: 'Seleccionar destinatario', Icon: User },
  { title: 'Tipo', description: 'Tipo de entrega', Icon: Briefcase },
  { title: 'Artículos', description: 'Artículos a entregar', Icon: Package },
  { title: 'Firma', description: 'Firma del empleado', Icon: Pen },
  { title: 'Confirmar', description: 'Revisar y confirmar', Icon: CheckCircle2 },
] as const;

// ============================================================================
// VALIDATION
// ============================================================================

function validateStep(step: number, data: WizardData, warehouseId: string | null): string | null {
  switch (step) {
    case 0:
      if (!data.employee) return 'Debe seleccionar un empleado para continuar.';
      return null;
    case 1:
      if (!data.deliveryType) return 'Debe seleccionar el tipo de entrega.';
      return null;
    case 2: {
      const validItems = data.items.filter((i) => i.clothingItemId);
      if (validItems.length === 0) return 'Debe agregar al menos un artículo.';
      if (!warehouseId) return 'Elegí el depósito del que sale la entrega.';
      // El stock se lleva por artículo + marca + talle (Almacenes etapa 5).
      if (validItems.some((i) => !i.clothingBrandId || !i.clothingSizeId)) {
        return 'Cada artículo tiene que tener marca y talle.';
      }
      return null;
    }
    case 3:
      if (!data.signatureUrl) return 'Debe registrar la firma del empleado para continuar.';
      return null;
    default:
      return null;
  }
}

// ============================================================================
// STEPPER (Desktop sidebar)
// ============================================================================

function DesktopStepper({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="Pasos del asistente" className="space-y-1">
      {STEPS.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const { Icon } = step;

        return (
          <div
            key={index}
            className={cn(
              'flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors',
              isCurrent && 'bg-primary/10',
              isCompleted && 'opacity-70'
            )}
          >
            {/* Step indicator */}
            <div
              className={cn(
                'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold border-2 mt-0.5',
                isCurrent && 'border-primary bg-primary text-primary-foreground',
                isCompleted && 'border-green-500 bg-green-500 text-white',
                !isCurrent && !isCompleted && 'border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
            </div>
            <div className="min-w-0">
              <p
                className={cn(
                  'text-sm font-medium leading-none mb-0.5',
                  isCurrent ? 'text-primary' : isCompleted ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {step.title}
              </p>
              <p className="text-xs text-muted-foreground truncate">{step.description}</p>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

// ============================================================================
// MOBILE STEP INDICATOR
// ============================================================================

function MobileStepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-between lg:hidden mb-4">
      <span className="text-sm font-medium text-muted-foreground">
        Paso {currentStep + 1} de {STEPS.length}
      </span>
      <div className="flex gap-1">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i < currentStep
                ? 'w-4 bg-green-500'
                : i === currentStep
                  ? 'w-6 bg-primary'
                  : 'w-1.5 bg-muted-foreground/20'
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN WIZARD
// ============================================================================

interface DeliveryWizardProps {
  initialEmployeeId?: string;
  onComplete?: () => void;
}

export function DeliveryWizard({ initialEmployeeId, onComplete }: DeliveryWizardProps) {
  const { companyId } = useClothingContext();
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: warehouses = [], isLoading: loadingWarehouses } = useQuery({
    queryKey: ['clothing-delivery-warehouses', companyId],
    queryFn: () => getDeliveryWarehouses(),
    staleTime: 5 * 60_000,
  });
  // Derivado: con un solo deposito no hace falta elegir.
  const warehouseId = data.warehouseId ?? (warehouses.length === 1 ? warehouses[0]!.id : null);
  const warehouseName = warehouses.find((w) => w.id === warehouseId)?.name ?? null;

  const updateWarehouse = useCallback((id: string) => {
    setData((prev) => ({ ...prev, warehouseId: id }));
    setValidationError(null);
  }, []);

  // Pre-load employee from URL param
  useEffect(() => {
    if (!initialEmployeeId || data.employee) return;

    getEmployeeForDeliveryById(initialEmployeeId).then((employee) => {
      if (employee) {
        setData((prev) => ({ ...prev, employee }));
        setCurrentStep(1);
        logger.info('Employee pre-loaded from URL', { data: { employeeId: initialEmployeeId } });
      }
    });
  }, [initialEmployeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLastStep = currentStep === STEPS.length - 1;

  // Derived data updates
  const updateEmployee = useCallback((employee: EmployeeForDelivery | null) => {
    setData((prev) => ({ ...prev, employee }));
    setValidationError(null);
  }, []);

  const updateDeliveryType = useCallback((deliveryType: string) => {
    setData((prev) => ({ ...prev, deliveryType }));
    setValidationError(null);
  }, []);

  const updateItems = useCallback((items: WizardItem[]) => {
    setData((prev) => ({ ...prev, items }));
    setValidationError(null);
  }, []);

  const updateSignatureUrl = useCallback((signatureUrl: string) => {
    setData((prev) => ({ ...prev, signatureUrl }));
    setValidationError(null);
  }, []);

  const clearSignature = useCallback(() => {
    setData((prev) => ({ ...prev, signatureUrl: null }));
    setValidationError(null);
  }, []);

  const updateNotes = useCallback((notes: string) => {
    setData((prev) => ({ ...prev, notes }));
  }, []);

  const handleReset = useCallback(() => {
    setData(INITIAL_DATA);
    setCurrentStep(0);
    setValidationError(null);
    onComplete?.();
  }, [onComplete]);

  const handleNext = useCallback(() => {
    const error = validateStep(currentStep, data, warehouseId);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    logger.debug('Advancing step', { data: { from: currentStep, to: currentStep + 1 } });
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, [currentStep, data, warehouseId]);

  const handleBack = useCallback(() => {
    setValidationError(null);
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  const currentStepContent = useMemo(() => {
    switch (currentStep) {
      case 0:
        return <StepSelectEmployee value={data.employee} onChange={updateEmployee} />;
      case 1:
        return <StepDeliveryType value={data.deliveryType} onChange={updateDeliveryType} />;
      case 2:
        return (
          <StepAddItems
            companyId={companyId}
            items={data.items}
            onChange={updateItems}
            warehouses={warehouses}
            loadingWarehouses={loadingWarehouses}
            warehouseId={warehouseId}
            onWarehouseChange={updateWarehouse}
          />
        );
      case 3:
        return (
          <StepSignature
            signatureUrl={data.signatureUrl}
            onSave={updateSignatureUrl}
            onClear={clearSignature}
          />
        );
      case 4:
        return data.employee && data.deliveryType && warehouseId ? (
          <StepConfirm
            employee={data.employee}
            deliveryType={data.deliveryType}
            warehouseId={warehouseId}
            warehouseName={warehouseName}
            items={data.items.filter((i) => i.clothingItemId)}
            signatureUrl={data.signatureUrl}
            notes={data.notes}
            onNotesChange={updateNotes}
            onReset={handleReset}
          />
        ) : null;
      default:
        return null;
    }
  }, [
    currentStep,
    companyId,
    data,
    warehouses,
    loadingWarehouses,
    warehouseId,
    warehouseName,
    updateWarehouse,
    updateEmployee,
    updateDeliveryType,
    updateItems,
    updateSignatureUrl,
    clearSignature,
    updateNotes,
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Registrar Entrega</h1>
        <p className="text-sm text-muted-foreground">
          Complete los pasos para registrar una entrega de indumentaria o EPP.
        </p>
      </div>

      {/* Mobile step indicator */}
      <MobileStepIndicator currentStep={currentStep} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: Desktop Stepper */}
        <Card className="hidden lg:block lg:col-span-1 h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Progreso</CardTitle>
          </CardHeader>
          <CardContent>
            <DesktopStepper currentStep={currentStep} />
          </CardContent>
        </Card>

        {/* Right: Step content */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {(() => {
                const { Icon } = STEPS[currentStep];
                return <Icon className="h-4 w-4 text-primary" />;
              })()}
              {STEPS[currentStep].title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Step content */}
            {currentStepContent}

            {/* Validation error */}
            {validationError && (
              <p className="text-sm text-destructive font-medium rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
                {validationError}
              </p>
            )}

            {/* Navigation — hidden on last step (confirm has its own button) */}
            {!isLastStep && (
              <div className="flex justify-between pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={currentStep === 0}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button type="button" onClick={handleNext} className="gap-2">
                  Siguiente
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Back button on last step */}
            {isLastStep && (
              <div className="flex justify-start pt-2">
                <Button type="button" variant="ghost" onClick={handleBack} className="gap-2 text-muted-foreground">
                  <ArrowLeft className="h-4 w-4" />
                  Volver
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
