import type { FormAnswerRow } from '@/features/Formularios/actions/form-actions';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';

/** Lista de solo lectura de las respuestas de un formulario legacy (`custom_form`). */
export function LegacyAnswersList({ answers }: { answers: FormAnswerRow[] }) {
  if (answers.length === 0) {
    return <StateBlock variant="empty" title="Este formulario no tiene respuestas" />;
  }

  return (
    <SectionCard
      title="Respuestas"
      description="Formulario anterior: el detalle de cada respuesta no está disponible."
      flush
    >
      <ul className="divide-y">
        {answers.map((row) => {
          const answer = (row.answer ?? {}) as Record<string, string | undefined>;
          const detail = [answer.dominio, answer.chofer].filter(Boolean).join(' · ');
          return (
            <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="font-medium tabular-nums">{formatArgentinaDay(row.created_at)}</span>
              <span className="text-muted-foreground min-w-0 truncate">
                {detail || 'Sin datos de equipo ni chofer'}
              </span>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
