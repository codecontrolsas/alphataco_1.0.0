'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { getEquipmentTypeInfo } from '@/features/Checklists/actions/checklist-queries';
import { ChecklistGeneralInfoSection } from '@/features/Checklists/components/sections/ChecklistGeneralInfoSection';
import { ChecklistPartsDiagramDialog } from '@/features/Checklists/components/sections/ChecklistPartsDiagramDialog';
import { ChecklistRepairDeviationsModal } from '@/features/Checklists/components/sections/ChecklistRepairDeviationsModal';
import { ChecklistSectionsAccordion } from '@/features/Checklists/components/sections/ChecklistSectionsAccordion';
import { HitchEquipmentDialog } from '@/features/Checklists/components/sections/HitchEquipmentDialog';
import { useChecklistEquipmentSync } from '@/features/Checklists/hooks/useChecklistEquipmentSync';
import { useChecklistInvalidNavigation } from '@/features/Checklists/hooks/useChecklistInvalidNavigation';
import { useChecklistSections } from '@/features/Checklists/hooks/useChecklistSections';
import { useChecklistSubmit } from '@/features/Checklists/hooks/useChecklistSubmit';
import {
  TEMPLATES_WITH_ITEM_OBSERVATIONS,
  TEMPLATE_PARTS_DIAGRAMS,
  generateChecklistSchema,
  generateDefaultValues,
  type NormalizedChecklistFormProps,
} from '@/features/Checklists/lib/checklist-form-schema';
import { getChecklistRedirectPath } from '@/features/Checklists/lib/checklist-redirect';
import { buildPickableSections } from '@/features/Checklists/lib/pickable-sections';
import { AdditionalDeviationModal } from '@/features/Mantenimiento/shared/components/AdditionalDeviationModal';
import { AllGoodDeviationPromptDialog } from '@/features/Mantenimiento/shared/components/AllGoodDeviationPromptDialog';
import { logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, HelpCircle } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useForm, type Control, type FieldValues } from 'react-hook-form';
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
  canRequestRepair = true,
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
  const [showAdditionalDeviationModal, setShowAdditionalDeviationModal] = useState(false);
  // El estado del enganche vive acá porque de él depende el schema (que se crea antes que `form`)
  const [selectedHitchEquipment, setSelectedHitchEquipment] = useState<string | null>(defaultHitchEquipmentId || null);

  const { hitchSectionCodes, hiddenSectionCodes, sortedSections, visibleSections, hiddenHitchSectionNames } =
    useChecklistSections({ template, selectedHitchEquipment, readOnly, defaultAnswers });

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

  const selectedEquipmentId = form.watch('equipment_id');

  const {
    showHitchSelector,
    setShowHitchSelector,
    compatibleHitchEquipment,
    isLoadingHitchEquipment,
    handleOpenHitchSelector,
    minKilometer,
    setMinKilometer,
    kilometerError,
    setKilometerError,
    minEngineHours,
    setMinEngineHours,
    engineHoursError,
    setEngineHoursError,
  } = useChecklistEquipmentSync({
    form,
    equipments,
    selectedEquipmentId,
    readOnly,
    defaultHitchEquipmentId,
    setSelectedHitchEquipment,
  });

  const {
    onSubmit,
    isSubmitting,
    criticalItemsFailed,
    setCriticalItemsFailed,
    showDeviationsModal,
    setShowDeviationsModal,
    pendingDeviations,
    setPendingDeviations,
    hitchDeviationIds,
    showAllGoodPrompt,
    setShowAllGoodPrompt,
    currentEquipmentId,
    setCurrentEquipmentId,
    createdAnswerId,
    setCreatedAnswerId,
  } = useChecklistSubmit({
    canSubmit,
    canRequestRepair,
    template,
    visibleSections,
    hitchSectionCodes,
    defaultEmployeeId,
    defaultEquipmentId,
    selectedHitchEquipment,
    minKilometer,
    minEngineHours,
    setKilometerError,
    setEngineHoursError,
  });

  /** Esta plantilla replica un formulario en papel con columna de OBSERVACIONES */
  const showItemObservations = TEMPLATES_WITH_ITEM_OBSERVATIONS.has(template.code ?? '');

  /** Diagrama de nomenclatura de partes, si la plantilla tiene uno */
  const partsDiagram = TEMPLATE_PARTS_DIAGRAMS[template.code ?? ''];
  const [showPartsDiagram, setShowPartsDiagram] = useState(false);

  const { openSections, setOpenSections, handleInvalid } = useChecklistInvalidNavigation({ form, sortedSections });
  const pickableSections = useMemo(() => buildPickableSections(visibleSections), [visibleSections]);

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
      router.push(getChecklistRedirectPath(pathname, equipmentId));
      queryClient.invalidateQueries();
      router.refresh();
    },
    [pathname, router, queryClient, resetFormAfterSubmit]
  );

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
        <ChecklistSectionsAccordion
          form={form}
          visibleSections={visibleSections}
          readOnly={readOnly}
          showItemObservations={showItemObservations}
          openSections={openSections}
          setOpenSections={setOpenSections}
        />

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
        <ChecklistRepairDeviationsModal
          isOpen={showDeviationsModal}
          onReset={() => {
            setShowDeviationsModal(false);
            resetFormAfterSubmit();
          }}
          deviations={pendingDeviations}
          hitchDeviationIds={hitchDeviationIds}
          equipments={equipments}
          compatibleHitchEquipment={compatibleHitchEquipment}
          selectedHitchEquipment={selectedHitchEquipment}
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
