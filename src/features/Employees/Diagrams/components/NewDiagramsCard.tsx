'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DayCommentCell } from '@/features/Employees/Diagrams/components/DayCommentCell';
import type { DiagramFormValues } from '@/features/Employees/Diagrams/schemas/diagram-form-schema';
import type { Control } from 'react-hook-form';

export interface NewDiagramRow {
  day: number;
  month: number;
  year: number;
  comments?: string;
}

interface Props {
  rows: NewDiagramRow[];
  control: Control<DiagramFormValues>;
  customizeComments: boolean;
  isProcessing: boolean;
  formatDayLabel: (row: { day: number; month: number; year: number }) => string;
  dayKey: (row: { day: number; month: number; year: number }) => string;
  onCommentChange: (key: string, comments: string | undefined) => void;
  onCreate: (row: NewDiagramRow) => void;
  onCreateAll: (rows: NewDiagramRow[]) => void;
  onDiscard: (index: number) => void;
  onDiscardAll: () => void;
}

/** Días sin novedad cargada: se pueden crear o descartar. */
export function NewDiagramsCard({
  rows,
  control,
  customizeComments,
  isProcessing,
  formatDayLabel,
  dayKey,
  onCommentChange,
  onCreate,
  onCreateAll,
  onDiscard,
  onDiscardAll,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Diagramas correctos</CardTitle>
        <CardDescription>Días sin novedad cargada: se van a crear con el comentario indicado.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              {customizeComments && <TableHead className="w-full">Comentario</TableHead>}
              <TableHead className="w-px">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d, index: number) => (
              <TableRow key={`success-${dayKey(d)}`}>
                <TableCell className="align-top tabular-nums">{formatDayLabel(d)}</TableCell>
                {customizeComments && (
                  <TableCell className="w-full min-w-0 align-top">
                    <DayCommentCell
                      control={control}
                      dateLabel={formatDayLabel(d)}
                      value={d.comments}
                      onChange={(value) => onCommentChange(dayKey(d), value)}
                      onResetToGeneral={() => onCommentChange(dayKey(d), undefined)}
                    />
                  </TableCell>
                )}
                <TableCell className="w-px align-top">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant={'success'}
                      size="sm"
                      onClick={() => onCreate(d)}
                      disabled={isProcessing}
                      aria-label={`Crear el diagrama del ${formatDayLabel(d)}`}
                    >
                      Crear
                    </Button>
                    <Button
                      type="button"
                      variant={'link'}
                      size="sm"
                      className="font-bold text-red-600"
                      onClick={() => onDiscard(index)}
                      aria-label={`Descartar el diagrama del ${formatDayLabel(d)}`}
                    >
                      Descartar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {rows.length > 1 && (
        <CardFooter className="flex justify-around">
          <Button type="button" variant={'success'} onClick={() => onCreateAll(rows)} disabled={isProcessing}>
            Crear Todos
          </Button>
          <Button type="button" variant={'link'} className="font-bold text-red-600" onClick={() => onDiscardAll()}>
            Descartar Todos
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
