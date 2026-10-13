'use client';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { FiscalDataOverview } from '../actions/fiscal-data.server';
import { deleteSalesPoint, setSalesPointActive } from '../actions/sales-points.server';
import { formatSalesPointNumber } from '../utils/format';
import { FiscalSection } from './FiscalSection';
import { SalesPointFormDialog } from './SalesPointFormDialog';

type SalesPoint = FiscalDataOverview['salesPoints'][number];

/** Clases escritas completas (Tailwind v4 no genera clases armadas en runtime). */
const STATUS_STYLES = {
  active: 'border-brand/30 bg-brand/10 text-brand-ink',
  inactive: 'bg-muted text-muted-foreground',
} as const;

type Confirmation = { kind: 'deactivate' | 'delete'; point: SalesPoint } | null;

/** ABM de puntos de venta. Pocos registros: tabla shadcn simple, no DataTable. */
export function SalesPointsSection({ salesPoints, canUpdate }: { salesPoints: SalesPoint[]; canUpdate: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // `undefined` = cerrado, `null` = alta, un punto = edición. Un solo Dialog para las dos.
  const [editing, setEditing] = useState<SalesPoint | null | undefined>(undefined);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const openConfirmation = (next: Confirmation) => {
    setConfirmError(null);
    setConfirmation(next);
  };

  const activate = (point: SalesPoint) => {
    startTransition(async () => {
      const result = await setSalesPointActive(point.id, true);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Punto de venta ${formatSalesPointNumber(point.number)} activado.`);
      router.refresh();
    });
  };

  const runConfirmation = () => {
    if (!confirmation) return;
    const { kind, point } = confirmation;
    const label = formatSalesPointNumber(point.number);
    startTransition(async () => {
      const result = kind === 'delete' ? await deleteSalesPoint(point.id) : await setSalesPointActive(point.id, false);
      if (!result.ok) {
        // Se queda abierto: el motivo (por ejemplo, que ya tiene comprobantes) se lee en el diálogo.
        setConfirmError(result.error);
        return;
      }
      toast.success(kind === 'delete' ? `Punto de venta ${label} eliminado.` : `Punto de venta ${label} desactivado.`);
      setConfirmation(null);
      router.refresh();
    });
  };

  const addButton = (
    <Button type="button" variant="brand" disabled={!canUpdate} onClick={() => setEditing(null)}>
      <Plus aria-hidden />
      Agregar punto de venta
    </Button>
  );

  return (
    <FiscalSection
      id="puntos-de-venta"
      title="Puntos de venta"
      description="Los que diste de alta en ARCA para factura electrónica por Web Services."
      action={salesPoints.length > 0 ? addButton : undefined}
    >
      {salesPoints.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border border-dashed p-6">
          <p className="text-muted-foreground text-sm text-pretty">
            Todavía no cargaste puntos de venta. Agregá el que diste de alta en ARCA para Web Services.
          </p>
          {addButton}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Número</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="w-28">Estado</TableHead>
              <TableHead className="w-36 text-right">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salesPoints.map((point) => {
              const label = formatSalesPointNumber(point.number);
              return (
                <TableRow key={point.id}>
                  <TableCell className="font-mono tabular-nums">{label}</TableCell>
                  <TableCell className="max-w-0 truncate" title={point.name}>
                    {point.name}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        'whitespace-nowrap',
                        point.is_active ? STATUS_STYLES.active : STATUS_STYLES.inactive
                      )}
                    >
                      {point.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={!canUpdate || pending}
                        aria-label={`Editar punto de venta ${label}`}
                        onClick={() => setEditing(point)}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      {point.is_active ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={!canUpdate || pending}
                          aria-label={`Desactivar punto de venta ${label}`}
                          onClick={() => openConfirmation({ kind: 'deactivate', point })}
                        >
                          <PowerOff aria-hidden />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={!canUpdate || pending}
                          aria-label={`Activar punto de venta ${label}`}
                          onClick={() => activate(point)}
                        >
                          <Power aria-hidden />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        disabled={!canUpdate || pending}
                        aria-label={`Eliminar punto de venta ${label}`}
                        onClick={() => openConfirmation({ kind: 'delete', point })}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {editing !== undefined && (
        <SalesPointFormDialog
          salesPoint={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            router.refresh();
          }}
        />
      )}

      <AlertDialog open={confirmation !== null} onOpenChange={(open) => !open && !pending && setConfirmation(null)}>
        <AlertDialogContent>
          {confirmation && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirmation.kind === 'delete' ? '¿Eliminar el punto de venta ' : '¿Desactivar el punto de venta '}
                  <span className="tabular-nums">{formatSalesPointNumber(confirmation.point.number)}</span>?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-pretty">
                  {confirmation.kind === 'delete'
                    ? 'Se borra de la configuración. Si ya tiene comprobantes no se puede eliminar: en ese caso, desactivalo.'
                    : 'No se va a poder elegir en facturas nuevas. Podés volver a activarlo cuando quieras.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {confirmError && (
                <p role="alert" className="text-destructive text-sm">
                  {confirmError}
                </p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
                {/* Botón común: AlertDialogAction cerraría el diálogo antes de saber si el server aceptó. */}
                <Button
                  type="button"
                  variant={confirmation.kind === 'delete' ? 'destructive' : 'default'}
                  disabled={pending}
                  onClick={runConfirmation}
                >
                  <LoadingSwap isLoading={pending}>
                    {confirmation.kind === 'delete' ? 'Eliminar punto de venta' : 'Desactivar punto de venta'}
                  </LoadingSwap>
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </FiscalSection>
  );
}
