/**
 * Tipos, constantes y schema del formulario de checklist normalizado.
 *
 * Se separa del componente para que la construcción del schema Zod y de los valores por
 * defecto (la parte que decide qué campos se exigen y cuáles se descartan) quede aislada
 * del render.
 */

import {
  NOT_APPLICABLE_VALUE,
  OBS_SUFFIX,
  getItemCode,
  getSectionCode,
  isSideValidationItem,
} from '@/features/Checklists/lib/checklist-evaluation';
import { ARGENTINA_TIME_ZONE, argentinaDate } from '@/shared/lib/argentina-time';
import moment from 'moment';
import { z } from 'zod';

export { NOT_APPLICABLE_VALUE, OBS_SUFFIX, getItemCode, getSectionCode, isSideValidationItem };

// Tipos basados en la estructura de la base de datos
export type ChecklistTemplate = Awaited<
  ReturnType<typeof import('@/features/Checklists/actions/checklist-queries').fetchChecklistTemplateById>
>;

export type ChecklistTemplateSection = NonNullable<ChecklistTemplate>['checklist_template_sections'][number];

/**
 * Tercera opción de respuesta, para items que no corresponden a la unidad revisada
 * (ej. "Conector de ABS (para acoplado o semi)" en un vehículo liviano).
 *
 * Un item en este estado NO cuenta como falla: los cálculos de resultado, items
 * críticos fallados y desvíos comparan estrictamente contra 'M', por lo que este
 * valor queda excluido de todos ellos sin lógica adicional.
 *
 * Se agrega desde el código y no desde `checklist_template_items.options` para que
 * aplique a todas las plantillas, incluidas las que se creen en el futuro.
 */
export const NOT_APPLICABLE_LABEL = 'No aplica';

/** Opciones de respuesta por defecto (items sin `options` propias en la plantilla) */
export const DEFAULT_ANSWER_OPTIONS = ['B', 'M', NOT_APPLICABLE_VALUE];

/**
 * Plantillas que replican un formulario en papel con columna de OBSERVACIONES
 * por item. Se activa por código y no para todas las plantillas: los otros
 * checklists nunca tuvieron esa columna y agregarla les cambiaría la pantalla.
 *
 * Cuando haya una segunda plantilla que la necesite conviene mover esto a una
 * columna booleana en `checklist_templates`.
 */
export const TEMPLATES_WITH_ITEM_OBSERVATIONS = new Set(['hidrogrua']);

/** Sufijo del campo de observación de un item dentro del formulario */

/** Clave de `answer_data` donde se guardan las observaciones por item */
export const ITEM_OBSERVATIONS_KEY = 'item_observations';

/** Largo máximo de una observación por item */
export const OBS_MAX_LENGTH = 500;

/**
 * Diagramas de nomenclatura de partes que acompañan a un formulario en papel.
 * Se muestran como ayuda de consulta, no como parte de la inspección: por eso
 * van en un diálogo y no intercalados entre los items.
 */
export const TEMPLATE_PARTS_DIAGRAMS: Record<string, { src: string; title: string; alt: string }> = {
  hidrogrua: {
    src: '/diagramas/hidrogrua-partes.png',
    title: 'Nomenclatura de partes de la hidrogrúa',
    alt:
      'Vista lateral de una hidrogrúa montada sobre chasis con sus catorce partes numeradas: ' +
      '1 estructura, 2 columna, 3 brazo primario, 4 brazo secundario, 5 a 8 primera a cuarta ' +
      'prolongación, 9 barra de estabilización, 10 cremallera de rotación, 11 cilindro ' +
      'estabilizador, 12 cilindro de elevación, 13 cilindro de articulación, 14 cilindro de extensión.',
  },
};

/** Agrega "No aplica" a las opciones de un item sin duplicarla si ya viniera de la BD */
export const withNotApplicable = (options: string[]): string[] =>
  options.includes(NOT_APPLICABLE_VALUE) ? options : [...options, NOT_APPLICABLE_VALUE];

/**
 * Determina si un item debe tratarse como "doble lado" (izquierda/derecha).
 * Importante: un `input_type === 'date'` NUNCA debe mapearse como double_side,
 * aunque por error venga con `requires_side_validation = true` desde la BD.
 */

