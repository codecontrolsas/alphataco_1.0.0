'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { fetchSupervisorsForResource } from '@/features/Checklists/actions/actionsServer';
import {
  fetchAllEquipmentBasicData,
  fetchAllOtherEquipmentBasicData,
} from '@/features/Mantenimiento/actions/equipment-basic';
import { isNonPropagatingChecklistItem } from '@/features/Mantenimiento/constants/non-propagating-checklist-items';
import { ManualItemsInput, type ManualItem } from '@/features/Mantenimiento/shared/components/ManualItemsInput';
import {
  ManualRepairsInput,
  type ManualRepair,
  type ManualRepairDraftState,
  type ManualRepairsInputHandle,
} from '@/features/Mantenimiento/shared/components/ManualRepairsInput';
import type { MaintenanceResourceKind } from '@/features/Mantenimiento/shared/maintenance-resource';
import {
  PREVENTIVE_TYPES,
  PREVENTIVE_TYPE_DESCRIPTIONS,
  PREVENTIVE_TYPE_ICONS,
  type PreventiveType,
} from '@/features/Mantenimiento/shared/preventive-maintenance';
import { uploadRepairImages } from '@/features/Mantenimiento/shared/utils/uploadRepairImages';
import { invalidateAllMaintenanceQueries } from '@/features/Mantenimiento/utils/queryInvalidation';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { conditionLabels } from '@/shared/utils/mappers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  Info,
  Loader2,
  Lock,
  PencilLine,
  Plus,
  Truck,
  User,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { createMaintenanceOrderFromDeviations } from '../actions/orders.server';
import { MAX_RESOURCE_RESULTS, RESOURCE_KIND_ORDER, ResourceKindCard, normalizeSearchText } from './nuevo-pedido/SelectableCard';
import { StepChecklistItems } from './nuevo-pedido/StepChecklistItems';
import { StepConfirm } from './nuevo-pedido/StepConfirm';
import { StepEquipmentSelector } from './nuevo-pedido/StepEquipmentSelector';
import { StepRequestType } from './nuevo-pedido/StepRequestType';
import { StepSupervisor } from './nuevo-pedido/StepSupervisor';
import { REQUEST_TYPE_ORDER, type RequestType, type SelectedDeviation } from './nuevo-pedido/types';
import { getChecklistTemplatesForEquipment, getCurrentUserForSupervisorCheck } from '../actions/queries.server';
import { createManualMaintenanceRequest, createMaintenanceRequestPendingApproval } from '../actions/requests.server';

const logger = new Logger('NuevoPedidoChecklistForm');

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
interface NuevoPedidoChecklistFormProps {
  equipment: Awaited<ReturnType<typeof fetchAllEquipmentBasicData>>;
  default_equipment_id?: string;
  onSuccess?: () => void;
  driverEmployeeId?: string;
  driverName?: string;
  driverFileNumber?: string;
  skipSupervisorQuestion?: boolean;
  successRedirectUrl?: string;
}

