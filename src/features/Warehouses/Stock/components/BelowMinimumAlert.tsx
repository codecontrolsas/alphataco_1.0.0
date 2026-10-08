import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { getMaterialsBelowMinimum } from '../../actions/stock-alerts.server';
import { formatQuantity } from '../../lib/format';

/** Cuantos materiales se listan; el resto se resume en el contador. */
const SHOWN = 8;

/** Materiales bajo su stock minimo, agotados incluidos. No se muestra si no hay ninguno. */
export async function BelowMinimumAlert() {
  const materials = await getMaterialsBelowMinimum();
  if (materials.length === 0) return null;

  return (
    <Alert className="border-amber-500/50 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-600">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="tabular-nums">
        {materials.length === 1 ? '1 material por debajo del mínimo' : `${materials.length} materiales por debajo del mínimo`}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {materials.slice(0, SHOWN).map((m) => (
            <li key={m.id} className="flex justify-between gap-2">
              <Link href={`/dashboard/warehouse/materials/${m.id}`} className="truncate hover:underline">
                {m.name}
              </Link>
              <span className="shrink-0 tabular-nums">
                {formatQuantity(m.total)} / {formatQuantity(m.minStock)} {m.unit}
              </span>
            </li>
          ))}
        </ul>
        {materials.length > SHOWN && (
          <p className="mt-2 text-xs tabular-nums">y {materials.length - SHOWN} más (filtrá la tabla por “Bajo mínimo”).</p>
        )}
      </AlertDescription>
    </Alert>
  );
}
