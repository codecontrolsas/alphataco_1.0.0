'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Logger } from '@/lib/logger';
import { CheckCircle2, Download, RefreshCw, RotateCcw } from 'lucide-react';
import moment from 'moment';
import { useState } from 'react';
import { toast } from 'sonner';
import type {
  ErrorRecord,
  ProcessingResult,
  ProcessingResultRecord,
  UpdatedResultRecord,
} from './types/massive-diagram';

// Re-export for backward compatibility (DiagramMassive.tsx imports it from here)
export type { ProcessingResult };

const logger = new Logger('Diagrams/DiagramMassiveResults');

interface Props {
  results: ProcessingResult;
  onStartOver: () => void;
}

export function DiagramMassiveResults({ results, onStartOver }: Props) {
  const [downloading, setDownloading] = useState(false);

  //   {
  //     "summary": {
  //         "records_created": 0,
  //         "records_updated": 0,
  //         "records_skipped": 8,
  //         "records_error": 0,
  //         "total_processed": 8
  //     },
  //     "work_diagram_id": "5ab76fab-6f7f-4446-aa15-07e5a7e63b23",
  //     "active_novelty_id": "6e074fdd-6e7f-4386-9893-b3e43fb1c7fd",
  //     "inactive_novelty_id": "33e7a3cd-8c14-452b-8072-d3b727b3e404",
  //     "report": []
  // }

  // Función auxiliar para obtener el resumen
  const getSummary = () => {
    if (!results) return { total_created: 0, total_updated: 0, total_errors: 0, total_processed: 0 };

    return {
      total_created: results.summary.created_records,
      total_updated: results.summary.updated_records,
      total_errors: results.summary.errors_count || 0,
      total_processed: results.summary.processed_days,
    };
  };

  const getDetails = (): {
    created_records: ProcessingResultRecord[];
    updated_records: UpdatedResultRecord[];
    error_records: ErrorRecord[];
  } => {
    if (!results) return { created_records: [], updated_records: [], error_records: [] };
    return {
      created_records: results.data.created || [],
      updated_records: results.data.updated || [],
      error_records: results.errors || [],
    };
  };

  const details = getDetails();

  const generateTxtReport = () => {
    const timestamp = new Date().toLocaleString('es-ES');

    let report = `REPORTE DE CARGA MASIVA\n`;
    report += `Fecha y Hora: ${timestamp}\n`;
    report += `=====================================\n\n`;

    report += `RESUMEN EJECUTIVO:\n`;
    report += `- Total de registros procesados: ${summary.total_processed}\n`;
    report += `- Líneas creadas exitosamente: ${summary.total_created}\n`;
    report += `- Líneas actualizadas: ${summary.total_updated}\n`;
    report += `- Líneas con errores: ${summary.total_errors}\n`;
    report += `- Tiempo de procesamiento: ${results.summary?.processing_time_seconds?.toFixed(2) || 'N/A'} segundos\n\n`;

    if (details.created_records && details.created_records.length > 0) {
      report += `LÍNEAS CREADAS (${details.created_records.length}):\n`;
      report += `${'='.repeat(50)}\n`;
      details.created_records.forEach((record, index) => {
        const employeeName = record.employee_name || record.employee_id || 'N/A';
        const noveltyInfo = record.novelty_name ? ` - Novedad: ${record.novelty_name}` : '';
        report += `${(index + 1).toString().padStart(3, ' ')}. ${employeeName} - ${moment(record.date).format('DD/MM/YYYY')}${noveltyInfo}\n`;
      });
      report += `\n`;
    }

    if (details.updated_records && details.updated_records.length > 0) {
      report += `LÍNEAS ACTUALIZADAS (${details.updated_records.length}):\n`;
      report += `${'='.repeat(50)}\n`;
      details.updated_records.forEach((record, index) => {
        const employeeName = record.employee_name || record.employee_id || 'N/A';
        const previousNovelty = record.previous_novelty_name
          ? ` - Novedad Anterior: ${record.previous_novelty_name}`
          : '';
        const newNovelty = record.novelty_name ? ` - Novedad Nueva: ${record.novelty_name}` : '';
        report += `${(index + 1).toString().padStart(3, ' ')}. ${employeeName} - ${moment(record.date).format('DD/MM/YYYY')}${previousNovelty}${newNovelty}\n`;
      });
      report += `\n`;
    }

    if (details.error_records && details.error_records.length > 0) {
      report += `LÍNEAS CON ERRORES (${details.error_records.length}):\n`;
      report += `${'='.repeat(50)}\n`;
      details.error_records.forEach((record, index) => {
        const employeeName = record.employee_name || 'N/A';
        report += `${(index + 1).toString().padStart(3, ' ')}. ${employeeName} - ${record.date ? moment(record.date).format('DD/MM/YYYY') : 'N/A'}\n`;
        report += `     Tipo de Error: ${record.error_type}\n`;
        report += `     Descripción: ${record.error_message}\n`;
        report += `\n`;
      });
    }

    report += `\nFIN DEL REPORTE\n`;
    report += `Generado automáticamente por el sistema de gestión de diagramas\n`;

    return report;
  };

  const downloadReport = async () => {
    setDownloading(true);

    try {
      const report = generateTxtReport();
      const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-diagramas-masivos-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Reporte descargado correctamente');
    } catch (error) {
      logger.error('Error downloading report', { data: { error } });
      toast.error('Error al descargar el reporte');
    } finally {
      setDownloading(false);
    }
  };

  const getSuccessRate = () => {
    const summary = getSummary();
    const successfulRecords = summary.total_created + summary.total_updated;
    return summary.total_processed > 0 ? Math.round((successfulRecords / summary.total_processed) * 100) : 0;
  };

  const summary = getSummary();

  return (
    <div className="space-y-6">
      {/* Header con estado general */}
      <div className="text-center">
        <div className="flex items-center justify-center space-x-2 mb-2">
          {getSummary().total_errors === 0 ? (
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
          ) : (
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-yellow-600" />
            </div>
          )}
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Operación Completada</h2>
      </div>

      {/* Resumen visual con métricas */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen de Resultados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="text-3xl font-bold text-green-600">{summary.total_created}</div>
              <div className="text-sm text-green-700 font-medium">Creados</div>
              <div className="text-xs text-green-600 mt-1">Nuevos registros</div>
            </div>

            <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-3xl font-bold text-blue-600">{summary.total_updated}</div>
              <div className="text-sm text-blue-700 font-medium">Actualizados</div>
              <div className="text-xs text-blue-600 mt-1">Registros modificados</div>
            </div>

            <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="text-3xl font-bold text-red-600">{summary.total_errors}</div>
              <div className="text-sm text-red-700 font-medium">Errores</div>
              <div className="text-xs text-red-600 mt-1">Registros fallidos</div>
            </div>

            <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-3xl font-bold text-gray-600">{summary.total_processed}</div>
              <div className="text-sm text-gray-700 font-medium">Total</div>
              <div className="text-xs text-gray-600 mt-1">Registros procesados</div>
            </div>

            {/* {results.processing_time && (
              <div className="mt-4 text-center text-sm text-muted-foreground">
                Tiempo de procesamiento: {results.processing_time.toFixed(2)} segundos
              </div>
            )} */}
          </div>
        </CardContent>
      </Card>

      {/* Detalles por categoría */}
      <Card>
        <CardHeader>
          <CardTitle>Detalles de la Operación</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="created" className="w-full">
            <TabsList className="grid w-full grid-cols-3 m-4 mb-0">
              <TabsTrigger value="created" className="flex items-center space-x-2">
                <span>Creados</span>
                <Badge variant="secondary">{details.created_records.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="updated" className="flex items-center space-x-2">
                <span>Actualizados</span>
                <Badge variant="secondary">{details.updated_records.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="errors" className="flex items-center space-x-2">
                <span>Errores</span>
                <Badge variant="secondary">{details.error_records.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="created" className="mt-4">
              {details.created_records && details.created_records.length > 0 ? (
                <div className="max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empleado</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Novedad</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {details.created_records.map((record, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{record.employee_name || record.employee_id}</TableCell>
                          <TableCell>{moment(record.date).format('DD/MM/YYYY')}</TableCell>
                          <TableCell>
                            {record.novelty_name ? (
                              <Badge
                                variant="outline"
                                className="text-white border-0"
                                style={{ backgroundColor: record.novelty_color || '#6b7280' }}
                              >
                                {record.novelty_name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-green-100 text-green-700 flex items-center">
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Creado
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">No se crearon nuevos registros</div>
              )}
            </TabsContent>

            <TabsContent value="updated" className="mt-4">
              {details.updated_records && details.updated_records.length > 0 ? (
                <div className="max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empleado</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Novedad Anterior</TableHead>
                        <TableHead>Novedad Nueva</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {details.updated_records.map((record, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{record.employee_name || record.employee_id}</TableCell>
                          <TableCell>{moment(record.date).format('DD/MM/YYYY')}</TableCell>
                          <TableCell>
                            {record.previous_novelty_name ? (
                              <Badge
                                variant="outline"
                                className="text-white border-0"
                                style={{ backgroundColor: record.previous_novelty_color || '#6b7280' }}
                              >
                                {record.previous_novelty_name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {record.novelty_name ? (
                              <Badge
                                variant="outline"
                                className="text-white border-0"
                                style={{ backgroundColor: record.novelty_color || '#6b7280' }}
                              >
                                {record.novelty_name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-blue-100 text-blue-700 flex items-center">
                              <RefreshCw className="w-4 h-4 mr-1" />
                              Actualizado
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">No se actualizaron registros</div>
              )}
            </TabsContent>

            <TabsContent value="errors" className="mt-4">
              {details.error_records && details.error_records.length > 0 ? (
                <div className="max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empleado</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tipo de Error</TableHead>
                        <TableHead>Descripción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {details.error_records.map((record, index) => (
                        <TableRow key={index} className="bg-red-25">
                          <TableCell className="font-medium">{record.employee_name}</TableCell>
                          <TableCell>{record.date ? moment(record.date).format('DD/MM/YYYY') : 'N/A'}</TableCell>
                          <TableCell>
                            <Badge variant="destructive">{record.error_type}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-red-600">{record.error_message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">No se encontraron errores</div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Botones de acción */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Button
          type="button"
          onClick={downloadReport}
          disabled={downloading}
          className="flex-1 flex items-center justify-center space-x-2"
          variant="outline"
        >
          <Download className="w-4 h-4" />
          <span>{downloading ? 'Descargando...' : 'Descargar Reporte TXT'}</span>
        </Button>

        <Button type="button" onClick={onStartOver} className="flex-1 flex items-center justify-center space-x-2">
          <RotateCcw className="w-4 h-4" />
          <span>Nueva Carga Masiva</span>
        </Button>
      </div>

      {/* Nota informativa */}
      <div className="text-sm text-muted-foreground text-center bg-gray-50 p-4 rounded-lg">
        <p>
          <strong>Nota:</strong> El reporte TXT contiene todos los detalles de la operación incluyendo empleados, fechas
          y tipos de error específicos para revisión manual.
        </p>
      </div>
    </div>
  );
}