export function NuevoPedidoChecklistForm({
  equipment,
  default_equipment_id,
  onSuccess,
  driverEmployeeId,
  driverName,
  driverFileNumber,
  skipSupervisorQuestion = false,
  successRedirectUrl,
}: NuevoPedidoChecklistFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Estado del paso actual (0-indexed)
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Tipo de recurso (ticket 596): define qué se lista en el selector del paso Equipo
  const [resourceKind, setResourceKind] = useState<MaintenanceResourceKind>('vehicle');
  const isOtherEquipment = resourceKind === 'other_equipment';

  /**
   * Tarjetas de "Tipo de pedido" que se ofrecen para el recurso elegido.
   * Los equipamientos no tienen programa preventivo (ticket 654), así que su
   * tarjeta no se renderiza y tampoco entra en la navegación por flechas.
   */
  const visibleRequestTypes = useMemo(
    () => (isOtherEquipment ? REQUEST_TYPE_ORDER.filter((type) => type !== 'preventive') : REQUEST_TYPE_ORDER),
    [isOtherEquipment]
  );

  // Tipo de pedido
  const [requestType, setRequestType] = useState<RequestType>('checklist');
  const [selectedPreventiveType, setSelectedPreventiveType] = useState<PreventiveType | ''>('');
  const [preventiveDescription, setPreventiveDescription] = useState<string>('');

  // Paso 1: Selección de equipo
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>(default_equipment_id || '');
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Pre-fill km/hours from default equipment if provided
  const defaultEquip = default_equipment_id ? equipment?.find((e) => e.id === default_equipment_id) : null;
  const [kilometer, setKilometer] = useState(defaultEquip?.kilometer || '');
  const [engineHours, setEngineHours] = useState(defaultEquip?.engine_hours || '');

  // Paso 2: Selección de checklist
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Paso 3: Selección de items/desvíos
  const [selectedDeviations, setSelectedDeviations] = useState<SelectedDeviation[]>([]);
  const [deviationComments, setDeviationComments] = useState<Record<string, string>>({});
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);

  // Paso 3 (carga manual): reparaciones cargadas directamente, sin checklist
  const [manualRepairs, setManualRepairs] = useState<ManualRepair[]>([]);
  // El borrador de reparacion vive dentro de ManualRepairsInput; este ref permite
  // guardarlo al avanzar en vez de descartarlo en silencio.
  const manualRepairsRef = useRef<ManualRepairsInputHandle>(null);
  // Habilita "Siguiente" cuando hay una reparacion escrita sin agregar: al avanzar
  // se guarda sola (ver handleAdvanceStep).
  const [hasPendingManualDraft, setHasPendingManualDraft] = useState(false);
  // Hay fotos/descripcion cargadas sin titulo. Tambien habilita "Siguiente", pero
  // para poder EXPLICAR por que no avanza: con el boton deshabilitado el click no
  // llegaba y el usuario no entendia que le faltaba.
  const [hasOrphanManualDraft, setHasOrphanManualDraft] = useState(false);

  const handleManualDraftStateChange = useCallback((state: ManualRepairDraftState) => {
    setHasPendingManualDraft(state.canAdd);
    setHasOrphanManualDraft(state.hasOrphanContent);
  }, []);

  // Paso 4: Selección de supervisor
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string>('');
  const [supervisorOpen, setSupervisorOpen] = useState(false);
  // Nuevo: Estado para indicar si el usuario actual es el supervisor
  const [isCurrentUserSupervisor, setIsCurrentUserSupervisor] = useState<boolean | null>(
    skipSupervisorQuestion ? false : null
  );

  // Equipamientos (ticket 596). Solo se piden al elegir ese camino.
  const {
    data: otherEquipment = [],
    isLoading: isLoadingOtherEquipment,
    isError: hasOtherEquipmentError,
    refetch: refetchOtherEquipment,
  } = useQuery({
    queryKey: ['other-equipment-basic'],
    queryFn: () => fetchAllOtherEquipmentBasicData(),
    enabled: isOtherEquipment,
    staleTime: 5 * 60 * 1000,
  });

  /**
   * Lista normalizada de recursos elegibles.
   *
   * Vehículos y equipamientos se identifican distinto (dominio vs número de
   * serie) y se miden distinto (kilometraje vs solo horómetro). Normalizarlos
   * acá evita repetir ese condicional en el selector, en la tarjeta de resumen
   * y en los campos de medición.
   */
  const resourceOptions = useMemo(() => {
    if (isOtherEquipment) {
      return otherEquipment.map((e) => ({
        id: e.id,
        label: e.serial_number || e.intern_number || 'Sin identificar',
        internNumber: e.intern_number,
        typeName: e.type_name,
        subTypeName: e.sub_type_name,
        unitTypeName: null as string | null,
        condition: e.condition,
        kilometer: null as string | null,
        engineHours: e.engine_hours,
      }));
    }
    return (equipment ?? []).map((e) => ({
      id: e.id,
      label: e.domain || e.serie || 'Sin identificar',
      internNumber: e.intern_number,
      typeName: e.type_name,
      subTypeName: e.sub_type_name,
      unitTypeName: e.types_of_vehicles?.name ?? null,
      condition: e.condition,
      kilometer: e.kilometer,
      engineHours: e.engine_hours,
    }));
  }, [isOtherEquipment, otherEquipment, equipment]);

  // Recurso seleccionado
  const selectedEquipment = useMemo(
    () => resourceOptions.find((e) => e.id === selectedEquipmentId),
    [resourceOptions, selectedEquipmentId]
  );

  /**
   * Búsqueda del selector de recursos (ticket 651).
   *
   * Además del identificador y el número interno, matchea contra los campos de
   * descripción que la propia lista muestra a la derecha (tipo, subtipo y tipo
   * de unidad): el usuario los ve en pantalla y esperaba poder tipearlos.
   *
   * Se busca por tokens y sin tildes: "grua hidro" tiene que encontrar
   * "Grúa Hidráulica" aunque las palabras estén en campos distintos.
   */
  const { visible: filteredEquipment, total: totalMatchingResources } = useMemo(() => {
    const tokens = normalizeSearchText(searchTerm).split(/\s+/).filter(Boolean);
    const matches =
      tokens.length === 0
        ? resourceOptions
        : resourceOptions.filter((equip) => {
            const haystack = normalizeSearchText(
              [equip.label, equip.internNumber, equip.typeName, equip.subTypeName, equip.unitTypeName]
                .filter(Boolean)
                .join(' ')
            );
            return tokens.every((token) => haystack.includes(token));
          });
    // Se recorta para no renderizar cientos de filas de golpe; el total se
    // conserva para avisar cuántas quedaron fuera (antes se cortaba en silencio).
    return { visible: matches.slice(0, MAX_RESOURCE_RESULTS), total: matches.length };
  }, [resourceOptions, searchTerm]);

  // ============================================
  // STEPS DINÁMICOS según requestType
  // ============================================
  type StepKey = 'resource' | 'equipment' | 'type' | 'items' | 'supervisor' | 'confirm';

  // El paso 'resource' (ticket 596) define qué se lista en el paso siguiente.
  // El paso 'type' ya no se llama "Checklist": desde el ticket 592 también permite
  // mantenimiento preventivo y carga manual.
  const CHECKLIST_STEPS: { key: StepKey; title: string; icon: typeof Truck }[] = [
    { key: 'resource', title: 'Recurso', icon: Boxes },
    { key: 'equipment', title: 'Equipo', icon: Truck },
    { key: 'type', title: 'Tipo', icon: ClipboardList },
    { key: 'items', title: 'Items', icon: AlertTriangle },
    { key: 'supervisor', title: 'Supervisor', icon: User },
    { key: 'confirm', title: 'Confirmar', icon: CheckCircle },
  ];

  const PREVENTIVE_STEPS: { key: StepKey; title: string; icon: typeof Truck }[] = [
    { key: 'resource', title: 'Recurso', icon: Boxes },
    { key: 'equipment', title: 'Equipo', icon: Truck },
    { key: 'type', title: 'Preventivo', icon: Wrench },
    { key: 'supervisor', title: 'Supervisor', icon: User },
    { key: 'confirm', title: 'Confirmar', icon: CheckCircle },
  ];

  const MANUAL_STEPS: { key: StepKey; title: string; icon: typeof Truck }[] = [
    { key: 'resource', title: 'Recurso', icon: Boxes },
    { key: 'equipment', title: 'Equipo', icon: Truck },
    { key: 'type', title: 'Tipo', icon: ClipboardList },
    { key: 'items', title: 'Reparaciones', icon: Wrench },
    { key: 'supervisor', title: 'Supervisor', icon: User },
    { key: 'confirm', title: 'Confirmar', icon: CheckCircle },
  ];

  const allSteps =
    requestType === 'preventive' ? PREVENTIVE_STEPS : requestType === 'manual' ? MANUAL_STEPS : CHECKLIST_STEPS;

  // Con el equipo ya fijado por prop (flujo QR: se escanea el equipo y se entra
  // directo), preguntar de qué tipo de recurso se trata no aporta nada — la
  // respuesta ya está implícita. Ese paso se omite.
  const steps = useMemo(
    () => (default_equipment_id ? allSteps.filter((s) => s.key !== 'resource') : allSteps),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [default_equipment_id, requestType]
  );
  const currentStepKey = steps[currentStep]?.key;

  // Query para templates de checklist
  const {
    data: templates,
    isLoading: isLoadingTemplates,
    error: templatesError,
  } = useQuery({
    queryKey: ['checklist-templates-for-equipment', selectedEquipmentId],
    queryFn: () => getChecklistTemplatesForEquipment(selectedEquipmentId),
    enabled: !!selectedEquipmentId && currentStep >= 1,
  });

  // Template seleccionado
  const selectedTemplate = useMemo(
    () => templates?.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  // Query para obtener usuario actual (para verificar si es supervisor)
  const { data: currentUser, isLoading: isLoadingCurrentUser } = useQuery({
    queryKey: ['current-user-for-supervisor'],
    queryFn: getCurrentUserForSupervisorCheck,
    enabled: steps.findIndex((s) => s.key === 'supervisor') <= currentStep,
  });

  // Query para supervisores (solo se ejecuta cuando NO es supervisor).
  //
  // La lista sale de la empresa DEL RECURSO elegido, no de la sesión: este formulario también
  // se usa desde `/maintenance/equipment/[id]/request` (QR anónimo), donde no hay empresa
  // activa y resolverla por sesión dejaba el paso "Supervisor" vacío y sin poder avanzar.
  const { data: supervisors = [], isLoading: isLoadingSupervisors } = useQuery({
    queryKey: ['supervisors-for-resource', resourceKind, selectedEquipmentId],
    queryFn: () => fetchSupervisorsForResource(resourceKind, selectedEquipmentId),
    enabled:
      !!selectedEquipmentId &&
      steps.findIndex((s) => s.key === 'supervisor') <= currentStep &&
      isCurrentUserSupervisor === false,
  });

  // Supervisor seleccionado
  const selectedSupervisor = useMemo(
    () => supervisors.find((s) => s.id === selectedSupervisorId),
    [supervisors, selectedSupervisorId]
  );

  // ============================================
  // HANDLERS
  // ============================================
  /**
   * Avanza de paso guardando primero lo que quedo escrito en el formulario de
   * reparaciones. Antes, si el usuario escribia una reparacion y tocaba Siguiente
   * sin "Agregar reparacion", se perdia sin aviso.
   */
  const handleAdvanceStep = useCallback(() => {
    if (requestType === 'manual' && currentStepKey === 'items') {
      const result = manualRepairsRef.current?.commitPendingDraft();

      // Fotos (y/o descripcion) sin tarea ni texto libre: no se puede agregar la
      // reparacion, pero tampoco se descarta el trabajo en silencio. Se frena el
      // avance y se dice exactamente que falta.
      if (result?.status === 'incomplete') {
        const cargado =
          result.imageCount > 0
            ? result.imageCount === 1
              ? 'Cargaste 1 foto'
              : `Cargaste ${result.imageCount} fotos`
            : 'Escribiste una descripción';
        toast.warning(`${cargado} pero falta elegir la tarea o escribir la reparación`, {
          description: 'Completala y tocá "Agregar reparación", o quitá lo cargado para continuar.',
        });
        return;
      }

      if (result?.status === 'added') {
        toast.info('Se agregó la reparación que habías escrito');
      }
    }
    setCurrentStep((prev) => prev + 1);
  }, [requestType, currentStepKey]);

  const handleSelectEquipment = useCallback(
    (equipId: string) => {
      // Se busca en la lista normalizada, no en `equipment`: esta última solo
      // tiene vehículos y dejaría sin efecto la selección de un equipamiento.
      const equip = resourceOptions.find((e) => e.id === equipId);
      if (equip) {
        setSelectedEquipmentId(equip.id);
        setKilometer(equip.kilometer || '');
        setEngineHours(equip.engineHours || '');
        // Reset estados posteriores
        setSelectedTemplateId('');
        setSelectedDeviations([]);
        setDeviationComments({});
        setManualItems([]);
        setManualRepairs([]);
        setSelectedSupervisorId('');
      }
      setEquipmentOpen(false);
    },
    [resourceOptions]
  );

  const handleSelectTemplate = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);
    // Reset selecciones de desvíos
    setSelectedDeviations([]);
    setDeviationComments({});
    setManualItems([]);
  }, []);

  const handleToggleDeviation = useCallback(
    (
      item: {
        id: string;
        code: string;
        label: string;
        is_critical: boolean | null;
      },
      sectionCode: string
    ) => {
      setSelectedDeviations((prev) => {
        const exists = prev.find((d) => d.itemId === item.id);
        if (exists) {
          return prev.filter((d) => d.itemId !== item.id);
        }
        return [
          ...prev,
          {
            itemId: item.id,
            itemCode: item.code,
            itemLabel: item.label,
            sectionCode,
            isCritical: item.is_critical || false,
            comment: deviationComments[item.id] || undefined,
          },
        ];
      });
    },
    [deviationComments]
  );

  const handleUpdateComment = useCallback((itemId: string, comment: string) => {
    setDeviationComments((prev) => ({ ...prev, [itemId]: comment }));
    // Actualizar también en selectedDeviations si existe
    setSelectedDeviations((prev) =>
      prev.map((d) => (d.itemId === itemId ? { ...d, comment: comment || undefined } : d))
    );
  }, []);

  /**
   * Cambia entre equipo y equipamiento (ticket 596).
   *
   * Descarta la selección de recurso: el equipo elegido no existe en la otra
   * lista, así que arrastrarlo dejaría el wizard en un estado inconsistente.
   * Y si el camino era "Checklist" —que los equipamientos no tienen— o
   * "Mant. Preventivo" —que dejó de ofrecerse para equipamientos, ticket 654—
   * se mueve la selección a "Carga Manual", para que el radiogroup nunca quede
   * anclado en una tarjeta bloqueada o inexistente.
   */
  const handleChangeResourceKind = useCallback((kind: MaintenanceResourceKind) => {
    setResourceKind((current) => {
      if (current === kind) return current;
      setSelectedEquipmentId('');
      setKilometer('');
      setEngineHours('');
      setSearchTerm('');
      setSelectedTemplateId('');
      setSelectedDeviations([]);
      setDeviationComments({});
      setManualItems([]);
      if (kind === 'other_equipment') {
        setRequestType('manual');
        setSelectedPreventiveType('');
        setPreventiveDescription('');
      }
      return kind;
    });
  }, []);

  const handleChangeRequestType = useCallback(
    (type: RequestType) => {
      if (type === requestType) return;
      setRequestType(type);
      setSelectedTemplateId('');
      setSelectedPreventiveType('');
      setPreventiveDescription('');
      setSelectedDeviations([]);
      setDeviationComments({});
      setManualItems([]);
      setManualRepairs([]);
      setSelectedSupervisorId('');
      setIsCurrentUserSupervisor(null);
    },
    [requestType]
  );

  const handleSubmit = async () => {
    if (isSubmitting) return;

    // Validar datos según el flujo
    if (!selectedEquipmentId) {
      toast.error('Faltan datos requeridos');
      return;
    }
    if (requestType === 'checklist' && selectedDeviations.length === 0 && manualItems.length === 0) {
      toast.error('Debes seleccionar al menos un desvío o agregar un ítem manual');
      return;
    }
    if (requestType === 'preventive' && !selectedPreventiveType) {
      toast.error('Debes seleccionar un programa de mantenimiento preventivo');
      return;
    }
    if (requestType === 'manual' && manualRepairs.length === 0) {
      toast.error('Debes agregar al menos una reparación');
      return;
    }

    // Validar que el kilometraje no sea menor al actual
    if (kilometer) {
      const currentKm = Number(selectedEquipment?.kilometer) || 0;
      if (Number(kilometer) < currentKm) {
        toast.error(`El kilometraje no puede ser menor al actual (${currentKm} km)`);
        return;
      }
    }

    // Si es supervisor actual, usar su ID; si no, usar el seleccionado
    const supervisorId = isCurrentUserSupervisor ? currentUser?.id : selectedSupervisorId;

    if (!supervisorId) {
      toast.error('Debes seleccionar un supervisor');
      return;
    }

    setIsSubmitting(true);

    try {
      if (requestType === 'manual') {
        // CARGA MANUAL: mismo criterio que los demás caminos — si quien carga es
        // el supervisor, el pedido queda aprobado; si no, va a validación.
        const repairs = await Promise.all(
          manualRepairs.map(async (repair) => ({
            repairTypeId: repair.repairTypeId,
            freeText: repair.freeText,
            description: repair.description,
            // El grupo se persiste para poder indicar el origen en todos los listados
            groupId: repair.groupId,
            images: await uploadRepairImages(repair.images, selectedEquipmentId),
          }))
        );

        await createManualMaintenanceRequest({
          equipmentId: selectedEquipmentId,
          resourceKind,
          supervisorId,
          kilometer: kilometer || undefined,
          engine_hours: engineHours || undefined,
          driverEmployeeId: driverEmployeeId || undefined,
          autoApprove: isCurrentUserSupervisor === true,
          repairs,
        });

        const noun = repairs.length === 1 ? '1 reparación' : `${repairs.length} reparaciones`;
        toast.success(isCurrentUserSupervisor ? `Pedido creado con ${noun}` : `Solicitud creada con ${noun}`);
        invalidateAllMaintenanceQueries(queryClient);
      } else if (isCurrentUserSupervisor) {
        // FLUJO 1: Usuario ES el supervisor → crear pedido directamente (aprobado automáticamente)
        if (requestType === 'preventive') {
          await createMaintenanceOrderFromDeviations({
            equipmentId: selectedEquipmentId,
            resourceKind,
            supervisorId,
            kilometer: kilometer || undefined,
            engine_hours: engineHours || undefined,
            source: 'preventive',
            preventiveType: selectedPreventiveType as PreventiveType,
            driverEmployeeId: driverEmployeeId || undefined,
            description: preventiveDescription.trim() || undefined,
          });
        } else {
          // Actualizar comentarios en los desvíos antes de enviar
          const deviationsToSend = selectedDeviations.map((d) => ({
            ...d,
            comment: deviationComments[d.itemId] || d.comment || undefined,
          }));
          await createMaintenanceOrderFromDeviations({
            equipmentId: selectedEquipmentId,
            resourceKind,
            supervisorId,
            kilometer: kilometer || undefined,
            engine_hours: engineHours || undefined,
            deviations: deviationsToSend,
            templateId: selectedTemplateId || undefined,
            driverEmployeeId: driverEmployeeId || undefined,
            manualItems: manualItems.map((m) => ({ label: m.label })),
          });
        }

        toast.success('Pedido de mantenimiento creado exitosamente');

        // Invalidar todas las queries de mantenimiento
        invalidateAllMaintenanceQueries(queryClient);
      } else {
        // FLUJO 2: Usuario NO es supervisor → crear solicitud pendiente de aprobación
        if (requestType === 'preventive') {
          await createMaintenanceRequestPendingApproval({
            equipmentId: selectedEquipmentId,
            resourceKind,
            supervisorId,
            kilometer: kilometer || undefined,
            engine_hours: engineHours || undefined,
            source: 'preventive',
            preventiveType: selectedPreventiveType as PreventiveType,
            description: preventiveDescription.trim() || undefined,
          });
        } else {
          // Actualizar comentarios en los desvíos antes de enviar
          const deviationsToSend = selectedDeviations.map((d) => ({
            ...d,
            comment: deviationComments[d.itemId] || d.comment || undefined,
          }));
          await createMaintenanceRequestPendingApproval({
            equipmentId: selectedEquipmentId,
            resourceKind,
            supervisorId,
            kilometer: kilometer || undefined,
            engine_hours: engineHours || undefined,
            deviations: deviationsToSend,
            templateId: selectedTemplateId || undefined,
            driverEmployeeId: driverEmployeeId || undefined,
            manualItems: manualItems.map((m) => ({ label: m.label })),
          });
        }

        toast.success('Solicitud enviada. El supervisor debe aprobarla antes de que pase a Pedidos.');

        // Invalidar todas las queries de mantenimiento
        invalidateAllMaintenanceQueries(queryClient);
      }

      // Reset form
      setCurrentStep(0);
      setSelectedEquipmentId(default_equipment_id || '');
      setKilometer('');
      setEngineHours('');
      setSelectedTemplateId('');
      setSelectedDeviations([]);
      setDeviationComments({});
      setManualItems([]);
      setSelectedSupervisorId('');
      setIsCurrentUserSupervisor(skipSupervisorQuestion ? false : null);
      setSelectedPreventiveType('');
      setPreventiveDescription('');
      setRequestType('checklist');

      // Las tablas de Mantenimiento corren con React Query: sin invalidar quedan con datos viejos
      queryClient.invalidateQueries();
      router.refresh();

      if (onSuccess) {
        onSuccess();
      }

      if (successRedirectUrl) {
        router.push(successRedirectUrl);
      }
    } catch (error) {
      logger.error('Error al crear pedido', { data: { error } });
      // Un "failed to fetch" generico no le dice al usuario que reintentar. Las
      // fotos se suben al storage ANTES de crear el pedido, asi que separar los dos
      // casos evita que vuelva a cargar todo el formulario cuando solo fallo la red
      // subiendo una imagen.
      const message = error instanceof Error ? error.message : '';
      if (message.includes('imagen')) {
        toast.error(message, { description: 'El pedido no se creó. Revisá la conexión y probá de nuevo.' });
      } else if (/fetch|network|NetworkError/i.test(message)) {
        toast.error('Se perdió la conexión al crear el pedido', {
          description: 'No se guardó nada. Verificá la conexión y volvé a intentar.',
        });
      } else {
        toast.error('Error al crear el pedido de mantenimiento');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // VALIDACIONES DE PASOS
  // ============================================
  const canAdvanceStep = useMemo(() => {
    switch (currentStepKey) {
      case 'resource':
        // Siempre hay uno elegido (vehículo por defecto): el paso informa, no bloquea
        return true;
      case 'equipment':
        return !!selectedEquipmentId;
      case 'type':
        if (requestType === 'checklist') return !!selectedTemplateId;
        // La carga manual no elige nada en este paso: se avanza directo a cargar reparaciones
        if (requestType === 'manual') return true;
        return !!selectedPreventiveType;
      case 'items':
        // El borrador incompleto tambien habilita el boton: el click tiene que
        // llegar para poder avisar por que no se avanza (handleAdvanceStep).
        if (requestType === 'manual') return manualRepairs.length > 0 || hasPendingManualDraft || hasOrphanManualDraft;
        return selectedDeviations.length > 0 || manualItems.length > 0;
      case 'supervisor':
        if (isCurrentUserSupervisor === null) return false;
        if (isCurrentUserSupervisor) return true;
        return !!selectedSupervisorId;
      case 'confirm':
        return false;
      default:
        return false;
    }
  }, [
    currentStepKey,
    requestType,
    hasPendingManualDraft,
    hasOrphanManualDraft,
    selectedEquipmentId,
    selectedTemplateId,
    selectedPreventiveType,
    selectedDeviations,
    manualItems,
    manualRepairs,
    selectedSupervisorId,
    isCurrentUserSupervisor,
  ]);

  // ============================================
  // RENDER STEPS
  // ============================================
  /**
   * Paso "Recurso" (ticket 596): define si el pedido es para un equipo o para un
   * equipamiento — y con eso, qué lista el selector del paso siguiente.
   *
   * Las dos palabras son casi homógrafas y no se distinguen solas: cada opción
   * lleva una línea con ejemplos concretos, que es lo que hace elegible la tarjeta.
   */
  const renderStepResource = () => (
    <div className="space-y-4">
      <div>
        <h3 id="resource-kind-label" className="text-base font-medium text-balance">
          ¿Para qué es el pedido?
        </h3>
        <p className="text-sm text-muted-foreground text-pretty">
          Define qué equipos vas a poder elegir en el paso siguiente.
        </p>
      </div>

      <div role="radiogroup" aria-labelledby="resource-kind-label" className="grid gap-3 sm:grid-cols-2 max-w-2xl">
        <ResourceKindCard
          kind="vehicle"
          icon={Truck}
          title="Equipos"
          description="Vehículos con dominio y kilometraje."
          selected={!isOtherEquipment}
          onSelect={handleChangeResourceKind}
        />
        <ResourceKindCard
          kind="other_equipment"
          icon={Boxes}
          title="Equipamientos"
          description="Contenedores, piletas, trailers. Sin dominio, se miden con horómetro."
          selected={isOtherEquipment}
          onSelect={handleChangeResourceKind}
        />
      </div>
    </div>
  );

  const renderStep0Equipment = () => (
    <StepEquipmentSelector
      default_equipment_id={default_equipment_id}
      engineHours={engineHours}
      equipmentOpen={equipmentOpen}
      filteredEquipment={filteredEquipment}
      handleSelectEquipment={handleSelectEquipment}
      hasOtherEquipmentError={hasOtherEquipmentError}
      isLoadingOtherEquipment={isLoadingOtherEquipment}
      isOtherEquipment={isOtherEquipment}
      kilometer={kilometer}
      refetchOtherEquipment={refetchOtherEquipment}
      selectedEquipment={selectedEquipment}
      selectedEquipmentId={selectedEquipmentId}
      setEngineHours={setEngineHours}
      setEquipmentOpen={setEquipmentOpen}
      setKilometer={setKilometer}
      setSearchTerm={setSearchTerm}
      totalMatchingResources={totalMatchingResources}
    />
  );

  const renderStep1Type = () => (
    <StepRequestType
      handleChangeRequestType={handleChangeRequestType}
      handleSelectTemplate={handleSelectTemplate}
      isLoadingTemplates={isLoadingTemplates}
      isOtherEquipment={isOtherEquipment}
      preventiveDescription={preventiveDescription}
      requestType={requestType}
      selectedPreventiveType={selectedPreventiveType}
      selectedTemplateId={selectedTemplateId}
      setPreventiveDescription={setPreventiveDescription}
      setSelectedPreventiveType={setSelectedPreventiveType}
      templates={templates}
      templatesError={templatesError}
      visibleRequestTypes={visibleRequestTypes}
    />
  );


  /**
   * Paso de items para la carga manual: se cargan las reparaciones directamente,
   * eligiendo una tarea del sistema o escribiéndola a mano, con fotos opcionales.
   */
  const renderStep2ManualRepairs = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {/* Encabezado de sección: no es un <Label> porque no rotula ningún control */}
        <h3 className="text-sm leading-none font-medium">Cargá las reparaciones que necesita el equipo</h3>
        <Badge variant="secondary" className="shrink-0">
          <span className="tabular-nums">{manualRepairs.length}</span>{' '}
          {manualRepairs.length === 1 ? 'reparación' : 'reparaciones'}
        </Badge>
      </div>

      <ManualRepairsInput
        repairs={manualRepairs}
        onChange={setManualRepairs}
        ref={manualRepairsRef}
        onDraftStateChange={handleManualDraftStateChange}
        disabled={isSubmitting}
        // La carga manual es siempre a mano, para equipos y equipamientos por igual:
        // no se elige ni grupo de reparaciones ni tarea del listado. El taller asigna
        // el tipo que corresponda al procesar el pedido.
        freeTextOnly
      />
    </div>
  );

  const renderStep2Items = () => (
    <StepChecklistItems
      deviationComments={deviationComments}
      handleToggleDeviation={handleToggleDeviation}
      handleUpdateComment={handleUpdateComment}
      isSubmitting={isSubmitting}
      manualItems={manualItems}
      selectedDeviations={selectedDeviations}
      selectedTemplate={selectedTemplate}
      selectedTemplateId={selectedTemplateId}
      setManualItems={setManualItems}
    />
  );


  const renderStep3Supervisor = () => (
    <StepSupervisor
      currentUser={currentUser}
      isCurrentUserSupervisor={isCurrentUserSupervisor}
      isLoadingCurrentUser={isLoadingCurrentUser}
      isLoadingSupervisors={isLoadingSupervisors}
      selectedSupervisor={selectedSupervisor}
      selectedSupervisorId={selectedSupervisorId}
      setIsCurrentUserSupervisor={setIsCurrentUserSupervisor}
      setSelectedSupervisorId={setSelectedSupervisorId}
      setSupervisorOpen={setSupervisorOpen}
      skipSupervisorQuestion={skipSupervisorQuestion}
      supervisorOpen={supervisorOpen}
      supervisors={supervisors}
    />
  );

  const renderStep4Confirm = () => (
    <StepConfirm
      currentUser={currentUser}
      driverFileNumber={driverFileNumber}
      driverName={driverName}
      engineHours={engineHours}
      isCurrentUserSupervisor={isCurrentUserSupervisor}
      isOtherEquipment={isOtherEquipment}
      kilometer={kilometer}
      manualRepairs={manualRepairs}
      preventiveDescription={preventiveDescription}
      requestType={requestType}
      selectedDeviations={selectedDeviations}
      selectedEquipment={selectedEquipment}
      selectedPreventiveType={selectedPreventiveType}
      selectedSupervisor={selectedSupervisor}
    />
  );


  const renderCurrentStep = () => {
    switch (currentStepKey) {
      case 'resource':
        return renderStepResource();
      case 'equipment':
        return renderStep0Equipment();
      case 'type':
        return renderStep1Type();
      case 'items':
        return requestType === 'manual' ? renderStep2ManualRepairs() : renderStep2Items();
      case 'supervisor':
        return renderStep3Supervisor();
      case 'confirm':
        return renderStep4Confirm();
      default:
        return null;
    }
  };

  // ============================================
  // RENDER PRINCIPAL
  // ============================================
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Stepper lateral */}
      <Card className="lg:col-span-1 h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Nuevo Pedido
          </CardTitle>
          <CardDescription>Crea un pedido desde items de checklist</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const isCompleted = index < currentStep;
              const isCurrent = index === currentStep;

              return (
                <div
                  key={step.key}
                  className={cn(
                    'flex items-center gap-3 p-2 rounded-lg transition-all',
                    isCurrent && 'bg-primary/10',
                    isCompleted && 'text-primary'
                  )}
                >
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center border-2',
                      isCurrent && 'border-primary bg-primary text-primary-foreground',
                      isCompleted && 'border-primary bg-primary text-primary-foreground',
                      !isCurrent && !isCompleted && 'border-muted-foreground/30'
                    )}
                  >
                    {isCompleted ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                  </div>
                  <span className={cn('text-sm font-medium', !isCurrent && !isCompleted && 'text-muted-foreground')}>
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Contenido del paso */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">{steps[currentStep].title}</CardTitle>
        </CardHeader>
        <CardContent>{renderCurrentStep()}</CardContent>

        <Separator />

        {/* Botones de navegación */}
        <div className="p-4 flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
            disabled={currentStep === 0 || isSubmitting}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Anterior
          </Button>

          {currentStep < steps.length - 1 ? (
            <Button type="button" onClick={handleAdvanceStep} disabled={!canAdvanceStep}>
              Siguiente
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={isCurrentUserSupervisor ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isCurrentUserSupervisor ? 'Crear Pedido' : 'Enviar Solicitud'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
