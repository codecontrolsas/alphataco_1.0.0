import { Alert, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { Check, CircleAlert } from 'lucide-react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { EMPLOYEE_FORM_SECTIONS, REQUIRED_EMPLOYEE_FIELDS, isFieldFilled } from '../../lib/employee-form';
import type { EmployeeFormData } from '../../schemas/employee-schema';

interface SectionProgress {
  id: string;
  title: string;
  required: number;
  filled: number;
  hasErrors: boolean;
}

/**
 * Avance por sección. Se suscribe a los valores y a los errores AQUÍ y no en el formulario: así
 * cada tecla re-renderiza este panel y no las tres secciones de campos.
 */
export function useSectionProgress(): SectionProgress[] {
  const { control } = useFormContext<EmployeeFormData>();
  const values = useWatch({ control });
  const { errors } = useFormState({ control });

  return EMPLOYEE_FORM_SECTIONS.map((section) => {
    const required = section.fields.filter((field) => REQUIRED_EMPLOYEE_FIELDS.has(field));
    return {
      id: section.id,
      title: section.title,
      required: required.length,
      filled: required.filter((field) => isFieldFilled(values[field])).length,
      hasErrors: section.fields.some((field) => field in errors),
    };
  });
}

/** Aviso con las secciones que tienen errores, sobre los botones de guardar. */
export function SectionErrorsAlert() {
  const withErrors = useSectionProgress().filter((section) => section.hasErrors);
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

/** Panel lateral del formulario: cuántos obligatorios hay completos y en qué sección falta algo. */
export function EmployeeFormAside({ isNew }: { isNew: boolean }) {
  const sections = useSectionProgress();
  const required = sections.reduce((sum, section) => sum + section.required, 0);
  const filled = sections.reduce((sum, section) => sum + section.filled, 0);

  return (
    <>
      <SectionCard title="Completitud del legajo">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-muted-foreground flex items-baseline justify-between text-sm">
              <span>Campos obligatorios</span>
              <span className="text-foreground font-mono font-semibold tabular-nums">
                {filled} / {required}
              </span>
            </div>
            <Progress value={required ? (filled / required) * 100 : 0} aria-label="Campos obligatorios completos" />
          </div>

          <ul className="space-y-1">
            {sections.map((section) => {
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

      <SectionCard title="Qué pasa al guardar">
        <p className="text-muted-foreground text-sm text-pretty">
          {isNew
            ? 'Se crea el legajo y después podés cargar su documentación desde la ficha.'
            : 'Los cambios se aplican al legajo. La documentación ya cargada se conserva.'}
        </p>
      </SectionCard>
    </>
  );
}
