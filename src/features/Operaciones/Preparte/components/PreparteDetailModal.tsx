'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { formatArgentinaDateTime } from '@/features/Treasury/lib/today';
import { Field, FieldGrid } from '@/shared/components/common/FieldGrid';
import { ArrowRight, Check, EyeIcon, FileText, History, User } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useState } from 'react';
import { usePreparteChangeLogs } from '../hooks';
import { PreparteStatusBadge, formatPreparteType } from '../list/columns';
import { Cliente, Contrato, PreparteItem } from './PreparteManager';

interface PreparteDetailModalProps {
  preparteData: PreparteItem;
  Customers: Cliente[];
  contratos: Contrato[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}

export function PreparteDetailModal({
  preparteData,
  Customers,
  contratos,
  open,
  onOpenChange,
  showTrigger = true,
}: PreparteDetailModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setIsOpen = onOpenChange ?? setInternalOpen;

  // Solo fetchea cuando el modal está abierto
  const { data: changeLogs = [], isLoading: isLoadingChangeLogs } = usePreparteChangeLogs(preparteData?.id, isOpen);

  if (!preparteData) return null;

  const formatDate = (dateString: string | Date | null | undefined) =>
    dateString ? moment.utc(dateString).format('DD/MM/YYYY') : null;

  // Buscar cliente por ID
  const cliente = Customers.find((c) => c.id === preparteData.cliente_id);

  // Buscar contrato por ID
  const contrato = contratos.find((c) => c.id === preparteData.contrato_id);

  // Obtener nombre del item del JOIN (service_items viene resuelto de la query)
  const getItemName = () => {
    return preparteData.service_items?.item_name || 'No especificado';
  };

  // Obtener sector
  const getSectorName = () => {
    const sectorServiceId = preparteData.sector_service_id;
    if (!sectorServiceId) return 'No especificado';

    return preparteData.service_sectors?.sectors?.name || 'No especificado';
  };

  // Obtener área
  const getAreaName = () => {
    const areaServiceId = preparteData.areas_service_id;
    if (!areaServiceId) return 'No especificado';

    return preparteData.service_areas?.areas_cliente?.nombre || 'No especificado';
  };

  // Obtener equipos del cliente
  const getEquiposCliente = () => {
    if (!preparteData.equipos_cliente) return [];
    const catalogItem = cliente?.equipos_clientes?.find((item) => item.id === preparteData.equipos_cliente);
    return [
      {
        name: preparteData.equipos_clientes?.name || catalogItem?.name || 'Equipo no encontrado',
        type: 'No especificado',
        id: preparteData.equipos_cliente,
      },
    ];
  };

  // Determinar si hay motivo de cancelación, rechazo o reprogramación
  // Siempre se renderiza el banner cuando el estado lo requiere — si el motivo
  // no está cargado, se muestra "Sin motivo registrado"
  const getReason = () => {
    const { status, cancel_reason, rejected_reason, reprogram_reason } = preparteData;
    const fallback = 'Sin motivo registrado';

    if (status === 'cancelado') {
      return {
        title: 'Motivo de cancelación',
        content: cancel_reason?.trim() || fallback,
        actorLabel: 'Cancelado por',
        actor: preparteData.cancelled_by_profile?.fullname?.trim() || null,
      };
    } else if (status === 'rechazado') {
      return {
        title: 'Motivo de rechazo',
        content: rejected_reason?.trim() || fallback,
        actorLabel: 'Rechazado por',
        actor: preparteData.rejected_by_profile?.fullname?.trim() || null,
      };
    } else if (status === 'reprogramado') {
      return {
        title: 'Motivo de reprogramación',
        content: reprogram_reason?.trim() || fallback,
        actorLabel: 'Reprogramado por',
        actor: preparteData.reprogrammed_by_profile?.fullname?.trim() || null,
      };
    } else if (status === 'vencido') {
      return {
        title: 'Vencimiento',
        content: 'Este pedido venció sin ser confirmado a tiempo.',
        actorLabel: null,
        actor: null,
      };
    }

    return null;
  };

  const reason = getReason();
  const equipos = getEquiposCliente();
  const executionLabel =
    preparteData.subject_to_availability && !preparteData.executionDate
      ? 'Pendiente de fecha'
      : formatDate(preparteData.executionDate);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Ver detalle del pedido">
            <EyeIcon className="size-4" />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="gap-3">
          <div className="space-y-1">
            <DialogTitle className="text-xl">
              Pedido{' '}
              <span className="font-mono tabular-nums">{preparteData.numero_pedido || 'sin número'}</span>
            </DialogTitle>
            <DialogDescription>{cliente?.name || 'Cliente no especificado'}</DialogDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PreparteStatusBadge status={preparteData.status} />
            {preparteData.tipo && <Badge variant="secondary">{formatPreparteType(preparteData.tipo)}</Badge>}
            {preparteData.confirmed_by && (
              <Badge variant="success">
                <Check aria-hidden="true" />
                Confirmado por {preparteData.confirmed_by}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {reason && (
            <Alert variant={preparteData.status === 'vencido' ? 'destructive' : 'warning'}>
              <FileText />
              <AlertTitle>{reason.title}</AlertTitle>
              <AlertDescription>
                <p>{reason.content}</p>
                {reason.actor && reason.actorLabel && (
                  <p className="mt-1 flex items-center gap-1.5">
                    <span className="font-medium">{reason.actorLabel}:</span>
                    <Link
                      href={`/dashboard/configuration?subtab=users&company-users__search=${encodeURIComponent(
                        reason.actor
                      )}`}
                      className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                      title="Ver usuario en la tabla de usuarios"
                    >
                      <User className="size-3.5" aria-hidden="true" />
                      {reason.actor}
                    </Link>
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Fechas y jornada</h3>
            <FieldGrid>
              <Field label="Fecha de solicitud" value={formatDate(preparteData.requestDate)} mono />
              <Field label="Fecha de ejecución" value={executionLabel} mono={Boolean(preparteData.executionDate)} />
              <Field label="Jornada" value={preparteData.jornada} />
              <Field label="Hora de inicio" value={preparteData.start_time} mono />
              <Field label="Hora de fin" value={preparteData.end_time} mono />
            </FieldGrid>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Servicio</h3>
            <FieldGrid>
              <Field label="Contrato" value={contrato?.service_name} />
              <Field label="Ítem" value={getItemName()} />
              <Field label="Cantidad" value={preparteData.quantity != null ? String(preparteData.quantity) : null} mono />
              <Field label="Sector" value={getSectorName()} />
              <Field label="Área" value={getAreaName()} />
              <Field label="Equipo del cliente" value={equipos.map((equipo) => equipo.name).join(', ') || null} />
              <Field label="Solicitante" value={preparteData.solicitante} />
            </FieldGrid>
            {preparteData.observaciones && (
              <div className="space-y-1">
                <p className="text-muted-foreground text-sm">Observaciones</p>
                <p className="text-sm whitespace-pre-line">{preparteData.observaciones}</p>
              </div>
            )}
          </section>

          {preparteData.preparteImage && (
            <>
              <Separator />
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Adjunto</h3>
                <div className="bg-muted/40 flex justify-center rounded-lg border p-3">
                  {preparteData.preparteImage.toLowerCase().includes('.pdf') ? (
                    <iframe
                      src={preparteData.preparteImage}
                      title="Documento adjunto del pedido"
                      className="h-[300px] w-full"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preparteData.preparteImage}
                      alt="Adjunto del pedido"
                      className="max-h-[300px] max-w-full object-contain"
                    />
                  )}
                </div>
              </section>
            </>
          )}

          {(isLoadingChangeLogs || changeLogs.length > 0) && (
            <>
              <Separator />
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <History className="text-muted-foreground size-4" aria-hidden="true" />
                  Historial de cambios
                </h3>
                {isLoadingChangeLogs ? (
                  <div className="space-y-4 border-l pl-4">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-4 w-56" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <ol className="space-y-4 border-l pl-4">
                    {changeLogs.map((log, index) => {
                      const metadata = log.metadata as Record<string, string | number | boolean | null> | null;
                      const oldItemName = metadata?.old_item_name || log.old_value;
                      const newItemName = metadata?.new_item_name || log.new_value;
                      const changedAt = log.changed_at ? formatArgentinaDateTime(log.changed_at) : 'Fecha no disponible';

                      return (
                        <li key={log.id || index} className="relative space-y-1 text-sm">
                          <span
                            aria-hidden="true"
                            className="bg-brand ring-background absolute top-1.5 -left-[21px] size-2 rounded-full ring-4"
                          />
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="font-medium">Cambio de {log.field_name}</span>
                            <span className="text-muted-foreground font-mono text-xs tabular-nums">
                              {changedAt}
                              {log.changed_by_name && <span className="font-sans"> · {log.changed_by_name}</span>}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-danger-subtle-foreground line-through">{String(oldItemName)}</span>
                            <ArrowRight className="text-muted-foreground size-3.5" aria-label="pasó a" />
                            <span className="text-ok-subtle-foreground font-medium">{String(newItemName)}</span>
                          </div>
                          {log.reason && (
                            <p className="text-muted-foreground">
                              <span className="text-foreground font-medium">Motivo:</span> {log.reason}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
