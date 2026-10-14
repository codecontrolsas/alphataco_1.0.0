'use client';

import { Button } from '@/components/ui/button';
import { useEditButton } from '@/shared/store/editState';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

/** "Volver" del detalle del parte: mismo comportamiento que `BackButton` (deja la vista en solo lectura y vuelve). */
export function DetailBackButton() {
  const router = useRouter();
  const setReadOnly = useEditButton((state) => state.setReadOnly);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2"
      onClick={() => {
        // `setReadOnly(readonly)` guarda `!readonly`: con `false` la vista queda en solo lectura.
        setReadOnly(false);
        router.back();
      }}
    >
      <ArrowLeft />
      Volver
    </Button>
  );
}
