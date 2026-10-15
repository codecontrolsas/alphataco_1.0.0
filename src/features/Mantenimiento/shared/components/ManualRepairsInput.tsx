'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { RepairGroupBadge } from '@/features/Mantenimiento/shared/components/RepairGroupBadge';
import { MAX_REPAIR_IMAGE_SIZE } from '@/features/Mantenimiento/shared/utils/repair-images';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  ImagePlus,
  Loader2,
  Package,
  PencilLine,
  Plus,
  Wrench,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  MAX_IMAGES_PER_REPAIR,
  type ManualRepair,
  type ManualRepairDraftState,
  type ManualRepairsInputHandle,
  type PendingDraftCommit,
  type RepairGroupOption,
  type RepairTypeOption,
} from './manual-repairs/types';
import { HighlightedText, matchesAllTokens, normalizeText, tokenizeQuery } from './manual-repairs/search-text';

export {
  MAX_IMAGES_PER_REPAIR,
  type ManualRepair,
  type ManualRepairDraftState,
  type ManualRepairsInputHandle,
  type PendingDraftCommit,
  type RepairGroupOption,
  type RepairTypeOption,
} from './manual-repairs/types';

/** Anillo de foco compartido por los botones custom (no usan el primitivo Button) */
const FOCUS_RING = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring';

type ManualRepairsInputProps = {
  repairs: ManualRepair[];
  onChange: (next: ManualRepair[]) => void;
  /** Tareas del listado del sistema. Sin ellas el camino del listado no se ofrece */
  repairTypes?: RepairTypeOption[];
  isLoadingRepairTypes?: boolean;
  /** La carga de tipos falló: el combobox no sirve, pero el texto libre sigue disponible */
  hasRepairTypesError?: boolean;
  onRetryRepairTypes?: () => void;
  /** Grupos de reparación disponibles. Si no se pasan, el camino del grupo no se muestra */
  groups?: RepairGroupOption[];
  isLoadingGroups?: boolean;
  /** La carga de grupos falló: los otros dos caminos siguen disponibles */
  hasGroupsError?: boolean;
  onRetryGroups?: () => void;
  disabled?: boolean;
  /**
   * Deja únicamente el camino de texto libre: se ocultan el grupo de reparaciones
   * y el selector de tareas del listado (ticket 654). Los equipamientos no tienen
   * tipos de reparación propios, y para los equipos se pidió el mismo criterio: la
   * carga manual se escribe a mano y el taller asigna después el tipo que
   * corresponda. Las fotos siguen disponibles.
   */
  freeTextOnly?: boolean;
  /**
   * Avisa el estado del borrador cargado sin agregar. El paso lo necesita para
   * habilitar "Siguiente": con el boton deshabilitado el usuario no puede avanzar
   * y su reparacion escrita queda en un limbo, sin forma de guardarla salvo
   * descubriendo el boton "Agregar reparacion". Tambien avisa el caso incompleto
   * (fotos/descripcion sin titulo) para poder explicar por que no avanza.
   */
  onDraftStateChange?: (state: ManualRepairDraftState) => void;
  ref?: React.Ref<ManualRepairsInputHandle>;
};

