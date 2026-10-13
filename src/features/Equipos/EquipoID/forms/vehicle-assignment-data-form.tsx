'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCostCenterOptions } from '@/features/Empresa/General/actions/cost-centers.server';
import { fetchAllContractorForVehicles } from '@/features/Equipos/EquipoID/actions/vehicle-actions';
import { use } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { VehicleFormData } from '../components/vehicle-tabs';

interface VehicleAssignmentDataFormProps {
  form: UseFormReturn<VehicleFormData>;
  readOnly?: boolean;
  costCentersPromise: ReturnType<typeof getCostCenterOptions>;
  contractorsPromise: ReturnType<typeof fetchAllContractorForVehicles>;
  hierarchicalPositionsPromise: Promise<Array<{ id: string; name: string }>>;
}

export function VehicleAssignmentDataForm({
  form,
  readOnly = false,
  contractorsPromise,
  costCentersPromise,
  hierarchicalPositionsPromise,
}: VehicleAssignmentDataFormProps) {
  const costCenters = use(costCentersPromise);
  const contractorCompanies = use(contractorsPromise);
  const hierarchicalPositions = use(hierarchicalPositionsPromise);
  const allocatedTo = form.watch('allocated_to') || [];

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 [&_button[role=combobox]]:w-full">
        <FormField
          control={form.control}
          name="cost_center_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Centro de costo</FormLabel>
              <Select disabled={readOnly} value={field.value || undefined} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar centro de costo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {costCenters.map((costCenter) => (
                    <SelectItem key={costCenter.id} value={costCenter.id}>
                      {costCenter.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>Selecciona el centro de costo</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="cost_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Tipo de costo <span className="text-red-500">*</span>
              </FormLabel>
              <Select disabled={readOnly} value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo de costo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Directo">Directo</SelectItem>
                  <SelectItem value="Indirecto">Indirecto</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>Selecciona el tipo de costo del equipo</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="sector"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Sector <span className="text-red-500">*</span>
              </FormLabel>
              <Select disabled={readOnly} value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar sector" />
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
              <FormDescription>Selecciona el sector del equipo</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Contractor Assignment Section */}
      <Card>
        <CardHeader>
          <CardTitle>Asignación a Contratistas</CardTitle>
        </CardHeader>
        <CardContent>
          <FormField
            control={form.control}
            name="allocated_to"
            render={() => (
              <FormItem>
                <div className="space-y-4">
                  {readOnly ? (
                    <div>
                      {allocatedTo.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {allocatedTo
                            .filter((contractorId) => contractorCompanies.some((c) => c.id === contractorId))
                            .map((contractorId) => {
                              const contractor = contractorCompanies.find((c) => c.id === contractorId);
                              return (
                                <Badge key={contractorId} variant="secondary">
                                  {contractor?.name}
                                </Badge>
                              );
                            })}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No hay contratistas asignados</p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {contractorCompanies.map((contractor) => (
                        <div key={contractor.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={contractor.id}
                            checked={allocatedTo.includes(contractor.id)}
                            onCheckedChange={(checked) =>
                              handleContractorChange(contractor.id, !allocatedTo.includes(contractor.id))
                            }
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
                  )}
                </div>
                <FormDescription>Selecciona los contratistas a los que se asignará este equipo</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
