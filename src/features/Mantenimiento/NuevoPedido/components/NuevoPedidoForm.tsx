'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { fetchMaintenanceGroupsActionType } from '@/features/Mantenimiento/TiposReparaciones/actions/maintenanceGroupActions';
import { fetchAllEquipmentBasicData } from '@/features/Mantenimiento/actions/equipment-basic';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { TypeOfRepair } from '@/shared/types/legacy';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, ChevronsUpDown, Package, Plus, Trash2, Wrench } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { createMaintenanceOrderDirect } from '../actions/orders.server';
import { checkExistingMaintenanceOrder } from '../actions/queries.server';

const logger = new Logger('NuevoPedidoForm');

// ============================================
// TIPOS Y SCHEMA
// ============================================
const FormSchema = z.object({
  equipment_id: z.string({
    required_error: 'Por favor selecciona un equipo',
  }),
  kilometer: z.string().optional(),
  engine_hours: z.string().optional(),
  description: z.string().max(255, 'La descripción no puede superar los 255 caracteres').optional(),
  repair_types: z.array(z.string()).min(1, 'Debes seleccionar al menos un tipo de reparación'),
});

const DESCRIPTION_MAX_LENGTH = 255;

type FormValues = z.infer<typeof FormSchema>;

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
interface NuevoPedidoFormProps {
  equipment: Awaited<ReturnType<typeof fetchAllEquipmentBasicData>>;
  types_of_repairs: TypeOfRepair;
  maintenance_groups: NonNullable<fetchMaintenanceGroupsActionType['groups']>;
  default_equipment_id?: string;
  onSuccess?: () => void;
}

