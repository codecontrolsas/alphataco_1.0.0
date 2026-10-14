'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { CreateChecklistAnswer } from '@/features/Checklists';
import { fetchSupervisorsForEquipment } from '@/features/Checklists/actions/actionsServer';
import { getCompatibleEquipmentForHitch, getEquipmentTypeInfo } from '@/features/Checklists/actions/checklist-queries';
import { ChecklistGeneralInfoSection } from '@/features/Checklists/components/sections/ChecklistGeneralInfoSection';
import { ChecklistItemField } from '@/features/Checklists/components/sections/ChecklistItemField';
import { ChecklistPartsDiagramDialog } from '@/features/Checklists/components/sections/ChecklistPartsDiagramDialog';
import { HitchEquipmentDialog } from '@/features/Checklists/components/sections/HitchEquipmentDialog';
import {
  buildAnswersBySection,
  collectItemObservations,
  computeDeviations,
  getSectionCode,
  type ChecklistDeviation,
} from '@/features/Checklists/lib/checklist-evaluation';
import {
  ITEM_OBSERVATIONS_KEY,
  TEMPLATES_WITH_ITEM_OBSERVATIONS,
  TEMPLATE_PARTS_DIAGRAMS,
  generateChecklistSchema,
  generateDefaultValues,
  type Equipment,
  type NormalizedChecklistFormProps,
} from '@/features/Checklists/lib/checklist-form-schema';
import { isHitchSectionCode } from '@/features/Checklists/utils/hitchSections';
import { getPendingDeviations } from '@/features/Mantenimiento/actions/maintenance-actions';
import { AdditionalDeviationModal } from '@/features/Mantenimiento/shared/components/AdditionalDeviationModal';
import { AllGoodDeviationPromptDialog } from '@/features/Mantenimiento/shared/components/AllGoodDeviationPromptDialog';
import type { PickableSection } from '@/features/Mantenimiento/shared/components/ChecklistItemPicker';
import { CriticalDeviationsRepairModal } from '@/features/Mantenimiento/shared/components/critical-deviations-repair-modal';
import { logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm, type Control, type FieldErrors, type FieldValues } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { DevAutoFillButton } from './DevAutoFillButton';

/**
 * Componente principal del formulario de checklist normalizado
 */
