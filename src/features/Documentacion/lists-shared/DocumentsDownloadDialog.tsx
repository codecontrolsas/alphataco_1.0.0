'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardDescription } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { downloadDocumentsZip } from './download-documents-zip';

/** Lo mínimo que se necesita de una fila de la lista (empleados o equipos). */
export interface DownloadableDocumentRow {
  id: string;
  isMissing: boolean;
  notApplicable?: boolean;
  document_path: string | null;
  period?: string | null;
  document_types?: { name: string } | null;
}

interface DocumentsDownloadDialogProps<Row extends DownloadableDocumentRow> {
  queryKey: readonly unknown[];
  /** Filas con los filtros ACTUALES de la lista (sin paginar). */
  fetchRows: () => Promise<Row[]>;
  /** Recurso para mostrar en el listado, ej. `Perez Juan` o el dominio. */
  getResourceLabel: (row: Row) => string;
  /** Recurso para el nombre del archivo dentro del ZIP, ej. `Perez_Juan`. */
  getFileResourceName: (row: Row) => string;
  zipFileName: string;
  /** Texto del botón; por defecto "Descargar Documentos". */
  triggerLabel?: string;
}

/** Botón + diálogo que descarga en un ZIP los documentos cargados de la lista (con sus filtros activos). */
export function DocumentsDownloadDialog<Row extends DownloadableDocumentRow>({
  queryKey,
  fetchRows,
  getResourceLabel,
  getFileResourceName,
  zipFileName,
  triggerLabel = 'Descargar Documentos',
}: DocumentsDownloadDialogProps<Row>) {
  const [open, setOpen] = useState(false);
  const { data: tableRows = [], isFetching, error } = useQuery({ queryKey, queryFn: fetchRows, enabled: open });
  const downloadableRows = tableRows.filter((row) => !row.isMissing && row.document_path && !row.notApplicable);
  const pendingRows = tableRows.filter((row) => row.isMissing);

  const describe = (row: Row) =>
    `${getResourceLabel(row)} (${row.document_types?.name ?? 'Documento'})${row.period ? ` - ${row.period}` : ''}`;

  const handleDownloadAll = async () => {
    const toastId = toast.loading('Descargando documentos...');
    try {
      const { added, failed } = await downloadDocumentsZip(
        downloadableRows.flatMap((row) =>
          row.document_path
            ? [
                {
                  id: row.id,
                  path: row.document_path,
                  baseName: `${getFileResourceName(row)}-(${row.document_types?.name ?? 'documento'})`,
                  period: row.period,
                },
              ]
            : []
        ),
        zipFileName
      );
      if (failed > 0) {
        toast.warning(`Se descargaron ${added} documentos; ${failed} no se pudieron descargar y se omitieron.`, {
          id: toastId,
        });
      } else {
        toast.success('Documentos descargados correctamente', { id: toastId });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al descargar documentos', { id: toastId });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Download className="h-4 w-4 mr-2" />
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isFetching
              ? 'Preparando documentos...'
              : `Descargar ${downloadableRows.length} ${downloadableRows.length === 1 ? 'documento' : 'documentos'}`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="max-h-[65vh] overflow-y-auto">
              {error && <p className="mb-2 text-destructive">{error.message}</p>}
              {pendingRows.length > 0 && (
                <Accordion type="single" collapsible className="mb-2">
                  <AccordionItem value="pending">
                    <AccordionTrigger className="text-destructive">
                      {pendingRows.length} {pendingRows.length === 1 ? 'documento faltante' : 'documentos faltantes'}{' '}
                      (no se descargarán)
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-2">
                        {pendingRows.map((row) => (
                          <Card className="p-2 border-destructive/30" key={row.id}>
                            <CardDescription>{describe(row)}</CardDescription>
                          </Card>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
              <Accordion type="single" collapsible>
                <AccordionItem value="downloadable">
                  <AccordionTrigger className="text-green-600">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      {downloadableRows.length}{' '}
                      {downloadableRows.length === 1 ? 'documento listo' : 'documentos listos'} para descargar
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-2 mt-2">
                      {downloadableRows.map((row) => (
                        <Card className="p-2 border-green-600/30" key={row.id}>
                          <CardDescription>{describe(row)}</CardDescription>
                        </Card>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDownloadAll} disabled={isFetching || downloadableRows.length === 0}>
            Descargar documentos
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
