import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CalendarX2 } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { getExpiringBatches } from '../../actions/stock-alerts.server';
import { EXPIRING_WINDOW_DAYS } from '../../lib/batch-expiry';
import { formatQuantity } from '../../lib/format';

const SHOWN = 8;

/** Lotes con saldo vencidos o por vencer. No se muestra si no hay ninguno. */
export async function BatchExpiryAlert() {
  const batches = await getExpiringBatches();
  if (batches.length === 0) return null;
  const expired = batches.filter((b) => b.status === 'EXPIRED').length;
  const expiring = batches.length - expired;

  return (
    <Alert className="border-red-500/50 text-red-900 dark:text-red-200 [&>svg]:text-red-600">
      <CalendarX2 className="h-4 w-4" />
      <AlertTitle className="tabular-nums">
        {[
          expired > 0 && (expired === 1 ? '1 lote vencido' : `${expired} lotes vencidos`),
          expiring > 0 &&
            (expiring === 1
              ? `1 lote vence en los próximos ${EXPIRING_WINDOW_DAYS} días`
              : `${expiring} lotes vencen en los próximos ${EXPIRING_WINDOW_DAYS} días`),
        ]
          .filter(Boolean)
          .join(' · ')}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {batches.slice(0, SHOWN).map((b) => (
            <li key={`${b.materialId}-${b.batch}-${b.warehouse}`} className="flex justify-between gap-2">
              <Link href={`/dashboard/warehouse/materials/${b.materialId}`} className="truncate hover:underline">
                {b.material} · lote {b.batch} · {b.warehouse}
              </Link>
              <span className="shrink-0 tabular-nums">
                {formatQuantity(b.quantity)} {b.unit} · {b.status === 'EXPIRED' ? 'venció' : 'vence'}{' '}
                {moment(b.expiresOn).format('DD/MM/YYYY')}
              </span>
            </li>
          ))}
        </ul>
        {batches.length > SHOWN && (
          <p className="mt-2 text-xs tabular-nums">y {batches.length - SHOWN} más (filtrá la tabla por vencimiento).</p>
        )}
        {expired > 0 && (
          <p className="mt-2 text-xs">Los lotes vencidos no pueden salir ni transferirse: se dan de baja con un ajuste.</p>
        )}
      </AlertDescription>
    </Alert>
  );
}
