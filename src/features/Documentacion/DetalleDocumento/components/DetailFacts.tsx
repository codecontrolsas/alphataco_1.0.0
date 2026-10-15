import { SectionCard } from '@/shared/components/common/SectionCard';
import type { ReactNode } from 'react';

export interface DetailFact {
  label: string;
  value: ReactNode;
  /** Ocupa todo el ancho (listas largas, descripciones). */
  wide?: boolean;
}

/** Sección de la ficha del documento: título + pares etiqueta/valor en una lista de definiciones. */
export function DetailFacts({
  title,
  description,
  facts,
  lead,
}: {
  title: string;
  description?: string;
  facts: DetailFact[];
  lead?: ReactNode;
}) {
  return (
    <SectionCard title={title} description={description}>
      {lead}
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.label} className={fact.wide ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
            <dt className="text-muted-foreground text-sm">{fact.label}</dt>
            <dd className="break-words">{fact.value || <span className="text-muted-foreground">Sin dato</span>}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}
