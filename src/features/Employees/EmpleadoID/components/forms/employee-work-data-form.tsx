'use client';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { SelectFormField } from '@/shared/components/common/form-fields';
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
import type { EmployeeWorkDataValues } from '../../schemas/employee-schema';
import { AptitudesCard, ContractorsCard } from './employee-work-data-cards';

const COST_TYPE_OPTIONS = [
  { id: 'Directo', name: 'Directo' },
  { id: 'Indirecto', name: 'Indirecto' },
];

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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 [&_button[role=combobox]]:w-full">
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
        <SelectFormField
          control={form.control}
          name="hierarchical_position"
          label="Sector *"
          placeholder="Seleccione el sector"
          options={hierarchicalPositions}
          loading={loadingHierarchy}
          onValueChange={handleHierarchicalPositionChange}
        />

        {/* Puesto en la empresa */}
        <SelectFormField
          control={form.control}
          name="company_position"
          label="Puesto en la empresa *"
          placeholder={!selectedHierarchicalPosition ? 'Primero seleccione un sector' : 'Seleccione el puesto'}
          options={filteredCompanyPositions}
          loading={loadingCompanyPositions}
          disabled={!selectedHierarchicalPosition}
          onValueChange={handleCompanyPositionChange}
        />

        {/* Diagrama de trabajo */}
        <SelectFormField
          control={form.control}
          name="workflow_diagram"
          label="Diagrama de trabajo *"
          placeholder="Seleccione el diagrama"
          options={workDiagrams}
          loading={loadingWorkDiagrams}
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
        <SelectFormField
          control={form.control}
          name="type_of_contract"
          label="Tipo de contrato"
          placeholder="Seleccione tipo de contrato"
          options={contractTypes}
          loading={loadingContractTypes}
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
        <SelectFormField
          control={form.control}
          name="guild_id"
          label="Gremio"
          placeholder="Seleccione el gremio"
          options={guilds}
          loading={loadingGuilds}
          onValueChange={handleGuildChange}
        />

        {/* Convenio */}
        <SelectFormField
          control={form.control}
          name="covenants_id"
          label="Convenio"
          placeholder={!selectedGuildId ? 'Primero seleccione un gremio' : 'Seleccione el convenio'}
          options={filteredCovenants}
          loading={loadingCovenants}
          disabled={!selectedGuildId}
          onValueChange={handleCovenantChange}
        />

        {/* Categoría */}
        <SelectFormField
          control={form.control}
          name="category_id"
          label="Categoría"
          placeholder={!selectedCovenantId ? 'Primero seleccione un convenio' : 'Seleccione la categoría'}
          options={filteredCategories}
          loading={loadingCategories}
          disabled={!selectedCovenantId}
        />

        {/* Centro de costo */}
        <SelectFormField
          control={form.control}
          name="cost_center_id"
          label="Centro de costo"
          placeholder="Seleccione el centro de costo"
          options={costCenters}
          loading={loadingCostCenters}
        />

        {/* Tipo de costo */}
        <SelectFormField
          control={form.control}
          name="cost_type"
          label="Tipo de costo"
          placeholder="Seleccione tipo de costo"
          options={COST_TYPE_OPTIONS}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ContractorsCard
          contractors={contractorCompanies}
          isLoading={loadingContractors}
          selectedIds={allocatedTo}
          onToggle={handleContractorChange}
        />
        <AptitudesCard
          aptitudes={filteredAptitudes.filter((aptitude) => aptitude.is_active)}
          isLoading={loadingAptitudes}
          hasPosition={!!selectedCompanyPosition}
          selectedIds={selectedAptitudes}
          onToggle={handleAptitudeChange}
        />
      </div>
    </div>
  );
}
