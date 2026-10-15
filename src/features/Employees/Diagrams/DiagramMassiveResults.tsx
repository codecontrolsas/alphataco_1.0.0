'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Logger } from '@/lib/logger';
import { MetricCard } from '@/shared/components/common/MetricCard';
import { argentinaDate, formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { ChevronDown, Download, RotateCcw } from 'lucide-react';
import moment from 'moment';
import type { ReactNode } from 'react';
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
    const timestamp = formatArgentinaDateTime(new Date());

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
      a.download = `reporte-diagramas-masivos-${argentinaDate()}.txt`;
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

  const summary = getSummary();

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div role="status" className="space-y-1">
        <h3 className="text-lg font-semibold">Carga terminada</h3>
        <p className="text-muted-foreground text-sm">
          {summary.total_errors === 0
            ? `Se procesaron ${summary.total_processed} ${summary.total_processed === 1 ? 'día' : 'días'} sin errores.`
            : `Se procesaron ${summary.total_processed} ${summary.total_processed === 1 ? 'día' : 'días'}; ${summary.total_errors} con error.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Creados" value={summary.total_created} hint="Novedades nuevas" tone="ok" />
        <MetricCard label="Actualizados" value={summary.total_updated} hint="Reemplazaron otra novedad" tone="brand" />
        <MetricCard
          label="Con error"
          value={summary.total_errors}
          hint="No se cargaron"
          tone={summary.total_errors > 0 ? 'danger' : 'default'}
        />
        <MetricCard label="Procesados" value={summary.total_processed} hint="Días evaluados" />
      </div>

      <div className="flex flex-col gap-3">
        <ResultGroup
          title="Con error"
          count={details.error_records.length}
          defaultOpen={details.error_records.length > 0}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo de error</TableHead>
                <TableHead>Descripción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {details.error_records.map((record, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{record.employee_name}</TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {record.date ? moment(record.date).format('DD/MM/YYYY') : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="destructive">{record.error_type}</Badge>
                  </TableCell>
                  <TableCell className="text-danger-subtle-foreground text-sm">{record.error_message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ResultGroup>

        <ResultGroup title="Creados" count={details.created_records.length}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Novedad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {details.created_records.map((record, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{record.employee_name || record.employee_id}</TableCell>
                  <TableCell className="font-mono tabular-nums">{moment(record.date).format('DD/MM/YYYY')}</TableCell>
                  <TableCell>
                    <NoveltyBadge name={record.novelty_name} color={record.novelty_color} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ResultGroup>

        <ResultGroup title="Actualizados" count={details.updated_records.length}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Antes</TableHead>
                <TableHead>Ahora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {details.updated_records.map((record, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{record.employee_name || record.employee_id}</TableCell>
                  <TableCell className="font-mono tabular-nums">{moment(record.date).format('DD/MM/YYYY')}</TableCell>
                  <TableCell>
                    <NoveltyBadge name={record.previous_novelty_name} color={record.previous_novelty_color} />
                  </TableCell>
                  <TableCell>
                    <NoveltyBadge name={record.novelty_name} color={record.novelty_color} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ResultGroup>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" className="min-h-10" onClick={downloadReport} disabled={downloading}>
          <Download aria-hidden="true" className="size-4" />
          {downloading ? 'Descargando…' : 'Descargar reporte (.txt)'}
        </Button>
        <Button type="button" variant="brand" className="min-h-10" onClick={onStartOver}>
          <RotateCcw aria-hidden="true" className="size-4" />
          Nueva carga
        </Button>
      </div>
    </div>
  );
}

/** Grupo plegable de resultados; sin filas no se puede abrir. */
function ResultGroup({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  if (count === 0) {
    return (
      <div className="text-muted-foreground flex min-h-11 items-center justify-between rounded-lg border px-4 text-sm">
        <span>{title}</span>
        <span className="tabular-nums">0</span>
      </div>
    );
  }

  return (
    <details open={defaultOpen} className="group rounded-lg border">
      <summary className="focus-visible:ring-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-4 text-sm font-medium outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <span className="tabular-nums">{count}</span>
          <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="max-h-80 overflow-auto border-t">{children}</div>
    </details>
  );
}

function NoveltyBadge({ name, color }: { name?: string | null; color?: string | null }) {
  if (!name) return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <Badge
      variant="outline"
      className="border-0 text-white"
      style={{ backgroundColor: color || 'var(--muted-foreground)' }}
    >
      {name}
    </Badge>
  );
}
