'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Logger } from '@/lib/logger';
import { argentinaDate, formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';
import { ChevronDown, Download } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { LoadResultPanel } from './load/components/LoadResultPanel';
import { NoveltyBadge } from './load/components/NoveltyBadge';
import { useCalendarHref } from './load/hooks';
import type { ErrorRecord, ProcessingResult } from './types/massive-diagram';

const logger = new Logger('Diagrams/DiagramMassiveResults');

/** Filas que se dibujan por grupo: una carga grande puede tener miles; el reporte descargable las trae todas. */
const MAX_VISIBLE_ROWS = 200;

/** `DD/MM/AAAA` de una fecha `YYYY-MM-DD` (se descarta cualquier hora que venga pegada). */
const dayLabel = (date: string) => formatDateAr(date.slice(0, 10));

interface DiagramMassiveResultsProps {
  results: ProcessingResult;
  /** `[legajo] Apellido, Nombre` por id de empleado: el servidor devuelve los nombres sin legajo. */
  employeeLabels: Record<string, string>;
  onReset: () => void;
}

/** Resultado de la carga masiva: totales, detalle por grupo plegable y reporte descargable. */
export function DiagramMassiveResults({ results, employeeLabels, onReset }: DiagramMassiveResultsProps) {
  const calendarHref = useCalendarHref();
  const [downloading, setDownloading] = useState(false);

  const { summary } = results;
  const created = results.data.created;
  const updated = results.data.updated;
  const errors = results.errors;

  const nameOf = (employeeId: string, fallback?: string | null) =>
    employeeLabels[employeeId] ?? (fallback || employeeId || 'N/A');

  const generateTxtReport = () => {
    const lines: string[] = [
      'REPORTE DE CARGA MASIVA',
      `Fecha y Hora: ${formatArgentinaDateTime(new Date())}`,
      '=====================================',
      '',
      'RESUMEN:',
      `- Días procesados: ${summary.processed_days}`,
      `- Creados: ${summary.created_records}`,
      `- Reemplazados: ${summary.updated_records}`,
      `- Omitidos: ${summary.skipped_records}`,
      `- Con error: ${summary.errors_count ?? 0}`,
      `- Tiempo de procesamiento: ${summary.processing_time_seconds?.toFixed(2) ?? 'N/A'} segundos`,
      '',
    ];

    const section = (title: string, rows: string[]) => {
      if (rows.length === 0) return;
      lines.push(`${title} (${rows.length}):`, '='.repeat(50), ...rows, '');
    };

    section(
      'CREADOS',
      created.map(
        (record, index) =>
          `${String(index + 1).padStart(3, ' ')}. ${nameOf(record.employee_id, record.employee_name)} - ${dayLabel(record.date)}${record.novelty_name ? ` - Novedad: ${record.novelty_name}` : ''}`
      )
    );
    section(
      'REEMPLAZADOS',
      updated.map(
        (record, index) =>
          `${String(index + 1).padStart(3, ' ')}. ${nameOf(record.employee_id, record.employee_name)} - ${dayLabel(record.date)}${record.previous_novelty_name ? ` - Anterior: ${record.previous_novelty_name}` : ''}${record.novelty_name ? ` - Nueva: ${record.novelty_name}` : ''}`
      )
    );
    section(
      'CON ERROR',
      errors.flatMap((record, index) => [
        `${String(index + 1).padStart(3, ' ')}. ${nameOf(record.employee_id, record.employee_name)} - ${record.date ? dayLabel(record.date) : 'N/A'}`,
        `     Tipo de error: ${record.error_type}`,
        `     Descripción: ${record.error_message}`,
      ])
    );
    lines.push('FIN DEL REPORTE');
    return lines.join('\n');
  };

  const downloadReport = () => {
    setDownloading(true);
    try {
      const blob = new Blob([generateTxtReport()], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reporte-diagramas-masivos-${argentinaDate()}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Reporte descargado correctamente');
    } catch (error) {
      logger.error('Error al descargar el reporte', { data: { error } });
      toast.error('No se pudo descargar el reporte');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <LoadResultPanel
      totals={{
        created: summary.created_records,
        replaced: summary.updated_records,
        skipped: summary.skipped_records,
        errors: summary.errors_count ?? 0,
      }}
      description={`Se evaluaron ${summary.processed_days} ${summary.processed_days === 1 ? 'día' : 'días'} de ${summary.total_employees} ${summary.total_employees === 1 ? 'empleado' : 'empleados'}.`}
      onReset={onReset}
      calendarHref={calendarHref}
      extraActions={
        <Button type="button" variant="outline" className="min-h-10" onClick={downloadReport} disabled={downloading}>
          <Download aria-hidden="true" />
          {downloading ? 'Descargando…' : 'Descargar reporte (.txt)'}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <ResultGroup title="Con error" count={errors.length} defaultOpen>
          <ErrorRows rows={errors} nameOf={nameOf} />
        </ResultGroup>

        <ResultGroup title="Creados" count={created.length}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Novedad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {created.slice(0, MAX_VISIBLE_ROWS).map((record) => (
                <TableRow key={`${record.employee_id}-${record.date}`}>
                  <TableCell className="font-medium">{nameOf(record.employee_id, record.employee_name)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{dayLabel(record.date)}</TableCell>
                  <TableCell>
                    <NoveltyBadge name={record.novelty_name} color={record.novelty_color} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TruncationNote total={created.length} />
        </ResultGroup>

        <ResultGroup title="Reemplazados" count={updated.length}>
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
              {updated.slice(0, MAX_VISIBLE_ROWS).map((record) => (
                <TableRow key={`${record.employee_id}-${record.date}`}>
                  <TableCell className="font-medium">{nameOf(record.employee_id, record.employee_name)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{dayLabel(record.date)}</TableCell>
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
          <TruncationNote total={updated.length} />
        </ResultGroup>
      </div>
    </LoadResultPanel>
  );
}

function ErrorRows({
  rows,
  nameOf,
}: {
  rows: ErrorRecord[];
  nameOf: (id: string, fallback?: string | null) => string;
}) {
  return (
    <>
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
          {rows.slice(0, MAX_VISIBLE_ROWS).map((record, index) => (
            <TableRow key={`${record.employee_id}-${record.date ?? 'sin-fecha'}-${index}`}>
              <TableCell className="font-medium">{nameOf(record.employee_id, record.employee_name)}</TableCell>
              <TableCell className="font-mono tabular-nums">{record.date ? dayLabel(record.date) : '—'}</TableCell>
              <TableCell>
                <Badge variant="destructive">{record.error_type}</Badge>
              </TableCell>
              <TableCell className="text-danger-subtle-foreground text-sm">{record.error_message}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TruncationNote total={rows.length} />
    </>
  );
}

function TruncationNote({ total }: { total: number }) {
  if (total <= MAX_VISIBLE_ROWS) return null;
  return (
    <p className="text-muted-foreground border-t px-4 py-2 text-xs">
      Se muestran {MAX_VISIBLE_ROWS} de {total}. El reporte descargable incluye todos.
    </p>
  );
}

/** Grupo plegable de resultados; sin filas no se abre y el contenido se monta recién al abrirlo. */
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
  const [opened, setOpened] = useState(defaultOpen && count > 0);

  if (count === 0) {
    return (
      <div className="text-muted-foreground flex min-h-11 items-center justify-between rounded-lg border px-4 text-sm">
        <span>{title}</span>
        <span className="tabular-nums">0</span>
      </div>
    );
  }

  return (
    <details
      open={defaultOpen}
      onToggle={(event) => setOpened((event.currentTarget as HTMLDetailsElement).open)}
      className="group rounded-lg border"
    >
      <summary className="focus-visible:ring-ring/50 flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-4 text-sm font-medium outline-none focus-visible:ring-[3px] [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <span className="tabular-nums">{count}</span>
          <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      {opened ? <div className="max-h-80 overflow-auto border-t">{children}</div> : null}
    </details>
  );
}
