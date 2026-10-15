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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Logger } from '@/lib/logger';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { revokeExternalApiClient, rotateExternalApiClientSecret } from '../actions.server';
import type { CreatedExternalApiClient } from '../types';
import { SecretRevealPanel } from './SecretRevealPanel';

const logger = new Logger('AccesosExternos/ExternalAccessActionsCell');

interface ExternalAccessActionsCellProps {
  id: string;
  name: string;
  revokedAt: Date | null;
  canUpdate: boolean;
  canDelete: boolean;
}

/**
 * Acciones de un acceso externo: rotar la clave o revocarlo.
 *
 * Un acceso revocado no ofrece acciones: no se reactiva, se crea uno nuevo.
 */
export function ExternalAccessActionsCell({
  id,
  name,
  revokedAt,
  canUpdate,
  canDelete,
}: ExternalAccessActionsCellProps) {
  const queryClient = useQueryClient();
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [rotatedClient, setRotatedClient] = useState<CreatedExternalApiClient | null>(null);
  const [hasCopiedSecret, setHasCopiedSecret] = useState(false);
  const [showCloseGuard, setShowCloseGuard] = useState(false);

  if (revokedAt) {
    return <span className="text-xs text-muted-foreground">Revocado el {formatArgentinaDay(revokedAt)}</span>;
  }

  const handleRotate = async () => {
    setIsWorking(true);
    try {
      const rotated = await rotateExternalApiClientSecret(id);
      setRotatedClient(rotated);
      setShowRotateConfirm(false);
      toast.success('Clave rotada correctamente');
      queryClient.invalidateQueries({ queryKey: ['external-api-clients'] });
    } catch (error) {
      logger.error('Error al rotar la clave', { data: { error, id } });
      toast.error('No se pudo rotar la clave');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRevoke = async () => {
    setIsWorking(true);
    try {
      await revokeExternalApiClient(id);
      setShowRevokeConfirm(false);
      toast.success('Acceso revocado');
      queryClient.invalidateQueries({ queryKey: ['external-api-clients'] });
    } catch (error) {
      logger.error('Error al revocar el acceso', { data: { error, id } });
      toast.error('No se pudo revocar el acceso');
    } finally {
      setIsWorking(false);
    }
  };

  const closeRotatedPanel = () => {
    setRotatedClient(null);
    setHasCopiedSecret(false);
    setShowCloseGuard(false);
  };

  return (
    <div className="flex items-center gap-1">
      {canUpdate && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowRotateConfirm(true)}>
          <KeyRound className="mr-1 h-3.5 w-3.5" />
          Rotar clave
        </Button>
      )}
      {canDelete && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setShowRevokeConfirm(true)}
        >
          <Ban className="mr-1 h-3.5 w-3.5" />
          Revocar
        </Button>
      )}

      <AlertDialog open={showRotateConfirm} onOpenChange={setShowRotateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotar la clave de {name}</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a generar una clave nueva. La clave actual deja de funcionar apenas confirmes, así que asegurate de
              poder actualizarla en el sistema externo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isWorking}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleRotate();
              }}
              disabled={isWorking}
            >
              {isWorking ? 'Generando...' : 'Rotar clave'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRevokeConfirm} onOpenChange={setShowRevokeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revocar el acceso de {name}</AlertDialogTitle>
            <AlertDialogDescription>
              El sistema externo deja de poder consultar información de inmediato. Esta acción no se puede deshacer: si
              hace falta volver a integrarlo, se crea un acceso nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isWorking}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleRevoke();
              }}
              disabled={isWorking}
            >
              {isWorking ? 'Revocando...' : 'Revocar acceso'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* La clave rotada se muestra con el mismo panel y el mismo resguardo que el alta */}
      <Dialog
        open={rotatedClient !== null}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          if (!hasCopiedSecret) {
            setShowCloseGuard(true);
            return;
          }
          closeRotatedPanel();
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Clave nueva de {name}</DialogTitle>
            <DialogDescription>El usuario no cambia: solo hay que actualizar la clave.</DialogDescription>
          </DialogHeader>
          {rotatedClient && (
            <SecretRevealPanel
              clientId={rotatedClient.clientId}
              secret={rotatedClient.secret}
              onSecretCopied={() => setHasCopiedSecret(true)}
            />
          )}
          <DialogFooter>
            <Button type="button" onClick={() => (hasCopiedSecret ? closeRotatedPanel() : setShowCloseGuard(true))}>
              Listo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCloseGuard} onOpenChange={setShowCloseGuard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Ya copiaste la clave?</AlertDialogTitle>
            <AlertDialogDescription>
              Una vez que cierres esta ventana no vas a poder volver a verla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={closeRotatedPanel}>Sí, ya la copié</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
