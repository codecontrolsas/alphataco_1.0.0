'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { Logger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, CheckCircle2, Info, XCircle } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { processMassiveDiagramCreation, processMassiveNoveltyCreation } from './actions/diagram-massive-actions';
import type { ConflictData, MassiveFormData, ProcessingResult } from './types/massive-diagram';

const logger = new Logger('Diagrams/ConflictResolutionModal');

interface Props {
  conflicts: ConflictData;
  formData: MassiveFormData;
  onCancel: () => void;
  onProcessingComplete: (result: ProcessingResult) => void;
}

export function ConflictResolutionModal({ conflicts, formData, onCancel, onProcessingComplete }: Props) {
  const [processing, setProcessing] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { hasPermission } = usePermissions();

  const totalConflicts = conflicts.operationConflicts.length + conflicts.simpleConflicts.length;
  // Sobrescribir novedades existentes es una edición (`massive_diagram:update`); sin conflictos no se pisa nada.
  const canUpdate = hasPermission('empleados', 'massive_diagram', 'update');
  const canCreate = hasPermission('empleados', 'massive_diagram', 'create');
  const canContinue = canCreate && (totalConflicts === 0 || canUpdate);
  const conflictResolution = totalConflicts === 0 ? 'skip' : 'update';

  const handleContinue = async () => {
    setProcessing(true);

    try {
      if (!formData?.employeeIds?.length || !formData?.dateRange?.from || !formData?.dateRange?.to) {
        logger.error('formData missing required properties', { data: { formData } });
        toast.error('Error: Datos del formulario no disponibles');
        return;
      }

      // Fecha LOCAL elegida en el calendario: toISOString() la corría un día de noche (UTC-3)
      const dateFrom = moment(formData.dateRange.from).format('YYYY-MM-DD');
      const dateTo = moment(formData.dateRange.to).format('YYYY-MM-DD');

      const result =
        formData.mode === 'diagram'
          ? await processMassiveDiagramCreation({
              employeeIds: formData.employeeIds,
              workDiagramId: formData.workDiagramId,
              activeNoveltyId: formData.activeNoveltyId || '',
              dateFrom,
              dateTo,
              conflictResolution,
            })
          : await processMassiveNoveltyCreation({
              employeeIds: formData.employeeIds,
              diagramTypeId: formData.diagramTypeId,
              dateFrom,
              dateTo,
              conflictResolution,
            });

      queryClient.invalidateQueries({ queryKey: ['diagram-search'] });
      queryClient.invalidateQueries({ queryKey: ['diagram-reports-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
      router.refresh();
      onProcessingComplete(result);
      toast.success(
        formData.mode === 'diagram' ? 'Diagramas procesados correctamente' : 'Novedad cargada correctamente'
      );
    } catch (error) {
      logger.error('Error in creation', { data: { error } });
      // Se muestra el motivo que devolvió el servidor (tope de empleados, rango inválido, etc.)
      toast.error(error instanceof Error && error.message ? error.message : 'Error en la creación');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        {totalConflicts > 0 ? (
          <>
            <h2 className="text-2xl font-bold text-orange-600 mb-2 flex items-center justify-center space-x-2">
              <AlertTriangle className="w-6 h-6" />
              <span>Conflictos Detectados</span>
            </h2>
            <p className="text-muted-foreground">
              Se encontraron {totalConflicts} registros existentes que requieren atención
            </p>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-green-600 mb-2 flex items-center justify-center space-x-2">
              <CheckCircle className="w-6 h-6" />
              <span>Resumen de Creación</span>
            </h2>
            <p className="text-muted-foreground">
              Revisa el resumen de la operación y confirma para proceder con la creación de diagramas
            </p>
          </>
        )}
      </div>

      {/* Conflictos en operaciones (errores) */}
      {conflicts.operationConflicts.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="bg-red-50">
            <CardTitle className="text-red-700 flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Registros en Uso - NO se pueden modificar ({conflicts.operationConflicts.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Alert className="m-4 border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">
                Estos registros están siendo utilizados en operaciones y no pueden ser modificados. Se generarán como
                errores en el reporte final.
              </AlertDescription>
            </Alert>

            <div className="max-h-60 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Diagrama Actual</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conflicts.operationConflicts.map((conflict, index) => (
                    <TableRow key={index} className="bg-red-25">
                      <TableCell className="font-medium">{conflict.employee_name}</TableCell>
                      <TableCell>{conflict.date_formatted}</TableCell>
                      <TableCell>
                        {conflict.current_diagram_name ? (
                          <Badge
                            variant="outline"
                            style={{
                              backgroundColor: conflict.current_diagram_color || '#6b7280',
                              color: 'white',
                              borderColor: conflict.current_diagram_color || '#6b7280',
                            }}
                          >
                            {conflict.current_diagram_name}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-gray-600">
                            Diagrama existente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="flex items-center">
                          <XCircle className="w-4 h-4 mr-1" />
                          No se puede modificar
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conflictos simples (actualizables) */}
      {conflicts.simpleConflicts.length > 0 && (
        <Card className="border-yellow-200">
          <CardHeader className="bg-yellow-50">
            <CardTitle className="text-yellow-700 flex items-center space-x-2">
              <Info className="w-5 h-5" />
              <span>Registros Existentes - Se actualizarán ({conflicts.simpleConflicts.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Alert className="m-4 border-yellow-200 bg-yellow-50">
              <Info className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-700">
                Estos registros existen pero no están en uso. Se reemplazarán automáticamente con los nuevos valores de
                la carga masiva.
              </AlertDescription>
            </Alert>

            <div className="max-h-60 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Diagrama Actual</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conflicts.simpleConflicts.map((conflict, index) => (
                    <TableRow key={index} className="bg-yellow-25">
                      <TableCell className="font-medium">{conflict.employee_name}</TableCell>
                      <TableCell>{conflict.date_formatted}</TableCell>
                      <TableCell>
                        {conflict.current_diagram_name ? (
                          <Badge
                            variant="outline"
                            style={{
                              backgroundColor: conflict.current_diagram_color || '#6b7280',
                              color: 'white',
                              borderColor: conflict.current_diagram_color || '#6b7280',
                            }}
                          >
                            {conflict.current_diagram_name}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-gray-600">
                            Diagrama existente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-green-700 bg-green-100 flex items-center">
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Se actualizará
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resumen de la operación */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-700">Resumen de la Operación</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">
                {(() => {
                  const employeeCount = formData?.employeeIds?.length || 0;
                  const fromDate = formData?.dateRange?.from;
                  const toDate = formData?.dateRange?.to;

                  if (!fromDate || !toDate || employeeCount === 0) return 0;

                  const days = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                  const totalRecords = employeeCount * days;
                  const conflicts = totalConflicts || 0;

                  return Math.max(0, totalRecords - conflicts);
                })()}
              </div>
              <div className="text-sm text-muted-foreground">Nuevos registros</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">{conflicts?.simpleConflicts?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Actualizaciones</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{conflicts?.operationConflicts?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Errores</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600">
                {(() => {
                  const employeeCount = formData?.employeeIds?.length || 0;
                  const fromDate = formData?.dateRange?.from;
                  const toDate = formData?.dateRange?.to;

                  if (!fromDate || !toDate || employeeCount === 0) return 0;

                  const days = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                  return employeeCount * days;
                })()}
              </div>
              <div className="text-sm text-muted-foreground">Total</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Botones de acción */}
      <div className="flex justify-between space-x-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={processing} className="flex-1">
          Cancelar
        </Button>
        <Button type="button" onClick={handleContinue} disabled={processing || !canContinue} className="flex-1">
          {processing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Procesando...
            </>
          ) : (
            `Continuar (${conflicts.simpleConflicts.length} actualizaciones, ${conflicts.operationConflicts.length} errores)`
          )}
        </Button>
      </div>

      {/* Nota informativa */}
      <div className="text-sm text-muted-foreground text-center bg-gray-50 p-4 rounded">
        <p>
          <strong>Nota:</strong> Los registros marcados como en uso no se modificarán y aparecerán como errores en el
          reporte final. Los demás registros se procesarán normalmente.
        </p>
      </div>
    </div>
  );
}
