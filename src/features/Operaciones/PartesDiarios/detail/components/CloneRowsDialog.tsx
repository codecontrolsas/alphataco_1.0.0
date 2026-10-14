'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import type { DailyReportDetailRow } from '../types';
import { CloneRowsSelectionView } from './clone/CloneRowsSelectionView';
import { useCloneRows } from './clone/useCloneRows';
import { CloneRowsConflictView } from './CloneRowsConflictView';
import { useRestoreFocus } from './hooks/useRestoreFocus';

interface CloneRowsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 'selected' = clonar solo las filas seleccionadas; 'all' = clonar todo el parte */
  mode: 'selected' | 'all';
  selectedRows: DailyReportDetailRow[];
  dailyReportId: string;
  /** Fecha del parte en formato YYYY-MM-DD o ISO — se muestra en el título */
  reportDate: string;
  onSuccess: () => void;
}

export function CloneRowsDialog({
  open,
  onOpenChange,
  mode,
  selectedRows,
  dailyReportId,
  reportDate,
  onSuccess,
}: CloneRowsDialogProps) {
  const clone = useCloneRows({ open, onOpenChange, mode, selectedRows, dailyReportId, onSuccess });
  const { onOpenAutoFocus, onCloseAutoFocus } = useRestoreFocus();

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (clone.isBusy) return;
        if (!isOpen) clone.handleClose();
      }}
    >
      <DialogContent
        className="sm:max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden gap-4"
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={(event) => {
          if (clone.isBusy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (clone.isBusy) event.preventDefault();
        }}
      >
        {clone.view === 'conflicts' && clone.conflicts ? (
          <>
            <DialogHeader className="space-y-1.5">
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="text-danger size-4" aria-hidden="true" />
                Revisión de duplicados
              </DialogTitle>
              <DialogDescription className="text-xs">
                Algunos registros ya fueron clonados antes a estas fechas. Decidí cómo continuar.
              </DialogDescription>
            </DialogHeader>

            <CloneRowsConflictView
              conflicts={clone.conflicts}
              plannedCount={clone.plannedCount}
              isCloning={clone.isCloning}
              onBack={clone.backToSelection}
              onSkipAndClone={clone.cloneSkippingDuplicates}
              onCloneAnyway={clone.cloneAnyway}
            />
          </>
        ) : (
          <CloneRowsSelectionView controller={clone} reportDate={reportDate} />
        )}
      </DialogContent>
    </Dialog>
  );
}