function newLocalId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export const ManualRepairsInput = memo(function ManualRepairsInput({
  repairs,
  onChange,
  repairTypes = [],
  isLoadingRepairTypes = false,
  hasRepairTypesError = false,
  onRetryRepairTypes,
  groups = [],
  isLoadingGroups = false,
  hasGroupsError = false,
  onRetryGroups,
  disabled = false,
  onDraftStateChange,
  freeTextOnly = false,
  ref,
}: ManualRepairsInputProps) {
  // Borrador de la reparación que se está armando
  const [repairTypeId, setRepairTypeId] = useState<string | null>(null);
  const [freeText, setFreeText] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [typesOpen, setTypesOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  // El buscador de grupos es controlado: se necesita el texto tecleado para poder
  // mostrar POR QUE apareció cada grupo (el match puede venir de una tarea interna).
  const [groupSearch, setGroupSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // IDs únicos por instancia: el componente podría montarse más de una vez por página
  const fieldId = useId();
  const typeLabelId = `${fieldId}-type-label`;
  const typeTriggerId = `${fieldId}-type-trigger`;
  const typeErrorId = `${fieldId}-type-error`;
  const groupLabelId = `${fieldId}-group-label`;
  const groupTriggerId = `${fieldId}-group-trigger`;
  const groupHintId = `${fieldId}-group-hint`;
  const groupErrorId = `${fieldId}-group-error`;
  const freeTextId = `${fieldId}-free-text`;
  const freeTextHintId = `${fieldId}-free-text-hint`;
  const descriptionId = `${fieldId}-description`;
  const photosLabelId = `${fieldId}-photos-label`;
  const photosHintId = `${fieldId}-photos-hint`;
  const addHintId = `${fieldId}-add-hint`;

  const selectedType = useMemo(
    () => repairTypes.find((t) => t.id === repairTypeId) ?? null,
    [repairTypes, repairTypeId]
  );

  // Previews de las fotos del borrador. `URL.createObjectURL` reserva memoria del
  // documento hasta que se la revoca: se crea una sola vez por lista de archivos y
  // se libera al cambiar la lista o al desmontar. Llamarlo en el render filtraba un
  // blob por foto en cada tecleo del formulario.
  const imagePreviews = useMemo(() => images.map((file) => URL.createObjectURL(file)), [images]);

  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  const trimmedFreeText = freeText.trim();
  const canAdd = !disabled && (!!repairTypeId || trimmedFreeText.length > 0);
  // Trabajo cargado que todavía no se puede agregar porque falta el título. Las
  // fotos son el caso caro: el usuario ya salió a sacarlas y esperó la subida.
  const hasOrphanContent = !disabled && !canAdd && (images.length > 0 || description.trim().length > 0);
  // Si el consumidor no pasa grupos, ese camino directamente no se dibuja: el
  // formulario queda igual que antes en vez de mostrar un selector vacío.
  // Con `freeTextOnly` los dos caminos que leen del listado de reparaciones
  // desaparecen y sólo queda el texto libre (ticket 654).
  const showGroupsPath = !freeTextOnly && (isLoadingGroups || hasGroupsError || groups.length > 0);
  const showRepairTypesPath = !freeTextOnly;
  const reachedImageLimit = images.length >= MAX_IMAGES_PER_REPAIR;

  const resetDraft = useCallback(() => {
    setRepairTypeId(null);
    setFreeText('');
    setDescription('');
    setImages([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleAdd = useCallback(() => {
    if (!canAdd) return;
    onChange([
      ...repairs,
      {
        localId: newLocalId(),
        repairTypeId,
        freeText: repairTypeId ? null : trimmedFreeText,
        description: description.trim(),
        images,
        // Cargada a mano: no pertenece a ningún grupo
        groupId: null,
      },
    ]);
    resetDraft();
  }, [canAdd, onChange, repairs, repairTypeId, trimmedFreeText, description, images, resetDraft]);

  useEffect(() => {
    onDraftStateChange?.({ canAdd, hasOrphanContent });
  }, [canAdd, hasOrphanContent, onDraftStateChange]);

  // El wizard llama a esto al avanzar de paso para no perder lo que quedo escrito.
  useImperativeHandle(
    ref,
    () => ({
      commitPendingDraft: () => {
        if (canAdd) {
          handleAdd();
          return { status: 'added' };
        }
        // Hay fotos/descripcion sin titulo: el paso avisa en vez de trabarse mudo
        if (hasOrphanContent) {
          return { status: 'incomplete', imageCount: images.length, hasDescription: description.trim().length > 0 };
        }
        return { status: 'empty' };
      },
    }),
    [canAdd, handleAdd, hasOrphanContent, images.length, description]
  );

  const handleRemove = useCallback(
    (localId: string) => {
      if (disabled) return;
      onChange(repairs.filter((r) => r.localId !== localId));
    },
    [disabled, onChange, repairs]
  );

  const handleSelectType = useCallback((id: string) => {
    setRepairTypeId((current) => (current === id ? null : id));
    // Elegir un tipo del sistema descarta el texto libre: son excluyentes
    setFreeText('');
    setTypesOpen(false);
  }, []);

  /**
   * Expande un grupo: cada tarea entra como una reparación independiente para que
   * el solicitante pueda quitar las que no apliquen a este pedido en particular.
   * No pasa por el borrador (no hay una descripción ni fotos comunes a todo el
   * grupo), por eso se agrega directo a la lista.
   */
  const handleSelectGroup = useCallback(
    (groupId: string) => {
      setGroupsOpen(false);
      setGroupSearch('');
      if (disabled) return;

      const group = groups.find((g) => g.id === groupId);
      if (!group) return;

      // Un grupo sin tareas no puede fallar en silencio: el usuario creería que
      // cargó el service completo y mandaría el pedido vacío.
      if (group.repairTypes.length === 0) {
        toast.warning(`El grupo "${group.name}" no tiene reparaciones cargadas`);
        return;
      }

      const alreadyAdded = new Set(repairs.map((r) => r.repairTypeId).filter((id): id is string => id !== null));
      const missing = group.repairTypes.filter((type) => !alreadyAdded.has(type.id));

      if (missing.length === 0) {
        toast.info(`Las reparaciones del grupo "${group.name}" ya están en la lista`);
        return;
      }

      onChange([
        ...repairs,
        ...missing.map((type) => ({
          localId: newLocalId(),
          repairTypeId: type.id,
          freeText: null,
          description: '',
          images: [] as File[],
          // Queda marcado el origen: expandir un grupo mete varias tareas de golpe
          // y despues nadie sabe si se agregaron a proposito o vinieron en el paquete
          groupId: group.id,
        })),
      ]);

      const skipped = group.repairTypes.length - missing.length;
      toast.success(
        `Se agregaron ${missing.length} ${missing.length === 1 ? 'reparación' : 'reparaciones'} del grupo "${group.name}"` +
          (skipped > 0 ? ` (${skipped} ya estaban en la lista)` : '')
      );
    },
    [disabled, groups, onChange, repairs]
  );

  const handlePickImages = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const picked = Array.from(fileList);

    // El peso se valida acá y no al enviar: avisarle recién al final del wizard
    // que una foto no entraba obligaría a rehacer el camino.
    const tooBig = picked.filter((file) => file.size > MAX_REPAIR_IMAGE_SIZE);
    const accepted = picked.filter((file) => file.size <= MAX_REPAIR_IMAGE_SIZE);

    if (tooBig.length > 0) {
      toast.error(
        tooBig.length === 1
          ? `"${tooBig[0].name}" supera los 10 MB y no se agregó`
          : `${tooBig.length} imágenes superan los 10 MB y no se agregaron`
      );
    }

    setImages((current) => {
      const room = MAX_IMAGES_PER_REPAIR - current.length;
      const discarded = accepted.length - room;
      // Nunca descartar en silencio: si el usuario eligió 5 fotos, tiene que
      // enterarse de que solo entraron las primeras.
      if (discarded > 0) {
        toast.warning(
          discarded === 1
            ? 'Se agregó solo 1 foto: el máximo es 3 por reparación'
            : `Se descartaron ${discarded} fotos: el máximo es 3 por reparación`
        );
      }
      return [...current, ...accepted].slice(0, MAX_IMAGES_PER_REPAIR);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((current) => current.filter((_, i) => i !== index));
  }, []);

  // Índice por id: la lista de reparaciones hace un lookup por fila y `repairTypes`
  // puede tener cientos de entradas.
  // Se suman los tipos que llegan dentro de los grupos: si el listado general falla
  // pero los grupos cargan, las tareas agregadas igual muestran su nombre.
  const repairTypeNameById = useMemo(() => {
    const index = new Map(repairTypes.map((type) => [type.id, type.name]));
    groups.forEach((group) => {
      group.repairTypes.forEach((type) => {
        if (!index.has(type.id)) index.set(type.id, type.name);
      });
    });
    return index;
  }, [repairTypes, groups]);

  const repairLabel = useCallback(
    (repair: ManualRepair) =>
      (repair.repairTypeId ? repairTypeNameById.get(repair.repairTypeId) : null) ?? repair.freeText ?? '',
    [repairTypeNameById]
  );

  // Nombre del grupo para mostrarlo en cada reparación que salió de uno
  const groupNameById = useMemo(() => new Map(groups.map((group) => [group.id, group.name])), [groups]);

  /**
   * Grupos con la explicación del match ya calculada.
   *
   * El filtrado del popover se hace por substring (ver el `filter` del `Command`),
   * así que acá se puede saber con exactitud qué tareas coincidieron y mostrarlas.
   */
  const searchTokens = useMemo(() => tokenizeQuery(groupSearch), [groupSearch]);
  const groupsWithMatches = useMemo(() => {
    return groups.map((group) => {
      const previewNames = group.repairTypes.map((type) => type.name).filter((name): name is string => !!name);
      const normalizedGroupName = normalizeText(group.name);

      // Solo se explican las palabras que NO estan en el nombre del grupo: son las que
      // hacen que el resultado parezca erroneo, porque el motivo esta en otro lado.
      const tokensOutsideName = searchTokens.filter((token) => !normalizedGroupName.includes(token));
      const matchedNames =
        tokensOutsideName.length > 0
          ? previewNames.filter((name) => {
              const normalizedName = normalizeText(name);
              return tokensOutsideName.some((token) => normalizedName.includes(token));
            })
          : [];

      return { group, previewNames, matchedNames };
    });
  }, [groups, searchTokens]);

  return (
    <div className="space-y-4">
      {/* ── Reparaciones ya agregadas ─────────────────────────────────────── */}
      {/* role="list" explícito: el reset de Tailwind quita los bullets y con eso
          VoiceOver deja de anunciar la lista */}
      {repairs.length > 0 && (
        <ul role="list" className="flex flex-col divide-y rounded-md border">
          {repairs.map((repair) => {
            const groupName = repair.groupId ? groupNameById.get(repair.groupId) ?? null : null;
            return (
              <li key={repair.localId} className="flex items-start gap-3 px-3 py-2.5">
                {repair.repairTypeId ? (
                  <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <PencilLine className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium break-words">{repairLabel(repair)}</span>
                    {!repair.repairTypeId && (
                      <Badge variant="secondary" className="text-xs">
                        Nuevo ítem
                      </Badge>
                    )}
                    {repair.images.length > 0 && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <ImagePlus className="h-3 w-3" />
                        <span className="tabular-nums">{repair.images.length}</span>
                        <span className="sr-only">
                          {repair.images.length === 1 ? 'foto adjunta' : 'fotos adjuntas'}
                        </span>
                      </Badge>
                    )}
                    {/* De qué grupo vino: sin esto el usuario no distingue lo que
                        agregó a propósito de lo que entró al expandir un grupo. Es el
                        mismo badge que usan los demás listados del módulo. */}
                    <RepairGroupBadge groupName={groupName} />
                  </div>
                  {repair.description && (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                      {repair.description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(repair.localId)}
                  disabled={disabled}
                  aria-label={`Quitar reparación ${repairLabel(repair)}`}
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent',
                    'text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive',
                    FOCUS_RING,
                    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'
                  )}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Alta de una reparación ────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardHeader className="py-3">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Agregar reparación</span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pb-4 pt-0">
          {/* ── Camino 1: grupo de reparaciones ─────────────────────────────
              Atajo para pedidos largos: el supervisor elige "Service de motor"
              y el sistema expande todas las tareas que lo componen. */}
          {showGroupsPath && (
            <>
              <div className="space-y-2 rounded-md border border-dashed bg-muted/40 p-3">
                <Label id={groupLabelId}>Grupo de reparaciones</Label>
                <Popover open={groupsOpen} onOpenChange={setGroupsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id={groupTriggerId}
                      type="button"
                      variant="outline"
                      role="combobox"
                      // Igual que el combobox de tareas: el nombre accesible se arma
                      // con el label del campo más el contenido del botón.
                      aria-labelledby={`${groupLabelId} ${groupTriggerId}`}
                      aria-busy={isLoadingGroups || undefined}
                      aria-describedby={hasGroupsError ? groupErrorId : groupHintId}
                      disabled={disabled || isLoadingGroups || hasGroupsError}
                      className="w-full justify-between bg-background text-muted-foreground"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {isLoadingGroups ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        ) : (
                          <Package className="h-4 w-4 shrink-0" />
                        )}
                        <span className="truncate">
                          {isLoadingGroups
                            ? 'Cargando grupos...'
                            : hasGroupsError
                              ? 'No se pudieron cargar los grupos'
                              : 'Buscá y elegí un grupo'}
                        </span>
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    {/* Filtro por tokens (AND) en vez del fuzzy por defecto de cmdk: es
                        el único modo de garantizar que lo que se resalta abajo sea
                        exactamente el motivo por el que el grupo aparece en la lista.
                        Se buscan las palabras por separado para que "motor aceite"
                        encuentre el grupo aunque cada palabra este en un lado distinto. */}
                    <Command filter={(value, search) => (matchesAllTokens(value, tokenizeQuery(search)) ? 1 : 0)}>
                      <CommandInput
                        placeholder="Buscar grupo o tarea..."
                        value={groupSearch}
                        onValueChange={setGroupSearch}
                      />
                      <CommandList>
                        <CommandEmpty>No se encontró el grupo</CommandEmpty>
                        <CommandGroup>
                          {groupsWithMatches.map(({ group, previewNames, matchedNames }) => (
                            <CommandItem
                              key={group.id}
                              // Se busca por nombre del grupo y por el de sus tareas:
                              // el supervisor suele acordarse de una de las tareas,
                              // no del nombre exacto del grupo.
                              value={`${group.name} ${previewNames.join(' ')}`}
                              onSelect={() => handleSelectGroup(group.id)}
                              className="flex flex-col items-start gap-1 py-2.5"
                            >
                              <div className="flex w-full items-center gap-2">
                                <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <span className="truncate font-medium">
                                  <HighlightedText text={group.name} tokens={searchTokens} />
                                </span>
                                <Badge variant="secondary" className="ml-auto shrink-0 tabular-nums">
                                  {group.repairTypes.length}
                                </Badge>
                              </div>
                              {/* El match vino de una tarea interna y no del nombre del
                                  grupo: se dice cuál, o el resultado parece un error. */}
                              {matchedNames.length > 0 ? (
                                <p className="ml-6 text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">Coincide en: </span>
                                  {matchedNames.slice(0, 3).map((name, index) => (
                                    <span key={name}>
                                      {index > 0 && ', '}
                                      <HighlightedText text={name} tokens={searchTokens} />
                                    </span>
                                  ))}
                                  {matchedNames.length > 3 && ` +${matchedNames.length - 3} más`}
                                </p>
                              ) : (
                                previewNames.length > 0 && (
                                  <p className="ml-6 text-xs text-muted-foreground">
                                    {previewNames.slice(0, 3).join(', ')}
                                    {previewNames.length > 3 && ` +${previewNames.length - 3} más`}
                                  </p>
                                )
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {hasGroupsError ? (
                  <div
                    id={groupErrorId}
                    role="alert"
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-destructive"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>No se pudieron cargar los grupos. Podés cargar las reparaciones de a una.</span>
                    {onRetryGroups && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={onRetryGroups}
                        disabled={disabled}
                        className="h-auto p-0 text-xs text-destructive underline"
                      >
                        Reintentar
                      </Button>
                    )}
                  </div>
                ) : (
                  <p id={groupHintId} className="text-xs text-muted-foreground">
                    Agrega de una vez todas las tareas del grupo (ej: "Service de motor"). Después podés quitar de la
                    lista las que no apliquen.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">o</span>
                <Separator className="flex-1" />
              </div>
            </>
          )}

          {/* ── Camino 2: una tarea del listado, con buscador ───────────────── */}
          {showRepairTypesPath && (
            <div className="space-y-2">
              <Label id={typeLabelId}>Reparación del listado</Label>
              <Popover open={typesOpen} onOpenChange={setTypesOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id={typeTriggerId}
                    type="button"
                    variant="outline"
                    role="combobox"
                    // El Label no puede usar htmlFor contra un botón: el nombre accesible
                    // se arma con el label del campo más el valor elegido.
                    aria-labelledby={`${typeLabelId} ${typeTriggerId}`}
                    aria-busy={isLoadingRepairTypes || undefined}
                    aria-describedby={hasRepairTypesError ? typeErrorId : undefined}
                    disabled={disabled || isLoadingRepairTypes || hasRepairTypesError}
                    className={cn('w-full justify-between', !selectedType && 'text-muted-foreground')}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {isLoadingRepairTypes ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <Wrench className="h-4 w-4 shrink-0" />
                      )}
                      <span className="truncate">
                        {isLoadingRepairTypes
                          ? 'Cargando tareas...'
                          : hasRepairTypesError
                            ? 'No se pudieron cargar las tareas'
                            : selectedType?.name ?? 'Buscá y elegí una reparación'}
                      </span>
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar reparación..." />
                    <CommandList>
                      <CommandEmpty>No se encontró la tarea</CommandEmpty>
                      <CommandGroup>
                        {repairTypes.map((type) => (
                          <CommandItem
                            key={type.id}
                            value={type.name ?? type.id}
                            onSelect={() => handleSelectType(type.id)}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4 shrink-0',
                                type.id === repairTypeId ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <span className="truncate">{type.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Error de carga: el listado no sirve, pero el texto libre de abajo sí */}
              {hasRepairTypesError && (
                <div
                  id={typeErrorId}
                  role="alert"
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-destructive"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>No se pudieron cargar las tareas. Podés escribir la reparación a mano acá abajo.</span>
                  {onRetryRepairTypes && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={onRetryRepairTypes}
                      disabled={disabled}
                      className="h-auto p-0 text-xs text-destructive underline"
                    >
                      Reintentar
                    </Button>
                  )}
                </div>
              )}

              {/* Listado vacío legítimo: no hay tareas cargadas en el sistema */}
              {!isLoadingRepairTypes && !hasRepairTypesError && repairTypes.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Todavía no hay reparaciones cargadas en el sistema. Escribila acá abajo.
                </p>
              )}
            </div>
          )}

          {showRepairTypesPath && (
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">o</span>
              <Separator className="flex-1" />
            </div>
          )}

          {/* ── Camino 3: texto libre, para lo que no existe como tipo ─────── */}
          <div className="space-y-2">
            {/* Sin el listado los dos textarea quedan pegados y con affordance
                idéntica, así que el primero se nombra como título y el segundo
                como detalle — antes ambos decían "escribí/describí la reparación"
                y no se entendía qué iba en cada uno (ticket 654). */}
            <Label htmlFor={freeTextId}>
              {showRepairTypesPath ? 'Escribí la reparación (si no está en el listado)' : '¿Qué hay que reparar?'}
            </Label>
            <Textarea
              id={freeTextId}
              aria-describedby={freeTextHintId}
              value={freeText}
              onChange={(e) => {
                setFreeText(e.target.value);
                // Escribir texto libre descarta el tipo elegido: son excluyentes
                if (e.target.value.trim()) setRepairTypeId(null);
              }}
              placeholder="Ej: reparar guardabarros trasero"
              rows={2}
              disabled={disabled}
              className="field-sizing-content max-h-[10rem] min-h-[3.5rem] resize-none"
            />
            {/* Con `freeTextOnly` no hay listado ni "tarea de arriba" que mencionar:
                el texto que habla de las dos opciones no aplica (ticket 654). */}
            <p id={freeTextHintId} className="text-xs text-muted-foreground">
              {showRepairTypesPath
                ? 'Usalo si la tarea no está en el listado. Cargá una sola de las dos opciones: al escribir acá se deselecciona la tarea de arriba. El taller la va a asociar al tipo que corresponda.'
                : 'Una línea alcanza. El taller la va a asociar al tipo que corresponda.'}
            </p>
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor={descriptionId}>
              {showRepairTypesPath ? 'Descripción (opcional)' : 'Detalle (opcional)'}
            </Label>
            <Textarea
              id={descriptionId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                showRepairTypesPath
                  ? 'Explicá brevemente la reparación'
                  : 'Contexto, síntomas o lo que haga falta aclarar'
              }
              rows={2}
              disabled={disabled}
              className="field-sizing-content max-h-[10rem] min-h-[3.5rem] resize-none"
            />
          </div>

          {/* Fotos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label id={photosLabelId}>Fotos (opcional)</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {images.length} de {MAX_IMAGES_PER_REPAIR}
              </span>
            </div>
            <div
              role="group"
              aria-labelledby={photosLabelId}
              aria-describedby={photosHintId}
              className="flex flex-wrap gap-2"
            >
              {images.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="relative h-20 w-20 overflow-hidden rounded-md border focus-within:ring-[3px] focus-within:ring-ring/50"
                >
                  <Image
                    src={imagePreviews[index]}
                    alt={`Foto ${index + 1} de la reparación: ${file.name}`}
                    fill
                    sizes="80px"
                    unoptimized
                    className="object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(index)}
                    disabled={disabled}
                    aria-label={`Quitar foto ${index + 1} de ${images.length}`}
                    className={cn(
                      'absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full',
                      'bg-background/90 text-foreground shadow-sm transition-colors',
                      'hover:bg-destructive hover:text-destructive-foreground',
                      FOCUS_RING,
                      'disabled:cursor-not-allowed disabled:opacity-40'
                    )}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {!reachedImageLimit && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                  aria-label={`Agregar foto (${images.length} de ${MAX_IMAGES_PER_REPAIR})`}
                  className={cn(
                    'flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed',
                    'text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground',
                    FOCUS_RING,
                    'disabled:cursor-not-allowed disabled:opacity-40'
                  )}
                >
                  <ImagePlus className="h-5 w-5" />
                  <span className="text-xs">Agregar</span>
                </button>
              )}
            </div>
            <p id={photosHintId} className="text-xs text-muted-foreground">
              {reachedImageLimit
                ? `Llegaste al máximo de ${MAX_IMAGES_PER_REPAIR} fotos. Quitá una para agregar otra.`
                : `Podés adjuntar hasta ${MAX_IMAGES_PER_REPAIR} fotos de hasta 10 MB cada una.`}
            </p>
            {/* Las fotos solas no alcanzan para agregar la reparación. El aviso va acá,
                pegado a las fotos, porque el hint del botón queda abajo a la derecha y
                el usuario no lo ve: creía que "Siguiente" estaba roto. */}
            {images.length > 0 && !canAdd && !disabled && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 p-2.5 text-xs"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                <span>
                  {images.length === 1 ? 'Cargaste 1 foto' : `Cargaste ${images.length} fotos`}, pero todavía falta
                  elegir la tarea del listado o escribir la reparación. Sin eso no se puede agregar al pedido ni
                  continuar.
                </span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => handlePickImages(e.target.files)}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {!canAdd && !disabled && (
              <p id={addHintId} className="text-xs text-muted-foreground sm:order-first">
                {showRepairTypesPath
                  ? 'Elegí una tarea del listado o escribí la reparación para poder agregarla.'
                  : 'Escribí la reparación para poder agregarla.'}
              </p>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={!canAdd}
              aria-describedby={!canAdd && !disabled ? addHintId : undefined}
              className="w-full sm:w-auto"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Agregar reparación
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
