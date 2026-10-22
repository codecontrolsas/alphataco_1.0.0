'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_ANSWER_OPTIONS,
  OBS_MAX_LENGTH,
  OBS_SUFFIX,
  cleanLabel,
  getOptionLabel,
  isSideValidationItem,
  withNotApplicable,
  type ChecklistTemplateItem,
} from '@/features/Checklists/lib/checklist-form-schema';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { AlertTriangle, Calendar, MessageSquarePlus } from 'lucide-react';
import { useState } from 'react';
import { useWatch, type Control, type FieldValues, type UseFormReturn } from 'react-hook-form';

/**
 * Cabecera de un item: enunciado, badges de estado y, si la plantilla lo trae,
 * el texto original del formulario en papel.
 *
 * Vive fuera de `ChecklistItemField` a propósito: definirla adentro creaba un
 * tipo de componente nuevo en cada render y remontaba el bloque completo.
 */
export const ItemHeader = ({
  label,
  description,
  isCritical,
  requiresCertification = false,
  isFailed = false,
  className,
}: {
  label: string;
  description?: string | null;
  isCritical: boolean;
  requiresCertification?: boolean;
  isFailed?: boolean;
  className?: string;
}) => (
  <FormLabel className={cn('text-base font-semibold mb-3 block', className)}>
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <span className="flex-1">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {isCritical && (
          <Badge variant="destructive" className="text-xs whitespace-nowrap">
            CRÍTICO
          </Badge>
        )}
        {requiresCertification && (
          <Badge variant="outline" className="text-xs whitespace-nowrap">
            <Calendar className="w-3 h-3 mr-1 inline" />
            Certificación
          </Badge>
        )}
        {isFailed && (
          <Badge variant="destructive" className="text-xs whitespace-nowrap gap-1">
            <AlertTriangle className="w-3 h-3" />
            Fallido
          </Badge>
        )}
      </div>
    </div>
    {/* Texto del formulario en papel: se mantiene, pero con el menor peso visual
        posible para no romper la silueta que comparten todos los checklists */}
    {description && (
      <p className="mt-1 text-[11px] leading-snug font-normal italic text-muted-foreground/60">{description}</p>
    )}
  </FormLabel>
);

/**
 * Observación libre de un item, equivalente a la columna OBSERVACIONES del
 * formulario en papel.
 *
 * Se despliega sola cuando la respuesta es "Malo" —que es cuando el dato hace
 * falta y el operario está parado frente al equipo— y en el resto de los casos
 * queda como un botón de texto. Nunca se esconde del todo: si ya tiene contenido
 * se muestra un adelanto, para que no quede información invisible.
 */