export type Equipment = {
  label: string;
  value: string;
  domain: string | null;
  serie: string | null;
  kilometer: string;
  engine_hours: string;
  model: string | null;
  brand: string | null;
  intern_number: string;
  sub_type_id: string | null;
  type_id?: string | null;
  type_name?: string | null;
  sub_type_name?: string | null;
};

export type Customer = {
  id: string;
  name: string;
};

export type Employee = {
  id: string;
  fullName: string;
  document?: string | null;
  file_number?: string | null;
};

export type DefaultAnswerSectionValue = Record<string, unknown>;
export type DefaultAnswers = {
  equipment_id?: string;
  customer_id?: string;
  chofer?: string;
  fecha?: string;
  hora?: string;
  kilometraje?: string;
  horometro?: string;
  observaciones?: string;
  [sectionCode: string]: DefaultAnswerSectionValue | string | undefined;
};

export type NormalizedChecklistFormProps = {
  shouldDisabledInputs?: boolean;
  template: NonNullable<ChecklistTemplate>;
  equipments: Equipment[];
  customers?: Customer[];
  employees?: Employee[];
  currentUser:
    | Awaited<ReturnType<typeof import('@/features/Formularios/actions/form-actions').getCurrentProfile>>[number]
    | null;
  defaultEquipmentId?: string;
  defaultAnswers?: DefaultAnswers;
  readOnly?: boolean; // Modo solo lectura
  /** `false` si el usuario del dashboard no tiene `formularios:formularios:create`: se muestra el formulario sin poder enviarlo. El QR/operario no lo pasa (default `true`). */
  canSubmit?: boolean;
  defaultEmployeeId?: string;
  defaultEmployeeName?: string;
  defaultKilometer?: string;
  defaultHitchEquipmentId?: string | null; // ID del enganche cuando está en modo view
  defaultCustomerId?: string | null; // ID del cliente cuando está en modo view
  defaultHorometro?: string;
};

/**
 * Genera el schema de Zod dinámicamente basado en la estructura del checklist.
 *
 * `hiddenSectionCodes` recibe las secciones que no se están renderizando (hoy: la
 * sección del enganche cuando no se declaró la unidad enganchada). Sus campos
 * quedan fuera del schema, así que no se exigen y además Zod los descarta del
 * resultado: nada de lo que el operario haya tipeado antes de quitar el enganche
 * llega al guardado.
 */
