import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface WizardNavigationProps {
  currentStep: number;
  isLastStep: boolean;
  canAdvance: boolean;
  isSubmitting: boolean;
  isCurrentUserSupervisor: boolean | null;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}

/** Botones de navegación: pegados al borde inferior en móvil para no perderlos al scrollear. */
export function WizardNavigation({
  currentStep,
  isLastStep,
  canAdvance,
  isSubmitting,
  isCurrentUserSupervisor,
  onBack,
  onNext,
  onSubmit,
}: WizardNavigationProps) {
  return (
    <div className="sticky bottom-0 z-10 flex justify-between gap-3 rounded-b-xl bg-card p-4 max-lg:border-t">
      <Button
        type="button"
        variant="outline"
        className="h-12 flex-1 text-base lg:h-10 lg:flex-none lg:text-sm"
        onClick={onBack}
        disabled={currentStep === 0 || isSubmitting}
      >
        <ChevronLeft aria-hidden="true" className="mr-2 h-4 w-4" />
        Anterior
      </Button>

      {!isLastStep ? (
        <Button
          type="button"
          className="h-12 flex-1 text-base lg:h-10 lg:flex-none lg:text-sm"
          onClick={onNext}
          disabled={!canAdvance}
        >
          Siguiente
          <ChevronRight aria-hidden="true" className="ml-2 h-4 w-4" />
        </Button>
      ) : (
        <Button
          type="button"
          variant={isCurrentUserSupervisor ? 'success' : 'default'}
          className="h-12 flex-1 text-base lg:h-10 lg:flex-none lg:text-sm"
          onClick={onSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Enviando…' : isCurrentUserSupervisor ? 'Crear Pedido' : 'Enviar Solicitud'}
        </Button>
      )}
    </div>
  );
}