export const ItemObservation = ({
  fieldName,
  answerFieldNames,
  control,
  readOnly,
}: {
  /** campo de la observación */
  fieldName: string;
  /** campos de respuesta del item (valor único, o izquierda y derecha) */
  answerFieldNames: string[];
  control: Control<FieldValues>;
  readOnly: boolean;
}) => {
  // Un solo useWatch con la lista de campos: suscribirse por separado a cada uno
  // multiplicaba las suscripciones por item en un formulario que puede tener cien.
  const [value, ...answers] = useWatch({
    control,
    name: [fieldName, ...answerFieldNames],
  }) as (string | undefined)[];
  const isFailed = answers.some((v) => v === 'M' || v === 'Malo');
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const isOpen = manuallyOpen || isFailed;

  if (readOnly) {
    if (!value) return null;
    return (
      <div className="mt-3 border-t pt-2">
        <p className="text-xs font-medium text-muted-foreground">Observación</p>
        <p className="text-sm whitespace-pre-wrap">{value}</p>
      </div>
    );
  }

  // Colapsado: el afford queda deliberadamente tenue y compacto, para que la
  // tarjeta del item mantenga el mismo alto y peso que en el resto de checklists
  if (!isOpen) {
    return (
      <div className="mt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 -ml-1.5 text-[11px] font-normal text-muted-foreground/70 hover:text-foreground"
          aria-expanded={false}
          aria-controls={`${fieldName}-panel`}
          onClick={() => setManuallyOpen(true)}
        >
          <MessageSquarePlus className="w-3.5 h-3.5 mr-1" />
          {value ? <span className="line-clamp-1 max-w-[22ch] text-left">{value}</span> : 'Observación'}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2" id={`${fieldName}-panel`}>
      <FormField
        control={control}
        name={fieldName}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-[11px] font-normal text-muted-foreground/70">
              {isFailed ? 'Describí qué encontraste' : 'Observación'}
            </FormLabel>
            <FormControl>
              <Textarea
                {...field}
                value={field.value ?? ''}
                rows={2}
                maxLength={OBS_MAX_LENGTH}
                placeholder={isFailed ? 'Ej.: rajadura de 10 cm en el lateral izquierdo' : 'Opcional'}
                className="resize-y"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};

/** Contenedor de un item: aloja el campo y, debajo, su observación. */
export const ItemShell = ({
  failed,
  className,
  observation,
  children,
}: {
  failed: boolean;
  className?: string;
  observation?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div
    className={cn(
      'rounded-lg p-4',
      failed ? 'border-2 border-destructive bg-destructive/10' : 'border bg-muted/20',
      className
    )}
  >
    {children}
    {observation}
  </div>
);

/**
 * Componente que renderiza un item individual del checklist
 */
export const ChecklistItemField = ({
  item,
  sectionCode,
  form,
  readOnly = false,
  showObservations = false,
}: {
  item: ChecklistTemplateItem;
  sectionCode: string;
  form: UseFormReturn<FieldValues>;
  readOnly?: boolean;
  /** Habilita la columna OBSERVACIONES por item (plantillas que replican un formulario en papel) */
  showObservations?: boolean;
}) => {
  const typedControl = form.control as Control<FieldValues>;
  const itemCode = item.code || `item_${item.id}`;
  const fieldName = `${sectionCode}__${itemCode}`;
  const label = cleanLabel(item.label || 'Sin etiqueta');
  const isCritical = item.is_critical || false;
  const requiresSideValidation = isSideValidationItem(item);

  // Resaltado de items fallidos ('M' o 'Malo'), solo al ver una respuesta guardada.
  // `useWatch` con `disabled` evita suscribirse mientras se completa el formulario:
  // con `form.watch` cada item quedaba escuchando el estado entero y una sola
  // respuesta re-renderizaba todos los demás.
  // Resaltado de items fallidos, solo al ver una respuesta guardada: `disabled`
  // evita suscribirse mientras se completa el formulario, donde cada respuesta
  // haría re-renderizar a todos los demás items.
  const watchOptions = { control: typedControl, disabled: !readOnly } as const;
  const currentValue = useWatch({ ...watchOptions, name: fieldName });
  const leftValue = useWatch({ ...watchOptions, name: `${fieldName}_left` });
  const rightValue = useWatch({ ...watchOptions, name: `${fieldName}_right` });

  const hasFailValue = (v: unknown) => v === 'M' || v === 'Malo';
  const isFailed = readOnly && hasFailValue(currentValue);
  const isLeftFailed = readOnly && hasFailValue(leftValue);
  const isRightFailed = readOnly && hasFailValue(rightValue);
  const isAnySideFailed = isLeftFailed || isRightFailed;

  // La observación sigue el valor por su cuenta: así la suscripción existe solo
  // en las plantillas que la usan, y no en el resto.
  const observationNode = showObservations ? (
    <ItemObservation
      fieldName={`${fieldName}${OBS_SUFFIX}`}
      answerFieldNames={requiresSideValidation ? [`${fieldName}_left`, `${fieldName}_right`] : [fieldName]}
      control={typedControl}
      readOnly={readOnly}
    />
  ) : null;

  // Parsear opciones si es un select. "No aplica" se suma siempre: además de permitir
  // elegirla, hace que un valor ya guardado se muestre al ver la respuesta (un valor
  // fuera del listado deja el campo en blanco).
  let options: string[] = DEFAULT_ANSWER_OPTIONS;
  if (item.input_type === 'select' && item.options) {
    try {
      const parsed = Array.isArray(item.options) ? item.options : JSON.parse(item.options as string);
      options = withNotApplicable(parsed as string[]);
    } catch (e) {
      logger.error('Error parsing options', { data: { error: e } });
    }
  }

  // Renderizar campo de fecha
  if (item.input_type === 'date') {
    return (
      <ItemShell failed={isFailed} observation={observationNode}>
        <FormField
          control={typedControl}
          name={fieldName}
          render={({ field }) => (
            <FormItem>
              <ItemHeader
                label={label}
                description={item.description}
                isCritical={isCritical}
                requiresCertification={Boolean(item.requires_certification)}
                isFailed={isFailed}
              />
              <FormControl>
                <Input type="date" {...field} disabled={readOnly} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </ItemShell>
    );
  }

  // Renderizar campo doble (izquierda/derecha)
  if (requiresSideValidation) {
    return (
      <ItemShell failed={isAnySideFailed} className="space-y-4" observation={observationNode}>
        <div className="pb-2 border-b">
          <ItemHeader
            label={label}
            description={item.description}
            isCritical={isCritical}
            isFailed={isAnySideFailed}
            className="mb-0"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={typedControl}
            name={`${fieldName}_left`}
            render={({ field }) => {
              return (
                <FormItem
                  className={cn('rounded-md p-2', isLeftFailed && 'bg-destructive/10 ring-1 ring-destructive/30')}
                >
                  <FormLabel
                    className={cn('text-sm font-medium text-muted-foreground', isLeftFailed && 'text-destructive')}
                  >
                    Izquierda {isLeftFailed && <AlertTriangle className="w-3 h-3 inline ml-1" />}
                  </FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                      }}
                      value={field.value}
                      disabled={readOnly}
                    >
                      <SelectTrigger className="w-full pointer-coarse:min-h-11">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {getOptionLabel(option)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
          <FormField
            control={typedControl}
            name={`${fieldName}_right`}
            render={({ field }) => {
              return (
                <FormItem
                  className={cn('rounded-md p-2', isRightFailed && 'bg-destructive/10 ring-1 ring-destructive/30')}
                >
                  <FormLabel
                    className={cn('text-sm font-medium text-muted-foreground', isRightFailed && 'text-destructive')}
                  >
                    Derecha {isRightFailed && <AlertTriangle className="w-3 h-3 inline ml-1" />}
                  </FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                      }}
                      value={field.value}
                      disabled={readOnly}
                    >
                      <SelectTrigger className="w-full pointer-coarse:min-h-11">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {getOptionLabel(option)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        </div>
      </ItemShell>
    );
  }

  // Renderizar campo select
  if (item.input_type === 'select') {
    return (
      <ItemShell failed={isFailed} observation={observationNode}>
        <FormField
          control={typedControl}
          name={fieldName}
          render={({ field }) => {
            return (
              <FormItem>
                <ItemHeader label={label} description={item.description} isCritical={isCritical} isFailed={isFailed} />
                <FormControl>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                    }}
                    value={field.value}
                    disabled={readOnly}
                  >
                    <SelectTrigger className="w-full pointer-coarse:min-h-11">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {getOptionLabel(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      </ItemShell>
    );
  }

  // Renderizar campo de texto
  if (item.input_type === 'text') {
    return (
      <ItemShell failed={isFailed} observation={observationNode}>
        <FormField
          control={typedControl}
          name={fieldName}
          render={({ field }) => (
            <FormItem>
              <ItemHeader label={label} description={item.description} isCritical={isCritical} isFailed={isFailed} />
              <FormControl>
                <Input {...field} disabled={readOnly} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </ItemShell>
    );
  }

  // Renderizar campo numérico
  if (item.input_type === 'number') {
    return (
      <ItemShell failed={isFailed} observation={observationNode}>
        <FormField
          control={typedControl}
          name={fieldName}
          render={({ field }) => (
            <FormItem>
              <ItemHeader label={label} description={item.description} isCritical={isCritical} isFailed={isFailed} />
              <FormControl>
                <Input type="number" {...field} disabled={readOnly} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </ItemShell>
    );
  }

  // Por defecto, renderizar como radio group (B/M)
  return (
    <ItemShell failed={isFailed} observation={observationNode}>
      <FormField
        control={typedControl}
        name={fieldName}
        render={({ field }) => (
          <FormItem>
            <ItemHeader label={label} description={item.description} isCritical={isCritical} isFailed={isFailed} />
            <FormControl>
              <RadioGroup
                onValueChange={field.onChange}
                value={field.value}
                className="flex flex-col sm:flex-row gap-2 sm:gap-3"
                disabled={readOnly}
              >
                {/* Cada opción es un bloque completo: el control en sí mide 16 px,
                    muy por debajo del mínimo táctil, y esto se responde con guantes */}
                {options.map((option) => (
                  <label
                    key={option}
                    htmlFor={`${fieldName}-${option}`}
                    className={cn(
                      'flex flex-1 items-center gap-2 rounded-md px-3 py-2 pointer-coarse:min-h-11',
                      readOnly ? '' : 'cursor-pointer border hover:bg-accent'
                    )}
                  >
                    <RadioGroupItem value={option} id={`${fieldName}-${option}`} disabled={readOnly} />
                    <span>{getOptionLabel(option)}</span>
                  </label>
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </ItemShell>
  );
};