export const generateChecklistSchema = (
  template: NonNullable<ChecklistTemplate>,
  hiddenSectionCodes?: ReadonlySet<string>
) => {
  const schema: Record<string, z.ZodTypeAny> = {
    equipment_id: z.string().min(1, 'Debe seleccionar un equipo'),
    customer_id: z.string().optional(), // Cliente opcional
    // ⚠️ CRÍTICO: 'chofer_employee_id' se guarda como columna FK directa en checklist_answers.
    // Los nombres de los campos JSONB ('chofer', 'customer_id', 'kilometraje', 'horometro')
    // son capturados por columnas GENERATED en la BD. No renombrar sin actualizar la migración.
    chofer_employee_id: z.string().uuid().optional().nullable(),
    chofer: z.string().min(1, 'Debe ingresar el nombre del chofer'),
    fecha: z.string().min(1, 'Debe ingresar la fecha'),
    hora: z.string().min(1, 'Debe ingresar la hora'),
    kilometraje: z.string().optional(),
    horometro: z.string().optional(),
    observaciones: z.string().optional(),
  };

  // Iterar sobre las secciones
  template.checklist_template_sections?.forEach((section) => {
    const sectionCode = getSectionCode(section);

    // Sección oculta: no se pide ni se guarda
    if (hiddenSectionCodes?.has(sectionCode)) {
      return;
    }

    // Iterar sobre los items de la sección
    section.checklist_template_items?.forEach((item) => {
      const itemCode = item.code || `item_${item.id}`;
      // IMPORTANTE:
      // React Hook Form interpreta los puntos en `name` como rutas anidadas (ej: "a.b" => { a: { b: ... } }).
      // Nuestro schema de Zod valida por claves literales, no por rutas. Para evitar desalineación, usamos nombres planos.
      const fieldName = `${sectionCode}__${itemCode}`;

      if (item.input_type === 'date') {
        // Campo de fecha con validación de certificación
        if (item.requires_certification) {
          schema[fieldName] = z
            .string({ required_error: `${item.label || 'Este campo'} es requerido` })
            .min(1, `${item.label || 'Este campo'} es requerido`)
            .refine(
              (date) => {
                const dateMoment = moment(date, 'YYYY-MM-DD', true);
                // IMPORTANTE: por ahora aceptamos fechas pasadas y futuras.
                // Más adelante se puede analizar si la fecha está vencida y disparar acciones.
                return dateMoment.isValid();
              },
              {
                message: 'La fecha de certificación no tiene un formato válido',
              }
            );
        } else {
          schema[fieldName] = z
            .string({ required_error: `${item.label || 'Este campo'} es requerido` })
            .min(1, `${item.label || 'Este campo'} es requerido`);
        }
      } else if (isSideValidationItem(item)) {
        // Item doble (izquierda/derecha)
        const leftFieldName = `${fieldName}_left`;
        const rightFieldName = `${fieldName}_right`;
        // Siguiendo el patrón recomendado (shadcn + RHF): valor string "" como no-seleccionado.
        // Validamos "requerido" con min(1) y además restringimos a valores válidos.
        schema[leftFieldName] = z
          .string({ required_error: `${item.label || 'Este campo'} (izquierda) es requerido` })
          .min(1, `${item.label || 'Este campo'} (izquierda) es requerido`)
          .refine((val) => DEFAULT_ANSWER_OPTIONS.includes(val), {
            message: `${item.label || 'Este campo'} (izquierda) debe ser "Bueno", "Malo" o "${NOT_APPLICABLE_LABEL}"`,
          });
        schema[rightFieldName] = z
          .string({ required_error: `${item.label || 'Este campo'} (derecha) es requerido` })
          .min(1, `${item.label || 'Este campo'} (derecha) es requerido`)
          .refine((val) => DEFAULT_ANSWER_OPTIONS.includes(val), {
            message: `${item.label || 'Este campo'} (derecha) debe ser "Bueno", "Malo" o "${NOT_APPLICABLE_LABEL}"`,
          });
      } else if (item.input_type === 'select' && item.options) {
        // Campo select con opciones
        const options = Array.isArray(item.options) ? item.options : JSON.parse(item.options as string);
        if (options.length > 0 && typeof options[0] === 'string') {
          // "No aplica" es válido aunque la plantilla en BD solo declare ["B","M"]
          const validOptions = withNotApplicable(options as string[]);
          schema[fieldName] = z
            .string({ required_error: `${item.label || 'Este campo'} es requerido` })
            .min(1, `${item.label || 'Este campo'} es requerido`)
            .refine((val) => validOptions.includes(val), {
              message: `${item.label || 'Este campo'} debe ser una opción válida`,
            });
        } else {
          schema[fieldName] = z
            .string({ required_error: `${item.label || 'Este campo'} es requerido` })
            .min(1, `${item.label || 'Este campo'} es requerido`);
        }
      } else if (item.input_type === 'text') {
        schema[fieldName] = z
          .string({ required_error: `${item.label || 'Este campo'} es requerido` })
          .min(1, `${item.label || 'Este campo'} es requerido`);
      } else if (item.input_type === 'number') {
        schema[fieldName] = z
          .string({ required_error: `${item.label || 'Este campo'} es requerido` })
          .min(1, `${item.label || 'Este campo'} es requerido`)
          .refine((val) => !isNaN(Number(val)), {
            message: 'Debe ser un número válido',
          });
      } else {
        // Por defecto, campo select con opciones B / M / No aplica
        schema[fieldName] = z
          .string({ required_error: `${item.label || 'Este campo'} es requerido` })
          .min(1, `${item.label || 'Este campo'} es requerido`)
          .refine((val) => DEFAULT_ANSWER_OPTIONS.includes(val), {
            message: `${item.label || 'Este campo'} debe ser "Bueno", "Malo" o "${NOT_APPLICABLE_LABEL}"`,
          });
      }

      // Observación libre del item (columna OBSERVACIONES del formulario en papel).
      // Se declara siempre porque es opcional: las plantillas que no la muestran
      // simplemente nunca la completan.
      schema[`${fieldName}${OBS_SUFFIX}`] = z
        .string()
        .max(OBS_MAX_LENGTH, `La observación no puede superar los ${OBS_MAX_LENGTH} caracteres`)
        .optional();
    });
  });

  return z.object(schema);
};

/**
 * Genera los valores por defecto del formulario
 */