export function NormalizedChecklistForm({
  shouldDisabledInputs = true,
  template,
  equipments,
  customers = [],
  employees = [],
  currentUser,
  defaultEquipmentId,
  defaultAnswers,
  readOnly = false,
  canSubmit = true,
  defaultEmployeeId,
  defaultEmployeeName,
  defaultKilometer,
  defaultHitchEquipmentId,
  defaultCustomerId,
  defaultHorometro,
}: NormalizedChecklistFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [criticalItemsFailed, setCriticalItemsFailed] = useState<string[]>([]);
  const [showDeviationsModal, setShowDeviationsModal] = useState(false);
  const [pendingDeviations, setPendingDeviations] = useState<Awaited<ReturnType<typeof getPendingDeviations>>>([]);
  /**
   * IDs de los desvíos que pertenecen al equipo enganchado (ticket 677). Sirven para
   * mostrar en el modal a qué unidad se le va a imputar cada desvío.
   */
  const [hitchDeviationIds, setHitchDeviationIds] = useState<Set<string>>(new Set());
  const [supervisors, setSupervisors] = useState<Awaited<ReturnType<typeof fetchSupervisorsForEquipment>>>([]);
  const [showAllGoodPrompt, setShowAllGoodPrompt] = useState(false);
  const [showAdditionalDeviationModal, setShowAdditionalDeviationModal] = useState(false);
  const [currentEquipmentId, setCurrentEquipmentId] = useState<string | undefined>(defaultEquipmentId);
  const [createdAnswerId, setCreatedAnswerId] = useState<string | null>(null);

  // Estado para validación de kilometraje mínimo
  const [minKilometer, setMinKilometer] = useState<number | null>(null);
  const [kilometerError, setKilometerError] = useState<string | null>(null);

  // Estado para validación de horómetro mínimo
  const [minEngineHours, setMinEngineHours] = useState<number | null>(null);
  const [engineHoursError, setEngineHoursError] = useState<string | null>(null);

  // Estado para manejo de enganche (COD-290)
  const [selectedHitchEquipment, setSelectedHitchEquipment] = useState<string | null>(defaultHitchEquipmentId || null);
  const [showHitchSelector, setShowHitchSelector] = useState(false);
  const [compatibleHitchEquipment, setCompatibleHitchEquipment] = useState<Equipment[]>([]);
  const [isLoadingHitchEquipment, setIsLoadingHitchEquipment] = useState(false);

  /**
   * Códigos de las secciones que describen la unidad enganchada (ticket 677).
   * Se calculan una vez por plantilla; el detalle de por qué no salen de la BD
   * está en `utils/hitchSections.ts`.
   */
  const hitchSectionCodes = useMemo(() => {
    const codes = new Set<string>();
    template.checklist_template_sections?.forEach((section) => {
      const sectionCode = getSectionCode(section);
      if (isHitchSectionCode(sectionCode)) {
        codes.add(sectionCode);
      }
    });
    return codes;
  }, [template]);

  /**
   * La sección del enganche solo se muestra cuando el operario declaró qué unidad
   * lleva enganchada. Sin esa declaración, esos ítems no aplican a nada y sus
   * desvíos terminarían imputados a la unidad tractora.
   */
  const hiddenSectionCodes = useMemo(() => {
    if (selectedHitchEquipment) return new Set<string>();

    const hidden = new Set(hitchSectionCodes);

    // En modo consulta no se esconde lo que ya quedó registrado: las respuestas
    // anteriores al ticket 677 pudieron completar la sección del enganche sin
    // declarar la unidad, y ese dato tiene que seguir siendo visible.
    if (readOnly && defaultAnswers) {
      const storedAnswers = defaultAnswers as Record<string, unknown>;
      hitchSectionCodes.forEach((sectionCode) => {
        const sectionAnswers = storedAnswers[sectionCode];
        if (sectionAnswers && typeof sectionAnswers === 'object') {
          const hasAnyAnswer = Object.values(sectionAnswers as Record<string, unknown>).some(
            (value) => value !== null && value !== undefined && value !== ''
          );
          if (hasAnyAnswer) hidden.delete(sectionCode);
        }
      });
    }

    return hidden;
  }, [selectedHitchEquipment, hitchSectionCodes, readOnly, defaultAnswers]);

  // Generar schema y valores por defecto
  const schema = useMemo(() => generateChecklistSchema(template, hiddenSectionCodes), [template, hiddenSectionCodes]);
  const defaultValues = useMemo(
    () =>
      generateDefaultValues(
        template,
        defaultAnswers,
        defaultEquipmentId,
        defaultEmployeeName,
        defaultKilometer,
        defaultCustomerId,
        defaultHorometro
      ),
    [
      template,
      defaultAnswers,
      defaultEquipmentId,
      defaultEmployeeName,
      defaultKilometer,
      defaultCustomerId,
      defaultHorometro,
    ]
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onSubmit', // Validar solo al hacer submit la primera vez
    reValidateMode: 'onBlur', // Re-validar solo el campo específico cuando el usuario sale de él
  });

  // Typed control compatible con Controller/FormField (react-hook-form 7.71+ con schemas dinamicos)
  const typedControl = form.control as Control<FieldValues>;

  // Ordenar secciones por order_index
  const sortedSections = useMemo(
    () => [...(template.checklist_template_sections || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    [template]
  );

  /**
   * Secciones que realmente se renderizan y se guardan. Coincide con `sortedSections`
   * salvo cuando la plantilla tiene sección de enganche y no se declaró la unidad.
   */
  const visibleSections = useMemo(
    () => sortedSections.filter((section) => !hiddenSectionCodes.has(getSectionCode(section))),
    [sortedSections, hiddenSectionCodes]
  );

  /** Nombres de las secciones del enganche que quedaron ocultas por no declarar la unidad. */
  const hiddenHitchSectionNames = useMemo(
    () =>
      sortedSections
        .filter((section) => hiddenSectionCodes.has(getSectionCode(section)))
        .map((section) => section.name || section.section?.name || 'Sin nombre'),
    [sortedSections, hiddenSectionCodes]
  );

  /** Etiquetas legibles de cada unidad, para aclarar en el modal a quién se imputa el desvío. */
  const utEquipmentLabel = useMemo(
    () => equipments.find((eq) => eq.value === currentEquipmentId)?.label ?? null,
    [equipments, currentEquipmentId]
  );
  const hitchEquipmentLabel = useMemo(
    () =>
      compatibleHitchEquipment.find((eq) => eq.value === selectedHitchEquipment)?.label ??
      equipments.find((eq) => eq.value === selectedHitchEquipment)?.label ??
      null,
    [compatibleHitchEquipment, equipments, selectedHitchEquipment]
  );

  /** Secciones abiertas del acordeón. Controlado para poder abrir la del primer error. */
  const [openSections, setOpenSections] = useState<string[]>([]);

  /** Esta plantilla replica un formulario en papel con columna de OBSERVACIONES */
  const showItemObservations = TEMPLATES_WITH_ITEM_OBSERVATIONS.has(template.code ?? '');

  /** Diagrama de nomenclatura de partes, si la plantilla tiene uno */
  const partsDiagram = TEMPLATE_PARTS_DIAGRAMS[template.code ?? ''];
  const [showPartsDiagram, setShowPartsDiagram] = useState(false);

  /** nombre de campo -> id de la sección que lo contiene */
  const sectionByField = useMemo(() => {
    const map = new Map<string, string>();
    sortedSections.forEach((section) => {
      const sectionCode = getSectionCode(section);
      (section.checklist_template_items || []).forEach((item) => {
        const base = `${sectionCode}__${item.code || `item_${item.id}`}`;
        map.set(base, section.id);
        map.set(`${base}_left`, section.id);
        map.set(`${base}_right`, section.id);
      });
    });
    return map;
  }, [sortedSections]);

  /**
   * Un checklist puede tener más de cien items repartidos en secciones colapsadas,
   * así que un submit inválido tiene que decir qué falta y llevar hasta ahí: sin
   * esto el botón "Guardar" no producía ninguna reacción visible.
   */
  const handleInvalid = useCallback(
    (errors: FieldErrors<FieldValues>) => {
      const pending = Object.keys(errors);
      logger.debug('Checklist inválido', { data: { pending } });
      if (pending.length === 0) return;

      toast.error(pending.length === 1 ? 'Falta responder 1 item' : `Faltan responder ${pending.length} items`, {
        description: 'Te llevamos al primero que quedó sin completar.',
      });

      const firstField = pending[0];
      const sectionId = sectionByField.get(firstField);
      if (sectionId) {
        setOpenSections((prev) => (prev.includes(sectionId) ? prev : [...prev, sectionId]));
      }

      // Radix desmonta el contenido de las secciones cerradas: hay que esperar a que
      // el panel se monte antes de poder enfocar el campo.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.getElementsByName(firstField)[0];
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          form.setFocus(firstField);
        });
      });
    },
    [form, sectionByField]
  );

  // Secciones e items adaptados al formato requerido por ChecklistItemPicker.
  // Se usan las visibles: si no se declaró el enganche, sus ítems no se pueden
  // elegir como desvío adicional (no habría a qué unidad imputarlos).
  const pickableSections: PickableSection[] = useMemo(
    () =>
      visibleSections.map((section) => ({
        id: section.id,
        code: section.code,
        name: section.name || section.section?.name || 'Sin nombre',
        order_index: section.order_index ?? null,
        items: (section.checklist_template_items ?? [])
          .slice()
          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
          .map((item) => ({
            id: item.id,
            code: item.code,
            label: item.label,
            is_critical: item.is_critical ?? false,
          })),
      })),
    [visibleSections]
  );

  // Detectar si el equipo seleccionado tiene enganche (COD-290)
  const selectedEquipmentId = form.watch('equipment_id');

  /**
   * Datos del equipo elegido. El formulario en papel los pide escritos a mano
   * (marca, N° de serie); acá ya viajan con el listado, así que se muestran en
   * vez de pedirlos: además le sirve al operario para confirmar que escaneó el
   * QR del equipo correcto.
   */
  const selectedEquipmentSummary = useMemo(
    () => equipments.find((eq) => eq.value === selectedEquipmentId),
    [equipments, selectedEquipmentId]
  );
  // const selectedEquipment = useMemo(
  //   () => equipments.find((eq) => eq.value === selectedEquipmentId),
  //   [equipments, selectedEquipmentId]
  // );

  logger.debug('equipments loaded', { data: { count: equipments.length } });

  /**
   * Tipo del equipo seleccionado (React Query sobre la server action, no `useEffect` + fetch):
   * define si el checklist puede llevar un acoplado enganchado.
   */
  const { data: equipmentTypeInfo } = useQuery({
    queryKey: ['checklist-equipment-type', selectedEquipmentId],
    queryFn: () => getEquipmentTypeInfo(selectedEquipmentId as string),
    enabled: Boolean(selectedEquipmentId),
    staleTime: 5 * 60 * 1000,
  });

  const selectedEquipmentType = selectedEquipmentId ? equipmentTypeInfo ?? null : null;

  /**
   * Al cambiar de equipo se descarta el enganche elegido y sus equipos compatibles: son del
   * equipo anterior. En modo sólo lectura se conserva el que vino por prop.
   */
  useEffect(() => {
    if (!readOnly || !defaultHitchEquipmentId) {
      setSelectedHitchEquipment(null);
    }
    setCompatibleHitchEquipment([]);
    setShowHitchSelector(false);
  }, [selectedEquipmentId, readOnly, defaultHitchEquipmentId]);

  // Auto-poblar kilometraje y horómetro cuando se selecciona un equipo
  useEffect(() => {
    if (!selectedEquipmentId || readOnly) {
      return;
    }

    const selectedEquipment = equipments.find((eq) => eq.value === selectedEquipmentId);
    if (selectedEquipment) {
      const equipmentKilometer = selectedEquipment.kilometer;
      const equipmentEngineHours = selectedEquipment.engine_hours;

      // Guardar el kilometraje mínimo para validación
      const kilometerNumber = equipmentKilometer ? parseInt(equipmentKilometer, 10) : null;
      setMinKilometer(isNaN(kilometerNumber!) ? null : kilometerNumber);

      // Auto-poblar el campo de kilometraje con el valor actual del equipo
      if (equipmentKilometer) {
        form.setValue('kilometraje', equipmentKilometer);
        // Limpiar cualquier error previo
        setKilometerError(null);
      }

      // Guardar el horómetro mínimo para validación
      const engineHoursNumber = equipmentEngineHours ? parseInt(equipmentEngineHours, 10) : null;
      setMinEngineHours(isNaN(engineHoursNumber!) ? null : engineHoursNumber);

      // Auto-poblar el campo de horómetro con el valor actual del equipo
      if (equipmentEngineHours) {
        form.setValue('horometro', equipmentEngineHours);
        // Limpiar cualquier error previo
        setEngineHoursError(null);
      }
    } else {
      setMinKilometer(null);
      setMinEngineHours(null);
    }
  }, [selectedEquipmentId, equipments, form, readOnly]);

  // Función para abrir el selector de enganche y cargar equipos compatibles
  const handleOpenHitchSelector = async () => {
    if (!selectedEquipmentId) {
      const { toast } = await import('sonner');
      toast.error('Debes seleccionar un equipo primero');
      return;
    }

    setIsLoadingHitchEquipment(true);
    setShowHitchSelector(true);

    try {
      const compatibleEquipment = await getCompatibleEquipmentForHitch(selectedEquipmentId);
      setCompatibleHitchEquipment(compatibleEquipment);

      if (compatibleEquipment.length === 0) {
        const { toast } = await import('sonner');
        toast.warning('No se encontraron equipos compatibles para enganche');
      }
    } catch (error) {
      logger.error('Error loading compatible equipment', { data: { error } });
      const { toast } = await import('sonner');
      toast.error('Error al cargar equipos compatibles');
    } finally {
      setIsLoadingHitchEquipment(false);
    }
  };

  // Determinar si debe mostrar el botón de enganche (COD-290 - Condición 3)
  // En modo readOnly, mostrar si hay un enganche seleccionado
  const shouldShowHitchButton =
    (selectedEquipmentType?.is_tractor_unit === true && selectedEquipmentType?.has_hitch === true && !readOnly) ||
    (readOnly && selectedHitchEquipment !== null);

  // Limpia el form y los estados de UI después de un submit exitoso.
  // Necesario porque Next.js cachea esta ruta y si el usuario vuelve al `/new`
  // los datos anteriores siguen presentes, mezclándose con la nueva respuesta.
  const resetFormAfterSubmit = useCallback(() => {
    form.reset(defaultValues);
    setCriticalItemsFailed([]);
    setPendingDeviations([]);
    setCreatedAnswerId(null);
    setCurrentEquipmentId(defaultEquipmentId);
    setSelectedHitchEquipment(defaultHitchEquipmentId || null);
    setKilometerError(null);
    setEngineHoursError(null);
    setMinKilometer(null);
    setMinEngineHours(null);
  }, [form, defaultValues, defaultEquipmentId, defaultHitchEquipmentId]);

  const redirectAfterChecklist = useCallback(
    (equipmentId: string) => {
      resetFormAfterSubmit();
      if (pathname?.includes('/dashboard/forms/')) {
        const formIdMatch = pathname.match(/\/dashboard\/forms\/([^/]+)/);
        if (formIdMatch?.[1]) {
          router.push(`/dashboard/forms/${formIdMatch[1]}`);
        } else {
          router.push('/dashboard/forms');
        }
      } else {
        router.push(`/maintenance/equipment/${equipmentId}/checklists`);
      }
      queryClient.invalidateQueries();
      router.refresh();
    },
    [pathname, router, queryClient, resetFormAfterSubmit]
  );

  const onSubmit = async (data: z.infer<typeof schema>) => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setCriticalItemsFailed([]);
    setKilometerError(null);
    setEngineHoursError(null);

    // Validar que el kilometraje no sea menor al kilometraje actual del equipo
    if (minKilometer !== null && data.kilometraje) {
      const enteredKilometer = parseInt(data.kilometraje, 10);
      if (!isNaN(enteredKilometer) && enteredKilometer < minKilometer) {
        setKilometerError(
          `El kilometraje ingresado (${enteredKilometer.toLocaleString('es-AR')} km) no puede ser menor al kilometraje actual del equipo (${minKilometer.toLocaleString('es-AR')} km)`
        );
        setIsSubmitting(false);
        // Mostrar toast de error
        const { toast } = await import('sonner');
        toast.error('Error de validación', {
          description: `El kilometraje no puede ser menor a ${minKilometer.toLocaleString('es-AR')} km`,
        });
        return;
      }
    }

    // Validar que el horómetro no sea menor al horómetro actual del equipo
    if (minEngineHours !== null && data.horometro) {
      const enteredEngineHours = parseInt(data.horometro, 10);
      if (!isNaN(enteredEngineHours) && enteredEngineHours < minEngineHours) {
        setEngineHoursError(
          `El horómetro ingresado (${enteredEngineHours.toLocaleString('es-AR')} hs) no puede ser menor al horómetro actual del equipo (${minEngineHours.toLocaleString('es-AR')} hs)`
        );
        setIsSubmitting(false);
        const { toast } = await import('sonner');
        toast.error('Error de validación', {
          description: `El horómetro no puede ser menor a ${minEngineHours.toLocaleString('es-AR')} hs`,
        });
        return;
      }
    }

    try {
      // Qué ítems generan desvío y cuáles son críticos lo decide `lib/checklist-evaluation`
      // (módulo puro con tests): el componente sólo reparte el resultado entre la unidad
      // tractora y el acoplado (ticket 677), que se guardan en checklists distintos.
      const deviations = computeDeviations(data, { sections: visibleSections, hitchSectionCodes });
      const toFailedItem = ({ is_hitch: _isHitch, ...deviation }: ChecklistDeviation) => deviation;
      const failedItems = deviations.filter((deviation) => !deviation.is_hitch).map(toFailedItem);
      const hitchFailedItems = deviations.filter((deviation) => deviation.is_hitch).map(toFailedItem);

      // Para compatibilidad con el código existente, mantener la referencia a failedCriticalItems
      const failedCriticalItems = failedItems;

      /**
       * Observaciones por item, indexadas por nombre de campo.
       *
       * Van en una clave propia de `answer_data` y NO dentro de `answers`: el
       * cálculo del resultado recorre ese subárbol buscando el literal "M", así
       * que una observación que dijera "M" marcaría el checklist como fallido.
       */
      const itemObservations = collectItemObservations(data, visibleSections);

      // Estructurar las respuestas por sección
      const answersBySection = buildAnswersBySection(data, visibleSections);

      // Guardar en checklist_answers
      // NOTA: El kilometraje ya NO se actualiza directamente aquí.
      // Se actualizará cuando se apruebe la entrada a taller en el nuevo flujo de mantenimiento.

      // Guardar checklist para el equipo UT
      // NUEVO FLUJO: Usar failed_items que incluye TODOS los items con "M" (no solo críticos)
      const checklistAnswer = await CreateChecklistAnswer(template.id, {
        equipment_id: data.equipment_id,
        customer_id: data.customer_id || null,
        employee_id: defaultEmployeeId,
        // ID del empleado chofer — se guarda como columna FK directa en checklist_answers
        chofer_employee_id: (data as Record<string, unknown>).chofer_employee_id as string | null | undefined,
        chofer: data.chofer,
        fecha: data.fecha,
        hora: data.hora,
        kilometraje: data.kilometraje,
        horometro: data.horometro,
        observaciones: data.observaciones,
        answers: answersBySection,
        [ITEM_OBSERVATIONS_KEY]: itemObservations,
        failed_items: failedItems, // Nuevo formato con is_critical
        critical_items_failed: failedCriticalItems, // Mantener por compatibilidad
      });

      setCurrentEquipmentId(data.equipment_id);
      setCreatedAnswerId(checklistAnswer.id);

      // Si hay enganche seleccionado, guardar el mismo checklist para el equipo enganchado (COD-290)
      // IMPORTANTE (ticket 677): los desvíos de la sección del enganche se crean en ESTE
      // checklist, no en el de la unidad tractora, para que la solicitud de mantenimiento
      // (y por lo tanto el costo) se impute a la patente del acoplado.
      let hitchAnswerId: string | null = null;
      if (selectedHitchEquipment) {
        try {
          const hitchChecklistAnswer = await CreateChecklistAnswer(template.id, {
            equipment_id: selectedHitchEquipment,
            customer_id: data.customer_id || null,
            employee_id: defaultEmployeeId,
            // Mismo chofer que la UT
            chofer_employee_id: (data as Record<string, unknown>).chofer_employee_id as string | null | undefined,
            chofer: data.chofer,
            fecha: data.fecha,
            hora: data.hora,
            kilometraje: data.kilometraje,
            horometro: data.horometro,
            observaciones: data.observaciones,
            answers: answersBySection, // Mismo resultado para ambos equipos
            [ITEM_OBSERVATIONS_KEY]: itemObservations,
            // Solo los desvíos de la sección que describe al enganche
            failed_items: hitchFailedItems,
            ut_checklist_answer_id: checklistAnswer.id, // Vincular con el checklist del UT
          });

          hitchAnswerId = hitchChecklistAnswer.id;

          logger.info('[CHECKLIST] Created duplicate checklist answer for hitched equipment', {
            data: {
              hitchEquipmentId: selectedHitchEquipment,
              utAnswerId: checklistAnswer.id,
              hitchDeviations: hitchFailedItems.length,
            },
          });
        } catch (error) {
          logger.error('Error creating checklist answer for hitched equipment', { data: { error } });
          const { toast } = await import('sonner');
          toast.error('Error al guardar el checklist para el equipo enganchado');
          // No fallar completamente, pero loguear el error
        }
      }

      // NUEVO FLUJO: Mostrar modal si hay CUALQUIER item fallido (crítico o no),
      // sea de la unidad tractora o del enganche.
      const allFailedItems = [...failedItems, ...hitchFailedItems];
      if (allFailedItems.length > 0) {
        setCriticalItemsFailed(allFailedItems.map((item) => item.item_label));

        // Obtener los desvíos creados y los supervisores disponibles para el modal
        try {
          logger.info('[NormalizedChecklistForm] Obteniendo desvíos para equipment_id', {
            data: {
              equipmentId: data.equipment_id,
              checklistAnswerId: checklistAnswer.id,
              hitchEquipmentId: selectedHitchEquipment,
              hitchAnswerId,
            },
          });
          // Solo los desvíos de ESTE checklist: traer los de otros checklists hacía que la
          // solicitud se asociara al checklist equivocado y que los desvíos recién cargados
          // quedaran sin solicitud.
          // Los del enganche viven en su propio checklist y bajo su propia patente,
          // así que se piden por separado (ticket 677).
          const [utDeviations, hitchDeviations, supervisorsList] = await Promise.all([
            getPendingDeviations(data.equipment_id, {
              checklistAnswerId: checklistAnswer.id,
              onlyWithoutRequest: true,
            }),
            selectedHitchEquipment && hitchAnswerId
              ? getPendingDeviations(selectedHitchEquipment, {
                  checklistAnswerId: hitchAnswerId,
                  onlyWithoutRequest: true,
                })
              : Promise.resolve([]),
            // La empresa sale del equipo: este formulario corre también sin sesión (QR).
            fetchSupervisorsForEquipment(data.equipment_id),
          ]);

          const deviations = [...utDeviations, ...hitchDeviations];
          setHitchDeviationIds(new Set(hitchDeviations.map((deviation) => deviation.id)));

          logger.debug('[NormalizedChecklistForm] Desvíos obtenidos', {
            data: { count: deviations.length, hitchCount: hitchDeviations.length, deviations },
          });
          logger.debug('[NormalizedChecklistForm] Supervisores obtenidos', {
            data: { count: supervisorsList?.length || 0 },
          });

          setPendingDeviations(deviations);
          setSupervisors(supervisorsList);
          setShowDeviationsModal(true);
          // NO redirigir aquí, esperar a que el modal se cierre

          // Contar críticos vs no críticos para el mensaje
          const criticalCount = allFailedItems.filter((item) => item.is_critical).length;

          const { toast } = await import('sonner');
          toast.success('Checklist guardado', {
            description: `Se detectaron ${allFailedItems.length} item(s) con fallos${criticalCount > 0 ? ` (${criticalCount} crítico(s))` : ''}. Por favor, registra los desvíos.`,
          });
        } catch (error) {
          logger.error('Error fetching deviations or supervisors', { data: { error } });
          const { toast } = await import('sonner');
          toast.success('Checklist guardado', {
            description: `Se detectaron ${allFailedItems.length} item(s) con fallos`,
          });

          // Si no se puede cargar el modal, redirigir a la lista de respuestas
          setTimeout(() => {
            if (pathname?.includes('/dashboard/forms/')) {
              const formIdMatch = pathname.match(/\/dashboard\/forms\/([^/]+)/);
              if (formIdMatch && formIdMatch[1]) {
                router.push(`/dashboard/forms/${formIdMatch[1]}`);
              } else {
                router.push('/dashboard/forms');
              }
            } else {
              router.push(`/maintenance/equipment/${data.equipment_id}/checklists`);
            }
            queryClient.invalidateQueries();
            router.refresh();
          }, 1500);
        }
      } else {
        const { toast } = await import('sonner');
        toast.success('Checklist guardado correctamente');
        setShowAllGoodPrompt(true);
      }
    } catch (error) {
      logger.error('Error al guardar el checklist', { data: { error } });
      // TODO: Mostrar toast de error
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, handleInvalid)} className="space-y-6">
        {/* Información del checklist */}
        <Card>
          <CardHeader>
            <CardTitle>{template.name}</CardTitle>
            {template.description && <CardDescription>{template.description}</CardDescription>}
          </CardHeader>
        </Card>

        {/* Alerta de items críticos fallidos */}
        {criticalItemsFailed.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Items críticos fallidos:</strong>
              <ul className="list-disc list-inside mt-2">
                {criticalItemsFailed.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-2">Se generarán solicitudes de reparación automáticamente.</p>
            </AlertDescription>
          </Alert>
        )}

        <ChecklistGeneralInfoSection
          form={form}
          typedControl={typedControl}
          readOnly={readOnly}
          shouldDisabledInputs={shouldDisabledInputs}
          equipments={equipments}
          customers={customers}
          employees={employees}
          selectedEquipmentSummary={selectedEquipmentSummary}
          selectedHitchEquipment={selectedHitchEquipment}
          setSelectedHitchEquipment={setSelectedHitchEquipment}
          shouldShowHitchButton={shouldShowHitchButton}
          handleOpenHitchSelector={handleOpenHitchSelector}
          hiddenHitchSectionNames={hiddenHitchSectionNames}
          compatibleHitchEquipment={compatibleHitchEquipment}
          selectedEquipmentId={selectedEquipmentId}
          minKilometer={minKilometer}
          kilometerError={kilometerError}
          setKilometerError={setKilometerError}
          minEngineHours={minEngineHours}
          engineHoursError={engineHoursError}
          setEngineHoursError={setEngineHoursError}
        />

        {/* Ayuda de consulta: nomenclatura de partes del formulario en papel.
            Va como enlace tenue para no agregar un bloque que el resto de los
            checklists no tiene. */}
        {partsDiagram && (
          <div className="-mt-3 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs font-normal text-muted-foreground/80 hover:text-foreground"
              onClick={() => setShowPartsDiagram(true)}
            >
              <HelpCircle className="w-3.5 h-3.5 mr-1.5" />
              Ver diagrama de partes
            </Button>
          </div>
        )}

        {/*
          "multiple" en vez de "single": con una sola sección abierta a la vez, Radix
          desmontaba el resto y los mensajes de error de los items pendientes no
          llegaban siquiera a existir en el DOM.
        */}
        <Accordion type="multiple" className="w-full space-y-6" value={openSections} onValueChange={setOpenSections}>
          {/* Secciones del checklist (la del enganche solo si se declaró la unidad) */}
          {visibleSections.map((section) => {
            const sectionCode = getSectionCode(section);
            const sectionName = section.name || section.section?.name || 'Sin nombre';
            const sectionDescription = section.section?.description || null;

            // Ordenar items por order_index y eliminar duplicados por ID
            const allItems = section.checklist_template_items || [];

            const uniqueItems = Array.from(new Map(allItems.map((item) => [item.id, item])).values());

            const sortedItems = uniqueItems.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

            // Contar items fallidos en la sección (solo en modo readOnly)
            const failedCount = readOnly
              ? sortedItems.reduce((count, item) => {
                  const itemCode = item.code || `item_${item.id}`;
                  const fieldName = `${sectionCode}__${itemCode}`;
                  const val = form.getValues(fieldName);
                  const leftVal = form.getValues(`${fieldName}_left`);
                  const rightVal = form.getValues(`${fieldName}_right`);
                  const hasFail = (v: unknown) => v === 'M' || v === 'Malo';
                  return count + (hasFail(val) || hasFail(leftVal) || hasFail(rightVal) ? 1 : 0);
                }, 0)
              : 0;

            return (
              <Card key={section.id}>
                <AccordionItem className="pr-5" value={section.id}>
                  <AccordionTrigger>
                    <CardHeader className="text-start flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle>{sectionName}</CardTitle>
                        {failedCount > 0 && (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {failedCount} {failedCount === 1 ? 'item fallido' : 'items fallidos'}
                          </Badge>
                        )}
                      </div>
                      {sectionDescription && <CardDescription>{sectionDescription}</CardDescription>}
                    </CardHeader>
                  </AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-4 text-balance">
                    <CardContent>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {sortedItems.map((item) => (
                          <ChecklistItemField
                            key={item.id}
                            item={item}
                            sectionCode={sectionCode}
                            form={form}
                            readOnly={readOnly}
                            showObservations={showItemObservations}
                          />
                        ))}
                      </div>
                    </CardContent>
                    <AccordionTrigger className="text-start border-t-2 border-muted p-5 pb-0">Cerrar</AccordionTrigger>
                  </AccordionContent>
                </AccordionItem>
              </Card>
            );
          })}
        </Accordion>

        <ChecklistPartsDiagramDialog
          partsDiagram={partsDiagram}
          open={showPartsDiagram}
          onOpenChange={setShowPartsDiagram}
        />

        {/* Botones de acción */}
        {!readOnly && !canSubmit && (
          <Alert role="status">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No tenés permiso para enviar formularios. Podés ver su contenido, pero para responderlo necesitás el
              permiso de creación en Formularios.
            </AlertDescription>
          </Alert>
        )}
        {!readOnly && canSubmit && (
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => form.reset()}>
              Limpiar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar Checklist'}
            </Button>
          </div>
        )}
      </form>

      {/* Modal para seleccionar equipo enganchado (COD-290) */}
      <HitchEquipmentDialog
        showHitchSelector={showHitchSelector}
        setShowHitchSelector={setShowHitchSelector}
        isLoadingHitchEquipment={isLoadingHitchEquipment}
        compatibleHitchEquipment={compatibleHitchEquipment}
        selectedHitchEquipment={selectedHitchEquipment}
        setSelectedHitchEquipment={setSelectedHitchEquipment}
      />

      {/* Modal para generar solicitudes de reparación desde desvíos */}
      {currentEquipmentId && (
        <CriticalDeviationsRepairModal
          isOpen={showDeviationsModal}
          onClose={() => {
            setShowDeviationsModal(false);
            resetFormAfterSubmit();
            // Redirigir a la lista de respuestas con delay para que el Dialog termine su animación
            setTimeout(() => {
              if (pathname?.includes('/dashboard/forms/')) {
                const formIdMatch = pathname.match(/\/dashboard\/forms\/([^/]+)/);
                if (formIdMatch && formIdMatch[1]) {
                  router.push(`/dashboard/forms/${formIdMatch[1]}`);
                } else {
                  router.push('/dashboard/forms');
                }
              } else {
                router.push(`/maintenance/equipment/${currentEquipmentId}/checklists`);
              }
              queryClient.invalidateQueries();
              router.refresh();
            }, 300);
          }}
          onComplete={() => {
            setShowDeviationsModal(false);
            resetFormAfterSubmit();
            // Redirigir a la lista de respuestas
            // NOTA: No llamar router.refresh() después de router.push() porque interfiere con la navegación
            if (pathname?.includes('/dashboard/forms/')) {
              const formIdMatch = pathname.match(/\/dashboard\/forms\/([^/]+)/);
              if (formIdMatch && formIdMatch[1]) {
                router.push(`/dashboard/forms/${formIdMatch[1]}`);
              } else {
                router.push('/dashboard/forms');
              }
            } else {
              router.push(`/maintenance/equipment/${currentEquipmentId}/checklists`);
            }
          }}
          deviations={pendingDeviations.map((d) => ({
            id: d.id,
            item_code: d.item_code,
            item_label: d.item_label,
            section_code: d.section_code,
            is_critical: d.is_critical ?? false,
            checklistAnswerId: d.checklist_answer_id,
            driver_comment: d.driver_comment,
            created_at: d.created_at?.toISOString() ?? new Date().toISOString(),
            // Unidad a la que se le imputa el desvío. Solo se muestra cuando hay
            // enganche declarado: sin él no hay ambigüedad que aclarar.
            equipment_label: selectedHitchEquipment
              ? hitchDeviationIds.has(d.id)
                ? hitchEquipmentLabel
                : utEquipmentLabel
              : null,
          }))}
          equipmentId={currentEquipmentId}
          checklistAnswerId={createdAnswerId ?? undefined}
          driverEmployeeId={defaultEmployeeId}
        />
      )}

      <AllGoodDeviationPromptDialog
        isOpen={showAllGoodPrompt}
        onCancel={() => {
          setShowAllGoodPrompt(false);
          if (currentEquipmentId) redirectAfterChecklist(currentEquipmentId);
        }}
        onConfirm={() => {
          setShowAllGoodPrompt(false);
          setShowAdditionalDeviationModal(true);
        }}
      />
      {currentEquipmentId && createdAnswerId && (
        <AdditionalDeviationModal
          isOpen={showAdditionalDeviationModal}
          onClose={() => {
            setShowAdditionalDeviationModal(false);
            redirectAfterChecklist(currentEquipmentId);
          }}
          onSuccess={() => {
            setShowAdditionalDeviationModal(false);
            redirectAfterChecklist(currentEquipmentId);
          }}
          checklistAnswerId={createdAnswerId}
          equipmentId={currentEquipmentId}
          sections={pickableSections}
          driverEmployeeId={defaultEmployeeId}
          employeeId={defaultEmployeeId}
          userId={currentUser?.id}
          kilometer={form.getValues('kilometraje')?.toString()}
        />
      )}

      {/* Botón de autocompletado para desarrollo */}
      <DevAutoFillButton form={form} template={template} />
    </Form>
  );
}
