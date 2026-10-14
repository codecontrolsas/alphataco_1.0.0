'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useIsMutating } from '@tanstack/react-query';
import moment from 'moment';
import { useState } from 'react';
import type { DailyReportDetailRow } from '../types';
import { BULK_EDIT_MUTATION_KEY, useBulkEdit } from './bulk-edit/useBulkEdit';
import { SectionBlock } from './bulk-edit/SectionBlock';
import { isSectionValid } from './bulk-edit/types';
import { useRestoreFocus } from './hooks/useRestoreFocus';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRows: DailyReportDetailRow[];
  dailyReportId: string;
  onSuccess: () => void;
}

export function BulkEditModal({ open, onOpenChange, selectedRows, onSuccess }: Props) {
  const isSaving = useIsMutating({ mutationKey: BULK_EDIT_MUTATION_KEY }) > 0;
  const { onOpenAutoFocus, onCloseAutoFocus } = useRestoreFocus();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Con un guardado en curso no se puede cerrar (Escape, clic afuera, X o Cerrar).
        if (isSaving) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="grid-cols-1 sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden gap-4"
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={(event) => {
          if (isSaving) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isSaving) event.preventDefault();
        }}
      >
        {/* El contenido se monta al abrir: las filas se toman de `selectedRows` en ese momento y todo el
            estado (secciones procesadas, formularios) arranca limpio sin efectos de reset. */}
        <BulkEditContent
          initialRows={selectedRows}
          isSaving={isSaving}
          onSuccess={onSuccess}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface BulkEditContentProps {
  initialRows: DailyReportDetailRow[];
  isSaving: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

function BulkEditContent({ initialRows, isSaving, onSuccess, onClose }: BulkEditContentProps) {
  const [snapshotRows] = useState(initialRows);
  const [minRescheduleDate] = useState(() => moment().startOf('day').toDate());
  const { sections, sectionStates, setSectionState, savingSection, processedSections, completedFlash, save } =
    useBulkEdit(snapshotRows, { onSuccess, onClose });

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Editar {snapshotRows.length} línea{snapshotRows.length !== 1 ? 's' : ''}
        </DialogTitle>
        <DialogDescription>
          Solo se cambian los campos que completes. Cada bloque se guarda por separado con su propio botón: el estado
          elegido en un bloque no afecta a los demás.
        </DialogDescription>
      </DialogHeader>

      <Separator />

      {sections.map((section) => (
        <SectionBlock
          key={section.key}
          title={section.title}
          description={section.description}
          rows={section.rows}
          options={section.options}
          state={sectionStates[section.key]}
          setState={(next) => setSectionState(section.key, next)}
          isProcessed={processedSections.has(section.key)}
          isFlashing={completedFlash === section.key}
          isSaving={savingSection === section.key}
          isBusy={isSaving}
          isValid={isSectionValid(sectionStates[section.key])}
          minRescheduleDate={minRescheduleDate}
          onSave={() => save(section)}
        />
      ))}

      <DialogFooter className="pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
          Cerrar
        </Button>
      </DialogFooter>
    </>
  );
}
