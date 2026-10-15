'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { statusColorVar } from '@/features/Dashboard/shared/charts/ChartColorVars';
import { cn } from '@/lib/utils';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { useQuery } from '@tanstack/react-query';
import { toPng } from 'html-to-image';
import { Download, Loader2 } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { getServicesDetailByClient } from '../actions/services.server';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hoy en hora argentina (`YYYY-MM-DD`), calculado en el servidor: el navegador puede estar en otra zona. */
  initialDate: string;
}

/** `YYYY-MM-DD` → Date local a medianoche (no pasa por UTC, así el día no se corre). */
function isoToLocalDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Punto de color + cifra: el significado lo da el encabezado de la columna, no sólo el color. */
function CountBadge({ count, color, strong }: { count: number; color: string; strong?: boolean }) {
  return (
    <Badge variant="outline" className={cn('gap-1.5 tabular-nums', strong && 'font-bold')}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {count}
    </Badge>
  );
}

const formatStatus = (status: string) =>
  status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

export default function ServicesDetailDialog({ open, onOpenChange, initialDate }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => isoToLocalDate(initialDate));
  const [isExporting, setIsExporting] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  // Sin fecha válida (campo vacío o a medio escribir) no se consulta.
  const dateString = selectedDate ? moment(selectedDate).format('YYYY-MM-DD') : null;
  const longDate = selectedDate ? moment(selectedDate).locale('es').format('DD [de] MMMM [de] YYYY') : null;

  const {
    data: servicesDetail,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['services-detail-by-client', dateString],
    queryFn: () => getServicesDetailByClient(dateString ?? undefined),
    enabled: open && dateString !== null,
  });

  const totalMensual = servicesDetail?.reduce((sum, c) => sum + c.mensual_count, 0) ?? 0;
  const totalAdicional = servicesDetail?.reduce((sum, c) => sum + c.adicional_count, 0) ?? 0;
  const grandTotal = servicesDetail?.reduce((sum, c) => sum + c.total_count, 0) ?? 0;

  const handleExportImage = useCallback(async () => {
    if (!captureRef.current || !dateString) return;

    // Use flushSync to force React to re-render synchronously BEFORE we
    // capture. The JSX conditionally removes overflow classes when isExporting
    // is true, so html-to-image's DOM clone won't have them.
    flushSync(() => setIsExporting(true));

    // Wait one frame so the browser applies the layout without overflow constraints
    await new Promise((r) => requestAnimationFrame(r));

    try {
      const node = captureRef.current;

      // After overflow constraints are removed, the node's dimensions reflect
      // the true content size. Add padding (32px each side) to the canvas.
      const pad = 32;
      const fullWidth = node.scrollWidth + pad * 2;
      const fullHeight = node.scrollHeight + pad * 2;

      const dataUrl = await toPng(node, {
        // Mismo fondo que la pantalla: en modo oscuro un fondo blanco fijo dejaría el texto claro ilegible.
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        pixelRatio: 2,
        width: fullWidth,
        height: fullHeight,
        style: {
          padding: `${pad}px`,
          overflow: 'visible',
        },
      });

      const filename = `servicios-por-cliente-${dateString}-${grandTotal}-servicios.png`;

      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();
    } catch {
      toast.error('No se pudo generar la imagen. Intente nuevamente.');
    } finally {
      setIsExporting(false);
    }
  }, [dateString, grandTotal]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-dashboard-colors=""
        className={cn('sm:max-w-4xl', !isExporting && 'max-h-[80vh] overflow-y-auto')}
      >
        <DialogHeader>
          <DialogTitle>Detalle de servicios por cliente</DialogTitle>
          <DialogDescription>Distribución detallada de servicios mensuales y adicionales por cliente</DialogDescription>
        </DialogHeader>

        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <label htmlFor="services-detail-date" className="text-sm font-medium text-muted-foreground">
              Fecha:
            </label>
            <EnhancedDatePicker
              id="services-detail-date"
              date={selectedDate}
              setDate={setSelectedDate}
              className="w-[200px]"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportImage}
            disabled={isExporting || isLoading || !servicesDetail?.length}
          >
            {isExporting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            Descargar imagen
          </Button>
        </div>

        {/* Capturable content — this div is what gets exported as image */}
        <div ref={captureRef}>
          {/* Title + description — hidden on screen, visible only in exported image */}
          <div className={isExporting ? 'mb-2' : 'hidden'}>
            <h3 className="text-lg font-semibold">Detalle de servicios por cliente</h3>
            <p className="text-sm text-muted-foreground">
              Distribucion detallada de servicios mensuales y adicionales por cliente
            </p>
          </div>

          {/* Date header for the image export */}
          <div className="mb-3 text-sm font-medium text-muted-foreground">Fecha: {longDate ?? '—'}</div>

          {dateString === null ? (
            <StateBlock
              variant="empty"
              title="Elegí una fecha válida"
              description="Escribila como DD/MM/AAAA o abrí el calendario."
            />
          ) : isError ? (
            <StateBlock
              variant="error"
              title="No se pudo cargar el detalle de servicios"
              action={
                <Button type="button" variant="outline" onClick={() => refetch()}>
                  Reintentar
                </Button>
              }
            />
          ) : isLoading ? (
            <CardContent className="p-0">
              <div className="space-y-3">
                <div className="grid grid-cols-5 gap-4 pb-2 border-b">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20 mx-auto" />
                  <Skeleton className="h-4 w-20 mx-auto" />
                  <Skeleton className="h-4 w-12 mx-auto" />
                  <Skeleton className="h-4 w-16 mx-auto" />
                </div>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-5 gap-4 py-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-8 mx-auto rounded-full" />
                    <Skeleton className="h-6 w-8 mx-auto rounded-full" />
                    <Skeleton className="h-6 w-8 mx-auto rounded-full" />
                    <div className="flex gap-1 justify-center">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          ) : (
            <div className={isExporting ? '' : 'overflow-x-auto'}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-center">Mensuales</TableHead>
                    <TableHead className="text-center">Adicionales</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Estados</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(servicesDetail?.length ?? 0) > 0 ? (
                    <>
                      {servicesDetail?.map((client, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{client.client_name}</TableCell>
                          <TableCell className="text-center">
                            <CountBadge count={client.mensual_count} color={statusColorVar('operational')} />
                          </TableCell>
                          <TableCell className="text-center">
                            <CountBadge count={client.adicional_count} color={statusColorVar('inUse')} />
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="default">{client.total_count}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-wrap gap-1 justify-center">
                              {client.status_distribution.map((status, idx) => (
                                <Badge
                                  key={idx}
                                  variant="outline"
                                  className="text-xs"
                                  title={`${formatStatus(status.status)}: ${status.count} servicios`}
                                >
                                  {formatStatus(status.status)}: {status.count}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Total row */}
                      <TableRow className="font-semibold border-t-2">
                        <TableCell className="font-bold">TOTAL GENERAL</TableCell>
                        <TableCell className="text-center">
                          <CountBadge count={totalMensual} color={statusColorVar('operational')} strong />
                        </TableCell>
                        <TableCell className="text-center">
                          <CountBadge count={totalAdicional} color={statusColorVar('inUse')} strong />
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="default" className="font-bold tabular-nums">
                            {grandTotal}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">—</TableCell>
                      </TableRow>
                    </>
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No hay servicios con cliente (mensuales o adicionales, pendientes o ejecutados) para esta fecha
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
