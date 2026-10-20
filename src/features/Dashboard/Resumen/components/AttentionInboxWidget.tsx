import { cn } from '@/lib/utils';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { ChevronRight, CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { loadAttentionInbox, type AttentionTone } from '../lib/attention.server';

/** Franja de color a la izquierda de cada fila: lo único con color en la bandeja. Clases escritas completas (Tailwind v4). */
const TONE_RAIL: Record<AttentionTone, string> = {
  danger: 'bg-danger',
  warn: 'bg-warn',
  info: 'bg-info',
};

const TONE_WORD: Record<AttentionTone, string> = {
  danger: 'vencido',
  warn: 'espera una decisión',
  info: 'en curso',
};

/** Contador del encabezado del widget: cuántos pendientes distintos hay. */
export async function AttentionInboxCounter() {
  const { items } = await loadAttentionInbox();
  return <>{items.length}</>;
}

/**
 * «Para atender»: lo que espera a alguien en todos los módulos que el usuario puede ver, de lo vencido a lo
 * que solo está en curso. Cada fila lleva a la sección exacta donde se resuelve.
 */
export async function AttentionInboxWidget() {
  const { items, checked, failed } = await loadAttentionInbox();

  const failedNote =
    failed > 0 ? (
      <p role="status" className="text-warn-subtle-foreground mb-3 text-sm">
        {failed === 1 ? 'No se pudo revisar 1 sección' : `No se pudieron revisar ${failed} secciones`}: la bandeja puede
        estar incompleta.
      </p>
    ) : null;

  if (checked === 0 && failed > 0) {
    return (
      <StateBlock
        variant="error"
        title="No se pudieron revisar los pendientes"
        description="Volvé a cargar la página en unos minutos."
      />
    );
  }

  if (checked === 0) {
    return (
      <StateBlock
        variant="noperm"
        title="No hay secciones para revisar"
        description="La bandeja junta los pendientes de los módulos que tenés habilitados en tus permisos."
      />
    );
  }

  if (items.length === 0) {
    return (
      <>
        {failedNote}
        <StateBlock
          variant="empty"
          icon={CircleCheck}
          title="Nada pendiente"
          description={`Sin casos en las ${checked} secciones que se pudieron revisar.`}
        />
      </>
    );
  }

  return (
    <>
      {failedNote}
      {/* El marco del widget (SectionCard) es el contenedor de las container queries. */}
      <ul className="grid grid-cols-1 gap-2 @2xl:grid-cols-2">
        {items.map((item) => (
          <li key={item.key} className="min-w-0">
            <Link
              href={item.href}
              className="group hover:bg-accent focus-visible:ring-ring relative flex min-h-14 items-center gap-3 overflow-hidden rounded-lg border py-2.5 pr-3 pl-4 outline-none focus-visible:ring-2"
            >
              <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', TONE_RAIL[item.tone])} />
              <span className="min-w-12 shrink-0 text-right font-mono text-xl leading-none font-semibold tabular-nums">
                {item.count.toLocaleString('es-AR')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-medium text-pretty">{item.label}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {item.module}
                  <span className="sr-only"> · {TONE_WORD[item.tone]}</span>
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
