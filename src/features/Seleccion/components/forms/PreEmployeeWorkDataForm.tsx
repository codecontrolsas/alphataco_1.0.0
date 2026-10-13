'use client';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { getAllCompanyPositionOptions, getAllHierarchyOptions } from '@/features/Employees/EmpleadoID/actions.server';
import { useQuery } from '@tanstack/react-query';
import { useFormContext } from 'react-hook-form';
import type { PreEmployeeFormData } from '../../schemas/pre-employee-schema';

/**
 * Datos laborales del candidato: solo sector y puesto PROPUESTOS.
 * El resto de los datos laborales (legajo definitivo, diagrama, convenio, categoría,
 * afectaciones...) se completan recién al convertirlo en legajo.
 */
export function PreEmployeeWorkDataForm() {
  const form = useFormContext<PreEmployeeFormData>();

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

  const selectedHierarchicalPosition = form.watch('proposed_hierarchical_position');

  // El puesto depende del sector elegido (misma cascada que el legajo de empleado)
  const filteredCompanyPositions = selectedHierarchicalPosition
    ? companyPositions.filter((position) => position.hierarchical_position_id?.includes(selectedHierarchicalPosition))
    : [];

  const handleHierarchySelect = (hierarchyId: string) => {
    form.setValue('proposed_hierarchical_position', hierarchyId, { shouldValidate: true, shouldDirty: true });
    // Al cambiar de sector, el puesto anterior deja de ser válido
    form.setValue('proposed_company_position', '', { shouldValidate: false, shouldDirty: true });
    form.clearErrors('proposed_company_position');
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        En esta etapa solo se registran el sector y el puesto propuestos. El resto de los datos laborales se completan
        al aprobar el candidato y crear el legajo definitivo.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&_button[role=combobox]]:w-full">
        {/* Sector propuesto */}
        <FormField
          control={form.control}
          name="proposed_hierarchical_position"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sector propuesto *</FormLabel>
              {loadingHierarchy ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select onValueChange={handleHierarchySelect} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione el sector" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {hierarchicalPositions.map((hierarchy) => (
                      <SelectItem key={hierarchy.id} value={hierarchy.id}>
                        {hierarchy.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Puesto propuesto */}
        <FormField
          control={form.control}
          name="proposed_company_position"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Puesto propuesto *</FormLabel>
              {loadingCompanyPositions ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select onValueChange={field.onChange} value={field.value} disabled={!selectedHierarchicalPosition}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          selectedHierarchicalPosition ? 'Seleccione el puesto' : 'Primero seleccione un sector'
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
      </div>
    </div>
  );
}
