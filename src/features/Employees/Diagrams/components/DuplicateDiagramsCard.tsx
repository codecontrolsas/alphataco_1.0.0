'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DayCommentCell } from '@/features/Employees/Diagrams/components/DayCommentCell';
import type { DiagramFormValues } from '@/features/Employees/Diagrams/schemas/diagram-form-schema';
import type { Control } from 'react-hook-form';

export interface DuplicateDiagramRow {
  day: number;
  month: number;
  year: number;
  prev_event: string;
  prev_diagram_entry_id: string;
  comments?: string;
}

interface Props {
  rows: DuplicateDiagramRow[];
  control: Control<DiagramFormValues>;
  customizeComments: boolean;
  formatDayLabel: (row: { day: number; month: number; year: number }) => string;
  onCommentChange: (diagramId: string, comments: string | undefined) => void;
  onUpdate: (row: DuplicateDiagramRow) => void;
  onUpdateAll: (rows: DuplicateDiagramRow[]) => void;
  onDiscard: (index: number) => void;
  onDiscardAll: () => void;
}

/** Días que ya tienen una novedad: se pueden reemplazar o descartar. */
export function DuplicateDiagramsCard({
  rows,
  control,
  customizeComments,
  formatDayLabel,
  onCommentChange,
  onUpdate,
  onUpdateAll,
  onDiscard,
  onDiscardAll,
}: Props) {
  return (
    <Card className="bg-red-50 dark:bg-red-950">
      <CardHeader>
        <CardTitle>Diagramas duplicados</CardTitle>
        <CardDescription>
          Estos días ya tienen una novedad cargada. Al actualizarlos se reemplaza la novedad registrada; si dejás el
          comentario vacío se conserva el que ya tenían.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Novedad registrada</TableHead>
              {customizeComments && <TableHead className="w-full">Comentario</TableHead>}
              <TableHead className="w-px">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d, index: number) => (
              <TableRow key={`error-${d.prev_diagram_entry_id}`}>
                <TableCell className="align-top tabular-nums">{formatDayLabel(d)}</TableCell>
                <TableCell className="align-top">{d.prev_event}</TableCell>
                {customizeComments && (
                  <TableCell className="w-full min-w-0 align-top">
                    <DayCommentCell
                      control={control}
                      dateLabel={formatDayLabel(d)}
                      value={d.comments}
                      onChange={(value) => onCommentChange(d.prev_diagram_entry_id, value)}
                      onResetToGeneral={() => onCommentChange(d.prev_diagram_entry_id, undefined)}
                    />
                  </TableCell>
                )}
                <TableCell className="w-px align-top">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant={'default'}
                      size="sm"
                      onClick={() => onUpdate(d)}
                      aria-label={`Actualizar el diagrama del ${formatDayLabel(d)}`}
                    >
                      Actualizar
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
          <Button type="button" variant={'default'} onClick={() => onUpdateAll(rows)}>
            Actualizar Todos
          </Button>
          <Button type="button" variant={'link'} className="font-bold text-red-600" onClick={() => onDiscardAll()}>
            Descartar Todos
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
