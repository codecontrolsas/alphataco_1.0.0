'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileX, Plus, UserMinus, UserPlus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { verifyDocumentTypeConsistency } from '../actions/consistency.server';
import { _VerifyDocumentsSkeleton } from './_VerifyDocumentsSkeleton';

// ============================================================================
// CONSTANTS & PROPS
// ============================================================================

const MAX_DISPLAY_ROWS = 20;

interface VerifyDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentTypeId: string;
  documentTypeName: string;
  applies: 'Persona' | 'Equipos';
  isSpecial: boolean;
}

// ============================================================================
// MAIN COMPONENT — diagnóstico de sólo lectura
// ============================================================================

export function _VerifyDocumentsDialog({
  open,
  onOpenChange,
  documentTypeId,
  documentTypeName,
  applies,
  isSpecial,
}: VerifyDocumentsDialogProps) {
  const {
    data: result,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['verify-document-consistency', documentTypeId],
    queryFn: () => verifyDocumentTypeConsistency(documentTypeId),
    enabled: open && !!documentTypeId,
    staleTime: 0,
    retry: false,
  });

  const resourceLabel = applies === 'Persona' ? 'empleados' : 'equipos';
  const MissingIcon = applies === 'Persona' ? UserPlus : Plus;
  const NotApplicableIcon = applies === 'Persona' ? UserMinus : FileX;

  const hasFindings = result && (result.stats.missing > 0 || result.stats.notApplicableWithDocument > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Verificación de documentos</DialogTitle>
          <DialogDescription>Diagnóstico de &ldquo;{documentTypeName}&rdquo; (sólo lectura)</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {isLoading && <_VerifyDocumentsSkeleton />}

          {error && !isLoading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <AlertTriangle className="h-12 w-12 text-destructive" />
              <h3 className="text-lg font-semibold">Error al verificar</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                {error instanceof Error ? error.message : 'Error desconocido'}
              </p>
              <Button variant="outline" onClick={() => refetch()}>
                Reintentar
              </Button>
            </div>
          )}

          {result && !isLoading && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {isSpecial
                  ? `Este tipo se exige sólo a los ${resourceLabel} que cumplen sus condiciones.`
                  : `Este tipo se exige a todos los ${resourceLabel} que le corresponden.`}{' '}
                Hoy aplica a <strong>{result.stats.applicable}</strong> de {result.stats.totalResources} {resourceLabel}
                ; <strong>{result.stats.withDocument}</strong> ya tienen el documento cargado.
              </p>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-1">
                  {result.stats.applicable} aplican
                </Badge>
                <Badge variant="outline" className="gap-1">
                  {result.stats.withDocument} con documento
                </Badge>
                {result.stats.missing > 0 && (
                  <Badge variant="outline" className="border-amber-500 text-amber-700 gap-1">
                    <MissingIcon className="h-3.5 w-3.5" />
                    {result.stats.missing} faltantes
                  </Badge>
                )}
                {result.stats.notApplicableWithDocument > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <NotApplicableIcon className="h-3.5 w-3.5" />
                    {result.stats.notApplicableWithDocument} documentos que ya no aplican
                  </Badge>
                )}
              </div>

              {!hasFindings && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <h3 className="text-lg font-semibold">Todo en orden</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    {result.mandatory
                      ? `Los ${result.stats.applicable} ${resourceLabel} a los que aplica ya tienen el documento cargado.`
                      : 'Este tipo no es obligatorio: no genera faltantes.'}
                  </p>
                </div>
              )}

              {result.stats.missing > 0 && (
                <Card className="border-l-4 border-l-amber-500 border-dashed">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Documentos faltantes</CardTitle>
                    <CardDescription>
                      Estos {resourceLabel} deben tener el documento y todavía no lo cargaron. Se resuelve subiendo el
                      documento desde la lista de documentos.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {result.applies === 'Persona' && (
                      <EmployeeTable data={result.missing} maxRows={MAX_DISPLAY_ROWS} total={result.stats.missing} />
                    )}
                    {result.applies === 'Equipos' && (
                      <EquipmentTable data={result.missing} maxRows={MAX_DISPLAY_ROWS} total={result.stats.missing} />
                    )}
                  </CardContent>
                </Card>
              )}

              {result.stats.notApplicableWithDocument > 0 && (
                <Card className="border-l-4 border-l-muted-foreground/40 border-dashed">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Documentos que ya no aplican</CardTitle>
                    <CardDescription>
                      Estos {resourceLabel} tienen un documento cargado de este tipo pero ya no cumplen sus condiciones.
                      El documento se conserva como historial y no cuenta para el estado documental.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {result.applies === 'Persona' && (
                      <EmployeeTable
                        data={result.notApplicable}
                        maxRows={MAX_DISPLAY_ROWS}
                        total={result.stats.notApplicableWithDocument}
                      />
                    )}
                    {result.applies === 'Equipos' && (
                      <EquipmentTable
                        data={result.notApplicable}
                        maxRows={MAX_DISPLAY_ROWS}
                        total={result.stats.notApplicableWithDocument}
                      />
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// TABLAS SIMPLES
// ============================================================================

function EmployeeTable({
  data,
  maxRows,
  total,
}: {
  data: { id: string; file_number: string | null; lastname: string; firstname: string }[];
  maxRows: number;
  total: number;
}) {
  const displayed = data.slice(0, maxRows);
  const remaining = total - displayed.length;

  return (
    <div className="text-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Legajo</th>
            <th className="pb-2 pr-4 font-medium">Apellido</th>
            <th className="pb-2 font-medium">Nombre</th>
          </tr>
        </thead>
        <tbody>
          {displayed.map((emp) => (
            <tr key={emp.id} className="border-b last:border-0">
              <td className="py-1.5 pr-4 tabular-nums">{emp.file_number ?? '-'}</td>
              <td className="py-1.5 pr-4">{emp.lastname}</td>
              <td className="py-1.5">{emp.firstname}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {remaining > 0 && <p className="mt-2 text-xs text-muted-foreground">y {remaining} mas...</p>}
    </div>
  );
}

function EquipmentTable({
  data,
  maxRows,
  total,
}: {
  data: {
    id: string;
    domain: string | null;
    intern_number: string | null;
    brand: string | null;
    type: string | null;
  }[];
  maxRows: number;
  total: number;
}) {
  const displayed = data.slice(0, maxRows);
  const remaining = total - displayed.length;

  return (
    <div className="text-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Dominio</th>
            <th className="pb-2 pr-4 font-medium">N. Interno</th>
            <th className="pb-2 pr-4 font-medium">Marca</th>
            <th className="pb-2 font-medium">Tipo</th>
          </tr>
        </thead>
        <tbody>
          {displayed.map((veh) => (
            <tr key={veh.id} className="border-b last:border-0">
              <td className="py-1.5 pr-4">{veh.domain ?? '-'}</td>
              <td className="py-1.5 pr-4">{veh.intern_number ?? '-'}</td>
              <td className="py-1.5 pr-4">{veh.brand ?? '-'}</td>
              <td className="py-1.5">{veh.type ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {remaining > 0 && <p className="mt-2 text-xs text-muted-foreground">y {remaining} mas...</p>}
    </div>
  );
}
