'use client';

import { Button } from '@/components/ui/button';
import { StateBlock } from '@/shared/components/common/StateBlock';

export default function DailyReportDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="px-4 py-4 sm:px-6">
      <StateBlock
        variant="error"
        title="No se pudo cargar el parte diario"
        description="Ocurrió un error al obtener los datos. Podés reintentar; si sigue pasando, volvé a la lista de partes."
        action={
          <Button type="button" variant="outline" onClick={() => reset()}>
            Reintentar
          </Button>
        }
      />
    </div>
  );
}
