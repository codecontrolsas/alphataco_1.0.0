'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { useFormContext } from 'react-hook-form';
import {
  getAllAptitudeOptions,
  getAllCategoryOptions,
  getAllCompanyPositionOptions,
  getAllContractTypeOptions,
  getAllContractorOptions,
  getAllCostCenterOptions,
  getAllCovenantOptions,
  getAllGuildOptions,
  getAllHierarchyOptions,
  getAllWorkDiagramOptions,
  getAllWorkshopSectorOptions,
} from '../../actions.server';
import type { EmployeeWorkDataValues } from './employee-form';

/**
 * Datos laborales del legajo. Toma el form del contexto para poder reutilizarse tal cual
 * en dos lugares: la ficha del empleado y la aprobación de un candidato (ticket 505),
 * donde son exactamente los campos que se completan al dar el OK.
 */
export function EmployeeWorkDataForm() {
  const form = useFormContext<EmployeeWorkDataValues>();
  // ─── Catálogos base (siempre cargados) ─────────────────────────────────────
  const { data: hierarchicalPositions = [], isLoading: loadingHierarchy } = useQuery({
    queryKey: ['catalog', 'hierarchy'],
    queryFn: () => getAllHierarchyOptions(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: companyPositions = [], isLoading: loadingCompanyPositions } = useQuery({
    queryKey: ['catalog', 'company-positions'],
    queryFn: () => getAllCompanyPositionOptions(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: workDiagrams = [], isLoading: loadingWorkDiagrams } = useQuery({
    queryKey: ['catalog', 'work-diagrams'],
    queryFn: () => getAllWorkDiagramOptions(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: guilds = [], isLoading: loadingGuilds } = useQuery({
    queryKey: ['catalog', 'guilds'],
    queryFn: () => getAllGuildOptions(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: covenants = [], isLoading: loadingCovenants } = useQuery({
    queryKey: ['catalog', 'covenants'],
    queryFn: () => getAllCovenantOptions(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: () => getAllCategoryOptions(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: costCenters = [], isLoading: loadingCostCenters } = useQuery({
    queryKey: ['catalog', 'cost-centers'],
    queryFn: () => getAllCostCenterOptions(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: contractorCompanies = [], isLoading: loadingContractors } = useQuery({
    queryKey: ['catalog', 'contractors'],
    queryFn: () => getAllContractorOptions(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: contractTypes = [], isLoading: loadingContractTypes } = useQuery({
    queryKey: ['catalog', 'contract-types'],
    queryFn: () => getAllContractTypeOptions(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: aptitudes = [], isLoading: loadingAptitudes } = useQuery({
    queryKey: ['catalog', 'aptitudes'],
    queryFn: () => getAllAptitudeOptions(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: workshopSectors = [], isLoading: loadingWorkshopSectors } = useQuery({
    queryKey: ['catalog', 'workshop-sectors'],
    queryFn: () => getAllWorkshopSectorOptions(),
    staleTime: 10 * 60 * 1000,
  });

  // ─── Watchers para cascada ──────────────────────────────────────────────────
  const allocatedTo = form.watch('allocated_to') || [];
  const selectedAptitudes = form.watch('aptitudes') || [];
  const selectedHierarchicalPosition = form.watch('hierarchical_position');
  const selectedCompanyPosition = form.watch('company_position');
  const selectedGuildId = form.watch('guild_id');
  const selectedCovenantId = form.watch('covenants_id');

  // ─── Listas filtradas (cascada derivada del state del form) ─────────────────
  const filteredCompanyPositions = selectedHierarchicalPosition
    ? companyPositions.filter((position) => position.hierarchical_position_id?.includes(selectedHierarchicalPosition))
    : [];

  const filteredAptitudes = selectedCompanyPosition
    ? aptitudes.filter((aptitude) =>
        aptitude.aptitudes_tecnicas_puestos.some((puesto) => puesto.puesto_id === selectedCompanyPosition)
      )
    : [];

  const filteredCovenants = selectedGuildId
    ? covenants.filter((covenant) => covenant.guild_id === selectedGuildId)
    : [];

  const filteredCategories = selectedCovenantId
    ? categories.filter((category) => category.covenant_id === selectedCovenantId)
    : [];

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleContractorChange = (contractorId: string, checked: boolean) => {
    const currentAllocated = form.getValues('allocated_to') || [];
    if (checked) {
      form.setValue('allocated_to', [...currentAllocated, contractorId]);
    } else {
      form.setValue(
        'allocated_to',
        currentAllocated.filter((id: string) => id !== contractorId)
      );
    }
  };

  const handleAptitudeChange = (aptitudeId: string, checked: boolean) => {
    const currentAptitudes = form.getValues('aptitudes') || [];
    if (checked) {
      form.setValue('aptitudes', [...currentAptitudes, aptitudeId]);
    } else {
      form.setValue(
        'aptitudes',
        currentAptitudes.filter((id: string) => id !== aptitudeId)
      );
    }
  };

  const handleHierarchicalPositionChange = (hierarchicalPositionId: string) => {
    const currentHierarchicalPosition = form.getValues('hierarchical_position');
    form.setValue('hierarchical_position', hierarchicalPositionId, { shouldValidate: true, shouldDirty: true });

    // Si se selecciona una posición jerárquica diferente, restablecer puesto de empresa y aptitudes
    if (currentHierarchicalPosition !== hierarchicalPositionId) {
      form.resetField('company_position');
      form.setValue('aptitudes', []);
    }
  };

  const handleCompanyPositionChange = (companyPositionId: string) => {
    const currentCompanyPosition = form.getValues('company_position');
    form.setValue('company_position', companyPositionId, { shouldValidate: true, shouldDirty: true });

    // Si se selecciona un puesto diferente, restablecer aptitudes seleccionadas
    if (currentCompanyPosition !== companyPositionId) {
      form.setValue('aptitudes', []);
    }
  };

  const handleGuildChange = (guildId: string) => {
    const currentGuildId = form.getValues('guild_id');
    form.setValue('guild_id', guildId);

    // Si se selecciona un gremio diferente al actual, restablecer convenio y categoría
    if (currentGuildId !== guildId) {
      form.resetField('covenants_id');
      form.resetField('category_id');
    }
  };

  const handleCovenantChange = (covenantId: string) => {
    const currentCovenantId = form.getValues('covenants_id');
    form.setValue('covenants_id', covenantId);

    // Si se selecciona un convenio diferente al actual, restablecer categoría
    if (currentCovenantId !== covenantId) {
      form.resetField('category_id');
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 [&_[data-slot=select-trigger]]:w-full">
        {/* Legajo */}
        <FormField
          control={form.control}
          name="file"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Legajo *</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Ingrese el legajo" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Sector */}
        <FormField
          control={form.control}
          name="hierarchical_position"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sector *</FormLabel>
              {loadingHierarchy ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select onValueChange={handleHierarchicalPositionChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione el sector" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {hierarchicalPositions.map((position) => (
                      <SelectItem key={position.id} value={position.id}>
                        {position.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Puesto en la empresa */}
        <FormField
          control={form.control}
          name="company_position"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Puesto en la empresa *</FormLabel>
              {loadingCompanyPositions ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select
                  onValueChange={handleCompanyPositionChange}
                  defaultValue={field.value}
                  disabled={!selectedHierarchicalPosition}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          !selectedHierarchicalPosition ? 'Primero seleccione un sector' : 'Seleccione el puesto'
                        }
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {filteredCompanyPositions.map((position) => (
                      <SelectItem key={position.id} value={position.id}>
                        {position.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Diagrama de trabajo */}
        <FormField
          control={form.control}
          name="workflow_diagram"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Diagrama de trabajo *</FormLabel>
              {loadingWorkDiagrams ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione el diagrama" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {workDiagrams.map((diagram) => (
                      <SelectItem key={diagram.id} value={diagram.id}>
                        {diagram.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Horas normales */}
        <FormField
          control={form.control}
          name="normal_hours"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Horas normales</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Ingrese las horas normales" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Tipo de contrato */}
        <FormField
          control={form.control}
          name="type_of_contract"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de contrato</FormLabel>
              {loadingContractTypes ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione tipo de contrato" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {contractTypes.map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {contract.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Fecha de ingreso */}
        <FormField
          control={form.control}
          name="date_of_admission"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha de ingreso</FormLabel>
              <FormControl>
                <Input {...field} type="date" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Gremio */}
        <FormField
          control={form.control}
          name="guild_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Gremio</FormLabel>
              {loadingGuilds ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select onValueChange={handleGuildChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione el gremio" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {guilds.map((guild) => (
                      <SelectItem key={guild.id} value={guild.id}>
                        {guild.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Convenio */}
        <FormField
          control={form.control}
          name="covenants_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Convenio</FormLabel>
              {loadingCovenants ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select onValueChange={handleCovenantChange} defaultValue={field.value} disabled={!selectedGuildId}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={!selectedGuildId ? 'Primero seleccione un gremio' : 'Seleccione el convenio'}
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {filteredCovenants.map((covenant) => (
                      <SelectItem key={covenant.id} value={covenant.id}>
                        {covenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Categoría */}
        <FormField
          control={form.control}
          name="category_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Categoría</FormLabel>
              {loadingCategories ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!selectedCovenantId}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={!selectedCovenantId ? 'Primero seleccione un convenio' : 'Seleccione la categoría'}
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {filteredCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Centro de costo */}
        <FormField
          control={form.control}
          name="cost_center_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Centro de costo</FormLabel>
              {loadingCostCenters ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione el centro de costo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {costCenters.map((center) => (
                      <SelectItem key={center.id} value={center.id}>
                        {center.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Tipo de costo */}
        <FormField
          control={form.control}
          name="cost_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de costo</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione tipo de costo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Directo">Directo</SelectItem>
                  <SelectItem value="Indirecto">Indirecto</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Sectores de Taller (multiselect) */}
        <FormField
          control={form.control}
          name="workshop_sector_ids"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sectores de Taller</FormLabel>
              <FormControl>
                <MultiSelectCombobox
                  options={workshopSectors.map((sector) => ({
                    value: sector.id,
                    label: sector.workshops?.name ? `${sector.name} - ${sector.workshops.name}` : sector.name,
                  }))}
                  selectedValues={field.value ?? []}
                  onChange={field.onChange}
                  placeholder="Seleccione los sectores de taller"
                  emptyMessage="No hay sectores disponibles"
                  isLoading={loadingWorkshopSectors}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Asignado a contratistas */}
        <Card>
          <CardHeader>
            <CardTitle>Asignado a contratistas</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingContractors ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ) : contractorCompanies.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {contractorCompanies.map((contractor) => (
                  <div key={contractor.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={contractor.id}
                      checked={allocatedTo.includes(contractor.id)}
                      onCheckedChange={(checked) => handleContractorChange(contractor.id, checked as boolean)}
                    />
                    <label
                      htmlFor={contractor.id}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {contractor.name}
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No hay contratistas asignados</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aptitudes Técnicas</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAptitudes ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ) : !selectedCompanyPosition ? (
              <p className="text-sm text-muted-foreground">
                Primero seleccione un puesto para ver las aptitudes disponibles
              </p>
            ) : filteredAptitudes.filter((a) => a.is_active).length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {filteredAptitudes
                  .filter((aptitude) => aptitude.is_active)
                  .map((aptitude) => (
                    <div key={aptitude.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={aptitude.id}
                        checked={selectedAptitudes.includes(aptitude.id)}
                        onCheckedChange={(checked) => handleAptitudeChange(aptitude.id, checked as boolean)}
                      />
                      <label
                        htmlFor={aptitude.id}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {aptitude.nombre}
                      </label>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No hay aptitudes disponibles para el puesto seleccionado</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
