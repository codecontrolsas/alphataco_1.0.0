'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Logger } from '@/lib/logger';
import { useCatalogSheetBusy, useCatalogSheetClose } from '@/shared/components/common/CatalogFormSheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createMeasureUnit, updateMeasureUnit, type MeasureUnitListItem } from '../../actions/measure-units.server';
import { measureUnitFormSchema, type MeasureUnitFormValues } from '../../schemas/measure-unit';

const logger = new Logger('features/Empresa/Clientes/MensureUnitsForm');

interface MensureUnitsFormProps {
  mode: 'create' | 'edit';
  unit: MeasureUnitListItem | null;
  /** Refresca la tabla (y lo que depende del catálogo) tras guardar. */
  onSaved: () => void;
}

const EMPTY_VALUES: MeasureUnitFormValues = { simbol: '', tipo: '', unit: '' };

// El Sheet monta el form con `key` distinta por registro/alta: arranca limpio sin efectos de sincronización.
function MensureUnitsForm({ mode, unit, onSaved }: MensureUnitsFormProps) {
  const form = useForm<MeasureUnitFormValues>({
    resolver: zodResolver(measureUnitFormSchema),
    defaultValues: mode === 'edit' && unit ? { simbol: unit.simbol, tipo: unit.tipo, unit: unit.unit } : EMPTY_VALUES,
  });
  const closeSheet = useCatalogSheetClose();
  const setBusy = useCatalogSheetBusy();

  async function onSubmit(values: MeasureUnitFormValues) {
    setBusy(true);
    try {
      const result =
        mode === 'edit' && unit ? await updateMeasureUnit(unit.id, values) : await createMeasureUnit(values);

      if (!result.ok) {
        setBusy(false);
        toast.error(result.error);
        return;
      }
      toast.success(
        mode === 'edit' ? 'Unidad de medida actualizada correctamente' : 'Unidad de medida creada correctamente'
      );
      closeSheet();
      onSaved();
    } catch (error) {
      setBusy(false);
      logger.error('Error al guardar la unidad de medida', { data: { error } });
      toast.error('Error al guardar la unidad de medida');
    }
  }

  function handleCancel() {
    closeSheet();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="simbol"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Símbolo</FormLabel>
              <FormControl>
                <Input placeholder="Ej: kg, m, l" {...field} maxLength={5} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tipo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo</FormLabel>
              <FormControl>
                <Input placeholder="Ej: Peso, Longitud, Volumen" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="unit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Unidad</FormLabel>
              <FormControl>
                <Input placeholder="Ej: Kilogramo, Metro, Litro" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {mode === 'create' ? 'Crear' : 'Actualizar'}
          </Button>
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default MensureUnitsForm;
