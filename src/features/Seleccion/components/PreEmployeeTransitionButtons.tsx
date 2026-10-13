'use client';

import { Button } from '@/components/ui/button';
import { Logger } from '@/lib/logger';
import { CheckCircle2, RotateCcw, Send, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { reopenPreEmployee, submitPreEmployee } from '../actions/pre-employee-actions.server';
import type { PreEmployeeTransition, PreEmployeeTransitionAction } from '../lib/state-machine';

const logger = new Logger('PreLegajos/TransitionButtons');

const ACTION_ICONS: Record<PreEmployeeTransitionAction, React.ReactNode> = {
  submit: <Send className="h-4 w-4" />,
  reject: <XCircle className="h-4 w-4" />,
  reopen: <RotateCcw className="h-4 w-4" />,
  approve: <CheckCircle2 className="h-4 w-4" />,
};

interface PreEmployeeTransitionButtonsProps {
  preEmployeeId: string;
  /** Ya vienen filtradas por estado actual y permisos del usuario. */
  transitions: PreEmployeeTransition[];
  onReject: () => void;
  onApprove: () => void;
}

/**
 * Botones de cambio de estado. Se derivan de la máquina de estados: no hay condiciones
 * de tipo "si status === X && puede Y" repartidas por la UI.
 */
export function PreEmployeeTransitionButtons({
  preEmployeeId,
  transitions,
  onReject,
  onApprove,
}: PreEmployeeTransitionButtonsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PreEmployeeTransitionAction | null>(null);

  if (transitions.length === 0) return null;

  const runTransition = async (action: PreEmployeeTransitionAction) => {
    // Rechazo y aprobación abren su propio formulario (motivo / datos laborales)
    if (action === 'reject') return onReject();
    if (action === 'approve') return onApprove();

    setPendingAction(action);
    try {
      if (action === 'submit') {
        await submitPreEmployee(preEmployeeId);
        toast.success('El candidato pasó a pre ingreso');
      } else {
        await reopenPreEmployee(preEmployeeId);
        toast.success('El candidato volvió a estar en proceso');
      }
      router.refresh();
    } catch (error) {
      logger.error('Error al cambiar el estado del candidato', { data: { error, action, preEmployeeId } });
      toast.error(error instanceof Error ? error.message : 'No se pudo cambiar el estado');
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <>
      {transitions.map((transition) => (
        <Button
          key={transition.action}
          variant={transition.action === 'reject' ? 'outline' : 'default'}
          onClick={() => runTransition(transition.action)}
          disabled={pendingAction !== null}
          className={transition.action === 'reject' ? 'text-danger-subtle-foreground border-danger/40' : undefined}
        >
          {ACTION_ICONS[transition.action]}
          {pendingAction === transition.action ? 'Procesando…' : transition.label}
        </Button>
      ))}
    </>
  );
}
