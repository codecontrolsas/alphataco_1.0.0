'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { HseDocumentFormDialog } from '../../components/HseDocumentFormDialog';

export function NewHseDocumentButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" className="min-h-11 sm:min-h-9" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" className="mr-1 size-4" />
        Nuevo documento
      </Button>
      {open && <HseDocumentFormDialog open={open} onOpenChange={setOpen} mode={{ kind: 'create' }} />}
    </>
  );
}
