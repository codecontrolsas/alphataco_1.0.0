'use client';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { Check, CircleAlert } from 'lucide-react';
import { useFormContext, useFormState, useWatch, type FieldValues } from 'react-hook-form';

/** Sección de un formulario largo y los campos (por nombre) que contiene. */
export interface CompletenessSection {
  id: string;
  title: string;
  fields: readonly string[];
}

/** Schema de objeto de Zod, descrito por lo único que se usa de él (sirve para cualquier versión). */
interface ObjectSchemaLike {
  shape: Record<string, { safeParse: (value: unknown) => { success: boolean } }>;
}

/** Campos obligatorios de un schema: los que rechaza cuando faltan. Calcularlo una sola vez, fuera del componente. */
export function requiredFieldsOf(schema: ObjectSchemaLike): ReadonlySet<string> {
  return new Set(Object.keys(schema.shape).filter((field) => !schema.shape[field].safeParse(undefined).success));
}

/** ¿El valor cuenta como completado? (cadena no vacía, lista con elementos o número) */
function isFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value === undefined || value === null) return false;
  return String(value).trim() !== '';
}

interface SectionProgress {
  id: string;
  title: string;
  required: number;
  filled: number;
  hasErrors: boolean;
}

/**
 * Avance por sección. Se suscribe a los valores y a los errores en quien lo usa (el panel
 * lateral y el aviso), no en el formulario: cada tecla re-renderiza esos dos y no los campos.
 */
function useSectionProgress(
  sections: readonly CompletenessSection[],
  required: ReadonlySet<string>
): SectionProgress[] {
  const { control } = useFormContext<FieldValues>();
  const values = useWatch({ control }) as Record<string, unknown>;
  const { errors } = useFormState({ control });

  return sections.map((section) => {
    const requiredHere = section.fields.filter((field) => required.has(field));
    return {
      id: section.id,
      title: section.title,
      required: requiredHere.length,
      filled: requiredHere.filter((field) => isFilled(values[field])).length,
      hasErrors: section.fields.some((field) => field in errors),
    };
  });
}

interface CompletenessProps {
  sections: readonly CompletenessSection[];
  required: ReadonlySet<string>;
}

/** Aviso con las secciones que tienen errores, para ponerlo sobre los botones de guardar. */
export function SectionErrorsAlert({ sections, required }: CompletenessProps) {
  const withErrors = useSectionProgress(sections, required).filter((section) => section.hasErrors);
  if (withErrors.length === 0) return null;

  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle className="line-clamp-none">
        Falta corregir campos en {withErrors.map((section) => section.title).join(', ')}
      </AlertTitle>
    </Alert>
  );
}

/** Panel lateral de un formulario largo: cuántos obligatorios hay completos y en qué sección falta algo. */
export function FormCompletenessAside({
  sections,
  required,
  title = 'Completitud',
}: CompletenessProps & { title?: string }) {
  const progress = useSectionProgress(sections, required);
  const total = progress.reduce((sum, section) => sum + section.required, 0);
  const filled = progress.reduce((sum, section) => sum + section.filled, 0);

  return (
    <SectionCard title={title}>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="text-muted-foreground flex items-baseline justify-between text-sm">
            <span>Campos obligatorios</span>
            <span className="text-foreground font-mono font-semibold tabular-nums">
              {filled} / {total}
            </span>
          </div>
          <Progress value={total ? (filled / total) * 100 : 0} aria-label="Campos obligatorios completos" />
        </div>

        <ul className="space-y-1">
          {progress.map((section) => {
            const complete = section.filled >= section.required;
            return (
              <li key={section.id} className="flex items-center gap-2.5 py-1.5 text-sm">
                <span
                  className={
                    section.hasErrors
                      ? 'border-danger grid size-5 place-items-center rounded-full border-2'
                      : complete
                        ? 'bg-ok grid size-5 place-items-center rounded-full text-white'
                        : 'border-input grid size-5 place-items-center rounded-full border-2'
                  }
                  aria-hidden
                >
                  {complete && !section.hasErrors && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="flex-1">{section.title}</span>
                {section.hasErrors ? (
                  <Badge variant="red">Revisar</Badge>
                ) : (
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    {section.filled}/{section.required}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </SectionCard>
  );
}
