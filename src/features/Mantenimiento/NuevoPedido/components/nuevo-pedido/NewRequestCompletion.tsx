import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MaintenanceStatusPill } from '@/features/Mantenimiento/shared/components/MaintenanceStatusPill';
import { CheckCircle } from 'lucide-react';
import type { NewRequestCompletion as Completion } from '../../hooks/useNewRequestState';

interface NewRequestCompletionProps {
  completion: Completion;
  successRedirectUrl?: string;
  onGoToEquipment: (url: string) => void;
  onLoadAnother: () => void;
}

/** Pantalla final: dice QUÉ se registró (con números) y deja al operario decidir cómo seguir. */
export function NewRequestCompletion({
  completion,
  successRedirectUrl,
  onGoToEquipment,
  onLoadAnother,
}: NewRequestCompletionProps) {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-ok-subtle text-ok-subtle-foreground">
          <CheckCircle aria-hidden="true" className="size-8" />
        </span>
        <h2 className="text-2xl font-semibold text-balance">
          {completion.createdByCurrentSupervisor ? 'Pedido creado' : 'Solicitud enviada'}
        </h2>
        <p className="text-base text-muted-foreground text-pretty">
          {completion.createdByCurrentSupervisor
            ? 'Pedido de mantenimiento creado exitosamente. Lo cargó el supervisor, así que no necesita validación.'
            : 'El supervisor debe aprobarla antes de que pase a Pedidos.'}
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-4">
          {completion.equipmentLabel && (
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Equipo</p>
              <p className="truncate font-mono text-base font-semibold">{completion.equipmentLabel}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-muted-foreground">Registrado</p>
            <p className="text-base font-semibold tabular-nums">
              {completion.itemCount} {completion.itemNoun}
            </p>
          </div>
          <div>
            <p className="mb-1 text-sm text-muted-foreground">
              {completion.createdByCurrentSupervisor ? 'Estado inicial del pedido' : 'Estado inicial de la solicitud'}
            </p>
            {completion.createdByCurrentSupervisor ? (
              <MaintenanceStatusPill entity="order" status="pending_scheduling" />
            ) : (
              <MaintenanceStatusPill entity="request" status="pending_approval" />
            )}
          </div>
          {completion.supervisorName && (
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Supervisor</p>
              <p className="truncate text-base font-semibold">{completion.supervisorName}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {successRedirectUrl && (
          <Button type="button" className="h-12 w-full text-base" onClick={() => onGoToEquipment(successRedirectUrl)}>
            Volver al equipo
          </Button>
        )}
        <Button type="button" variant="outline" className="h-12 w-full text-base" onClick={onLoadAnother}>
          Cargar otro pedido
        </Button>
      </div>
    </div>
  );
}