export const generateDefaultValues = (
  template: NonNullable<ChecklistTemplate>,
  defaultAnswers?: DefaultAnswers,
  defaultEquipmentId?: string,
  defaultEmployeeName?: string,
  defaultKilometer?: string,
  defaultCustomerId?: string | null,
  defaultHorometro?: string
) => {
  const argentinaTimeOfDay = () =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ARGENTINA_TIME_ZONE,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  const defaults: Record<string, string> = {
    equipment_id: defaultEquipmentId || '',
    customer_id: defaultCustomerId || '',
    chofer: defaultEmployeeName || '',
    // Hora argentina (el navegador/contenedor puede estar en otra zona)
    fecha: argentinaDate(),
    hora: argentinaTimeOfDay(),
    kilometraje: defaultKilometer || '',
    horometro: defaultHorometro || '',
    observaciones: '',
  };

  // Si hay respuestas por defecto, cargarlas
  if (defaultAnswers) {
    if (defaultAnswers.equipment_id) defaults.equipment_id = defaultAnswers.equipment_id;
    if (defaultAnswers.customer_id) defaults.customer_id = defaultAnswers.customer_id;
    if (defaultAnswers.chofer) defaults.chofer = defaultAnswers.chofer;
    if (defaultAnswers.fecha) defaults.fecha = defaultAnswers.fecha;
    if (defaultAnswers.hora) defaults.hora = defaultAnswers.hora;
    if (defaultAnswers.kilometraje) defaults.kilometraje = defaultAnswers.kilometraje;
    if (defaultAnswers.horometro) defaults.horometro = defaultAnswers.horometro;
    if (defaultAnswers.observaciones) defaults.observaciones = defaultAnswers.observaciones;

    // Observaciones por item guardadas, indexadas por `seccion__item`
    const savedObservations = (defaultAnswers[ITEM_OBSERVATIONS_KEY] ?? {}) as Record<string, unknown>;

    // Cargar respuestas por sección
    template.checklist_template_sections?.forEach((section) => {
      const sectionCode = getSectionCode(section);
      const rawSection = defaultAnswers[sectionCode];
      const sectionAnswers: DefaultAnswerSectionValue = rawSection && typeof rawSection === 'object' ? rawSection : {};

      section.checklist_template_items?.forEach((item) => {
        const itemCode = item.code || `item_${item.id}`;
        const fieldName = `${sectionCode}__${itemCode}`;
        const itemAnswer = sectionAnswers[itemCode];
        const savedObs = savedObservations[fieldName];
        defaults[`${fieldName}${OBS_SUFFIX}`] = typeof savedObs === 'string' ? savedObs : '';

        if (isSideValidationItem(item)) {
          if (itemAnswer && typeof itemAnswer === 'object') {
            const sideAnswer = itemAnswer as { left?: unknown; right?: unknown };
            const leftValue = normalizeChecklistValue(sideAnswer.left);
            const rightValue = normalizeChecklistValue(sideAnswer.right);
            defaults[`${fieldName}_left`] = leftValue;
            defaults[`${fieldName}_right`] = rightValue;
          } else {
            defaults[`${fieldName}_left`] = '';
            defaults[`${fieldName}_right`] = '';
          }
        } else {
          defaults[fieldName] = normalizeChecklistValue(itemAnswer);
        }
      });
    });
  } else {
    // Inicializar todos los campos de items con string vacío (patrón recomendado para Select/inputs controlados)
    template.checklist_template_sections?.forEach((section) => {
      const sectionCode = getSectionCode(section);
      section.checklist_template_items?.forEach((item) => {
        const itemCode = item.code || `item_${item.id}`;
        const fieldName = `${sectionCode}__${itemCode}`;

        if (isSideValidationItem(item)) {
          defaults[`${fieldName}_left`] = '';
          defaults[`${fieldName}_right`] = '';
        } else {
          defaults[fieldName] = '';
        }
        defaults[`${fieldName}${OBS_SUFFIX}`] = '';
      });
    });
  }

  return defaults;
};

/**
 * Normaliza un valor a su codigo ('B' | 'M' | 'NA'), transformando el texto legible
 * si es necesario. Retorna '' si el valor está vacío o es inválido
 */
export const normalizeChecklistValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (!str) return '';
  if (str === 'Bueno') return 'B';
  if (str === 'Malo') return 'M';
  if (str === NOT_APPLICABLE_LABEL) return NOT_APPLICABLE_VALUE;
  return str;
};
