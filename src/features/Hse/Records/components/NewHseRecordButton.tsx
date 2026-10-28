'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { HseTrainingOption } from '../../actions/records.queries';
import { HseRecordFormDialog } from './HseRecordFormDialog';

export function NewHseRecordButton({
  trainings,
  trainingId,
  label = 'Nueva acta',
}: {
  trainings: HseTrainingOption[];
  trainingId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" className="min-h-11 sm:min-h-9" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" className="mr-1 size-4" />
        {label}
      </Button>
      {open && (
        <HseRecordFormDialog open={open} onOpenChange={setOpen} mode={{ kind: 'create', trainings, trainingId }} />
      )}
    </>
  );
}
