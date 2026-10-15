import { SectionCard } from '@/shared/components/common/SectionCard';
import { Timeline, type TimelineItem } from '@/shared/components/common/Timeline';
import { formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';

export interface HistoryEntry {
  event: string;
  /** ISO con hora, o `YYYY-MM-DD` para los eventos que solo tienen fecha (la respuesta del proveedor). */
  at: string | null;
  by: string | null;
  notes?: string | null;
}

function formatAt(iso: string | null): string {
  if (!iso) return '—';
  // Una fecha sin hora no se pasa por la zona horaria: "2026-10-08" es el 08/10, no el 07/10 21:00.
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDateAr(iso) : formatArgentinaDateTime(iso);
}

/** Historial de un documento de Compras (solicitud, cotizacion, OC): evento, quien, cuando y motivo. */
export function HistoryCard({ history }: { history: readonly HistoryEntry[] }) {
  const items: TimelineItem[] = history.map((h) => ({
    tone: 'brand',
    title: h.event,
    meta: `${h.by ? `${h.by} · ` : ''}${formatAt(h.at)}`,
    children: h.notes ? <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{h.notes}</p> : undefined,
  }));
  return (
    <SectionCard title="Historial">
      {items.length > 0 ? <Timeline items={items} /> : <p className="text-muted-foreground text-sm">Sin movimientos registrados.</p>}
    </SectionCard>
  );
}