export function NuevoPedidoForm({
  equipment,
  types_of_repairs,
  maintenance_groups,
  default_equipment_id,
  onSuccess,
}: NuevoPedidoFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [repairTypesOpen, setRepairTypesOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Encontrar equipo seleccionado por defecto
  const defaultEquipment = equipment?.find((e) => e.id === default_equipment_id);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      equipment_id: default_equipment_id || '',
      kilometer: defaultEquipment?.kilometer || '',
      engine_hours: defaultEquipment?.engine_hours || '',
      description: '',
      repair_types: [],
    },
  });

  const selectedEquipmentId = form.watch('equipment_id');
  const selectedRepairTypes = form.watch('repair_types');

  // Equipo seleccionado actual
  const selectedEquipment = useMemo(
    () => equipment?.find((e) => e.id === selectedEquipmentId),
    [equipment, selectedEquipmentId]
  );

  // Filtrar equipos por búsqueda
  const filteredEquipment = useMemo(() => {
    if (!searchTerm) return equipment?.slice(0, 50) || [];

    return (
      equipment?.filter((equip) => {
        const searchValue = searchTerm.toLowerCase();
        const domain = (equip.domain || '').toLowerCase();
        const serie = (equip.serie || '').toLowerCase();
        const internNumber = String(equip.intern_number || '').toLowerCase();

        return domain.includes(searchValue) || serie.includes(searchValue) || internNumber.includes(searchValue);
      }) || []
    );
  }, [equipment, searchTerm]);

  // Manejar selección de equipo
  const handleSelectEquipment = useCallback(
    (equipId: string) => {
      const equip = equipment?.find((e) => e.id === equipId);
      if (equip) {
        form.setValue('equipment_id', equip.id);
        form.setValue('kilometer', equip.kilometer || '');
        form.setValue('engine_hours', equip.engine_hours || '');
        form.setValue('repair_types', []); // Reset repair types al cambiar equipo
      }
      setEquipmentOpen(false);
    },
    [equipment, form]
  );

  // Manejar selección de tipo de reparación
  const handleToggleRepairType = useCallback(
    (repairTypeId: string) => {
      const current = form.getValues('repair_types');
      const isSelected = current.includes(repairTypeId);

      if (isSelected) {
        form.setValue(
          'repair_types',
          current.filter((id) => id !== repairTypeId)
        );
      } else {
        form.setValue('repair_types', [...current, repairTypeId]);
      }
    },
    [form]
  );

  // Remover tipo de reparación
  const handleRemoveRepairType = useCallback(
    (repairTypeId: string) => {
      const current = form.getValues('repair_types');
      form.setValue(
        'repair_types',
        current.filter((id) => id !== repairTypeId)
      );
    },
    [form]
  );

  // Agregar grupo completo
  const handleAddGroup = useCallback(
    (groupId: string) => {
      const group = maintenance_groups.find((g) => g.id === groupId);
      if (!group) return;

      const groupRepairIds = group.maintenance_group_type_of_repairs.map((r) => r.type_id);
      const current = form.getValues('repair_types');

      // Agregar solo los que no están ya seleccionados
      const newIds = groupRepairIds.filter((id) => !current.includes(id));
      if (newIds.length > 0) {
        form.setValue('repair_types', [...current, ...newIds]);
        toast.success(`Se agregaron ${newIds.length} reparaciones del grupo "${group.name}"`);
      } else {
        toast.info('Todas las reparaciones del grupo ya están seleccionadas');
      }

      setGroupsOpen(false);
    },
    [form, maintenance_groups]
  );

  // Submit del formulario
  const onSubmit = async (data: FormValues) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // Verificar si ya existen pedidos para estas reparaciones
      const existingChecks = await Promise.all(
        data.repair_types.map(async (repairTypeId) => {
          const exists = await checkExistingMaintenanceOrder(data.equipment_id, repairTypeId);
          return { repairTypeId, exists };
        })
      );

      const alreadyExisting = existingChecks.filter((c) => c.exists);
      if (alreadyExisting.length > 0) {
        const existingNames = alreadyExisting
          .map((e) => types_of_repairs.find((t) => t.id === e.repairTypeId)?.name)
          .join(', ');
        toast.error(`Ya existen pedidos pendientes para: ${existingNames}`);
        setIsSubmitting(false);
        return;
      }

      // Crear los items del pedido
      const items = data.repair_types.map((repairTypeId) => ({
        repair_type_id: repairTypeId,
      }));

      // Crear el pedido
      await createMaintenanceOrderDirect({
        equipment_id: data.equipment_id,
        kilometer: data.kilometer || undefined,
        engine_hours: data.engine_hours || undefined,
        description: data.description?.trim() || undefined,
        items,
      });

      toast.success('Pedido de mantenimiento creado exitosamente');
      form.reset({
        equipment_id: default_equipment_id || '',
        kilometer: defaultEquipment?.kilometer || '',
        engine_hours: defaultEquipment?.engine_hours || '',
        description: '',
        repair_types: [],
      });
      queryClient.invalidateQueries();
      router.refresh();

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      logger.error('Error al crear pedido', { data: { error } });
      toast.error('Error al crear el pedido de mantenimiento');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Obtener nombres de reparaciones seleccionadas
  const selectedRepairNames = useMemo(
    () => selectedRepairTypes.map((id) => types_of_repairs.find((t) => t.id === id)).filter(Boolean),
    [selectedRepairTypes, types_of_repairs]
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Formulario */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Nuevo Pedido de Mantenimiento
          </CardTitle>
          <CardDescription>
            Crea un pedido de mantenimiento directamente. El pedido quedará pendiente de planificación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Selector de Equipo */}
              <FormField
                control={form.control}
                name="equipment_id"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Equipo</FormLabel>
                    <Popover
                      open={equipmentOpen}
                      onOpenChange={(open) => {
                        setEquipmentOpen(open);
                        if (!open) setSearchTerm('');
                      }}
                    >
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            disabled={!!default_equipment_id}
                            className={cn('w-full justify-between', !field.value && 'text-muted-foreground')}
                          >
                            {selectedEquipment
                              ? `${selectedEquipment.domain || selectedEquipment.serie}${selectedEquipment.intern_number ? ` (Nº${selectedEquipment.intern_number})` : ''}`
                              : 'Selecciona un equipo'}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0">
                        <Command>
                          <CommandInput
                            placeholder="Buscar por dominio, serie o número..."
                            onValueChange={setSearchTerm}
                          />
                          <CommandList>
                            <CommandEmpty>No se encontró el equipo</CommandEmpty>
                            <CommandGroup>
                              {filteredEquipment.map((equip) => (
                                <CommandItem
                                  key={equip.id}
                                  value={equip.domain || equip.serie || equip.id}
                                  onSelect={() => handleSelectEquipment(equip.id)}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      equip.id === field.value ? 'opacity-100' : 'opacity-0'
                                    )}
                                  />
                                  <div className="flex flex-col">
                                    <span className="font-medium">
                                      {equip.domain || equip.serie}
                                      {equip.intern_number && ` (Nº${equip.intern_number})`}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {equip.types_of_vehicles?.name} - {equip.condition}
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Kilometraje y Horómetro */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="kilometer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kilometraje actual</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          placeholder="Ingresa el kilometraje"
                          min={Number(selectedEquipment?.kilometer) || 0}
                        />
                      </FormControl>
                      {selectedEquipment?.kilometer && (
                        <p className="text-xs text-muted-foreground">
                          Último registrado: {selectedEquipment.kilometer} km
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="engine_hours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Horómetro</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          placeholder="Ingrese las horas de motor"
                          min={Number(selectedEquipment?.engine_hours) || 0}
                        />
                      </FormControl>
                      {selectedEquipment?.engine_hours && (
                        <p className="text-xs text-muted-foreground">
                          Último registrado: {selectedEquipment.engine_hours} hs
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Descripción (opcional) */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción (opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value ?? ''}
                        placeholder="Agrega una descripción del pedido (visible en todas las solapas de Operaciones y Taller)"
                        maxLength={DESCRIPTION_MAX_LENGTH}
                        rows={3}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground text-right">
                      {(field.value?.length ?? 0)}/{DESCRIPTION_MAX_LENGTH}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              {/* Selector de Tipos de Reparación */}
              <FormField
                control={form.control}
                name="repair_types"
                render={() => (
                  <FormItem>
                    <FormLabel>Tipos de Reparación</FormLabel>
                    <div className="flex gap-2">
                      {/* Selector individual */}
                      <Popover open={repairTypesOpen} onOpenChange={setRepairTypesOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="flex-1 justify-between">
                            <span className="flex items-center gap-2">
                              <Wrench className="h-4 w-4" />
                              Agregar reparación
                            </span>
                            <ChevronsUpDown className="h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar tipo de reparación..." />
                            <CommandList>
                              <CommandEmpty>No se encontró ningún tipo</CommandEmpty>
                              <CommandGroup>
                                <ScrollArea className="h-[300px]">
                                  {types_of_repairs.map((repair) => {
                                    const isSelected = selectedRepairTypes.includes(repair.id);
                                    return (
                                      <CommandItem
                                        key={repair.id}
                                        onSelect={() => handleToggleRepairType(repair.id)}
                                        className="flex items-center gap-2"
                                      >
                                        <Checkbox checked={isSelected} className="pointer-events-none" />
                                        <div className="flex flex-col flex-1">
                                          <span>{repair.name}</span>
                                          <span className="text-xs text-muted-foreground">
                                            {repair.type_of_maintenance} - Criticidad: {repair.criticity}
                                          </span>
                                        </div>
                                        <Badge
                                          variant={
                                            repair.criticity === 'Alta'
                                              ? 'destructive'
                                              : repair.criticity === 'Media'
                                                ? 'yellow'
                                                : 'success'
                                          }
                                          className="text-xs"
                                        >
                                          {repair.criticity}
                                        </Badge>
                                      </CommandItem>
                                    );
                                  })}
                                </ScrollArea>
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>

                      {/* Selector de grupos */}
                      {maintenance_groups.length > 0 && (
                        <Popover open={groupsOpen} onOpenChange={setGroupsOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="icon" title="Agregar grupo" aria-label="Agregar grupo">
                              <Package className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[350px] p-0" align="end">
                            <Command>
                              <CommandInput placeholder="Buscar grupo..." />
                              <CommandList>
                                <CommandEmpty>No hay grupos disponibles</CommandEmpty>
                                <CommandGroup heading="Grupos de Reparación">
                                  {maintenance_groups.map((group) => {
                                    const groupRepairNames = group.maintenance_group_type_of_repairs
                                      .map((r) => types_of_repairs.find((t) => t.id === r.type_id)?.name)
                                      .filter(Boolean);

                                    return (
                                      <CommandItem
                                        key={group.id}
                                        onSelect={() => handleAddGroup(group.id)}
                                        className="flex flex-col items-start py-3"
                                      >
                                        <div className="flex items-center gap-2 w-full">
                                          <Package className="h-4 w-4 text-muted-foreground" />
                                          <span className="font-medium">{group.name}</span>
                                          <Badge variant="secondary" className="ml-auto">
                                            {group.maintenance_group_type_of_repairs.length}
                                          </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 ml-6">
                                          {groupRepairNames.slice(0, 3).join(', ')}
                                          {groupRepairNames.length > 3 && ` +${groupRepairNames.length - 3} más`}
                                        </p>
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Lista de reparaciones seleccionadas */}
              {selectedRepairNames.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Reparaciones seleccionadas ({selectedRepairNames.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedRepairNames.map((repair) => (
                      <Badge key={repair!.id} variant="secondary" className="flex items-center gap-1 pr-1">
                        {repair!.name}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground rounded-full"
                          aria-label={`Quitar ${repair!.name}`}
                          onClick={() => handleRemoveRepairType(repair!.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </form>
          </Form>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || selectedRepairTypes.length === 0 || !selectedEquipmentId}
            onClick={form.handleSubmit(onSubmit)}
          >
            {isSubmitting ? 'Creando pedido...' : 'Crear Pedido de Mantenimiento'}
          </Button>
        </CardFooter>
      </Card>

      {/* Panel de resumen */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Resumen del Pedido
          </CardTitle>
          <CardDescription>Vista previa del pedido que se creará</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Info del equipo */}
          {selectedEquipment ? (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Equipo</span>
                <Badge variant="outline">{selectedEquipment.condition}</Badge>
              </div>
              <p className="text-lg font-semibold">{selectedEquipment.domain || selectedEquipment.serie}</p>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>{selectedEquipment.types_of_vehicles?.name}</span>
                {selectedEquipment.intern_number && <span>Nº Interno: {selectedEquipment.intern_number}</span>}
              </div>
              {form.watch('kilometer') && (
                <p className="text-sm">
                  Kilometraje: <span className="font-medium">{form.watch('kilometer')} km</span>
                </p>
              )}
              {form.watch('engine_hours') && (
                <p className="text-sm">
                  Horómetro: <span className="font-medium">{form.watch('engine_hours')} hs</span>
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
              Selecciona un equipo para ver el resumen
            </div>
          )}

          <Separator />

          {/* Lista de reparaciones */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Trabajos a realizar</p>
            {selectedRepairNames.length > 0 ? (
              <ul className="space-y-2">
                {selectedRepairNames.map((repair) => (
                  <li key={repair!.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{repair!.name}</span>
                      <span className="text-xs text-muted-foreground">{repair!.type_of_maintenance}</span>
                    </div>
                    <Badge
                      variant={
                        repair!.criticity === 'Alta'
                          ? 'destructive'
                          : repair!.criticity === 'Media'
                            ? 'yellow'
                            : 'success'
                      }
                    >
                      {repair!.criticity}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                No hay reparaciones seleccionadas
              </div>
            )}
          </div>

          {/* Estado del pedido */}
          {selectedRepairNames.length > 0 && selectedEquipment && (
            <>
              <Separator />
              <div className="rounded-lg bg-muted p-4 space-y-1">
                <p className="text-sm font-medium">Estado inicial del pedido</p>
                <div className="flex items-center gap-2">
                  <Badge variant="warning">Pendiente de Planificación</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  El pedido aparecerá en la tab "Pedidos de Mantenimiento" → "Pendientes" para asignarle fecha.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
