'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCatalogSheetBusy, useCatalogSheetClose } from '@/shared/components/common/CatalogFormSheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import {
  createDashboardPreset,
  getDashboardShareCandidates,
  updateDashboardPresetScope,
} from '../actions/boards.server';
import {
  PRESET_VISIBILITY_LABELS,
  presetFormSchema,
  type BoardActionResult,
  type BoardLayout,
  type PresetFormValues,
} from '../lib/board-layout';

const VISIBILITY_HINTS: Record<PresetFormValues['visibility'], string> = {
  private: 'Lo ves solo vos.',
  company: 'Lo ve todo el que entre al Dashboard de la empresa. Solo vos lo podés cambiar.',
  users: 'Lo ven solo las personas que elijas. Solo vos lo podés cambiar.',
};

/** Preset existente para cambiarle el alcance (solo lo abre el dueño). */
export interface PresetScopeItem {
  id: string;
  name: string;
  visibility: PresetFormValues['visibility'];
  sharedUserIds: string[];
}

interface PresetFormProps {
  /** Sin `preset`: «Guardar como preset» con `layout`. Con `preset`: cambiar el alcance. */
  preset: PresetScopeItem | null;
  /** Personalización a guardar (la del borrador si se está personalizando). */
  layout: BoardLayout;
  onSaved: (id: string) => void;
}

/**
 * Guardar la personalización como preset con nombre y alcance, o cambiar el alcance de uno propio. Los usuarios se
 * eligen entre los de la empresa; al editar se envían altas y bajas explícitas contra lo que ya estaba compartido.
 */
export function PresetForm({ preset, layout, onSaved }: PresetFormProps) {
  const closeSheet = useCatalogSheetClose();
  const setBusy = useCatalogSheetBusy();
  const editing = preset !== null;

  const form = useForm<PresetFormValues>({
    resolver: zodResolver(presetFormSchema),
    defaultValues: {
      name: preset?.name ?? '',
      visibility: preset?.visibility ?? 'private',
      userIds: preset?.sharedUserIds ?? [],
    },
  });
  const visibility = useWatch({ control: form.control, name: 'visibility' });
  const userIds = useWatch({ control: form.control, name: 'userIds' });

  const candidates = useQuery({
    queryKey: ['dashboard-share-candidates'],
    queryFn: async () => {
      const result = await getDashboardShareCandidates();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: visibility === 'users',
    staleTime: 5 * 60 * 1000,
  });

  // Altas y bajas contra lo que ya estaba compartido (solo al editar).
  const baseline = new Set(preset?.sharedUserIds ?? []);
  const added = userIds.filter((id) => !baseline.has(id));
  const removed = [...baseline].filter((id) => !userIds.includes(id));
  const leavingUsers = editing && visibility !== 'users' && baseline.size > 0 && preset?.visibility === 'users';

  const mutation = useMutation({
    // Las dos acciones devuelven datos distintos; el formulario solo necesita el id del preset.
    mutationFn: async (values: PresetFormValues): Promise<BoardActionResult<{ id: string }>> =>
      editing
        ? updateDashboardPresetScope({
            boardId: preset.id,
            visibility: values.visibility,
            addUserIds: values.visibility === 'users' ? added : [],
            removeUserIds: values.visibility === 'users' ? removed : [],
          })
        : createDashboardPreset({ name: values.name, layout, visibility: values.visibility, userIds: values.userIds }),
    onMutate: () => setBusy(true),
    onSuccess: (result, values) => {
      setBusy(false);
      if (!result.ok) {
        form.setError(editing ? 'visibility' : 'name', { message: result.error });
        return;
      }
      const scope =
        values.visibility === 'users'
          ? `compartido con ${values.userIds.length} ${values.userIds.length === 1 ? 'usuario' : 'usuarios'}`
          : PRESET_VISIBILITY_LABELS[values.visibility].toLowerCase();
      toast.success(editing ? `Alcance actualizado: ${scope}` : `Preset «${values.name}» guardado (${scope})`);
      closeSheet();
      onSaved(result.data.id);
    },
    onError: () => {
      setBusy(false);
      toast.error('No se pudo guardar el preset. Intentá nuevamente.');
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="flex flex-col gap-5">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre del preset</FormLabel>
              <FormControl>
                <Input
                  placeholder="Ej.: Vencimientos de la semana"
                  autoComplete="off"
                  maxLength={60}
                  readOnly={editing}
                  aria-readonly={editing}
                  {...field}
                />
              </FormControl>
              {editing ? (
                <FormDescription>Para cambiar el nombre, usá «Renombrar» en el menú del tablero.</FormDescription>
              ) : null}
              {!editing ? (
                <FormDescription>
                  Guarda {layout.length} {layout.length === 1 ? 'widget' : 'widgets'} con su orden y su ancho.
                </FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="visibility"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel>¿Quién lo puede ver?</FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  aria-label="Quién puede ver el preset"
                  className="gap-2"
                >
                  {(Object.keys(PRESET_VISIBILITY_LABELS) as PresetFormValues['visibility'][]).map((value) => (
                    <FormItem key={value} className="flex items-start gap-3 rounded-lg border p-3">
                      <FormControl>
                        <RadioGroupItem value={value} className="mt-0.5" />
                      </FormControl>
                      <div className="space-y-0.5">
                        <FormLabel className="font-medium">{PRESET_VISIBILITY_LABELS[value]}</FormLabel>
                        <p className="text-muted-foreground text-xs">{VISIBILITY_HINTS[value]}</p>
                      </div>
                    </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {visibility === 'users' ? (
          <FormField
            control={form.control}
            name="userIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Usuarios</FormLabel>
                <FormControl>
                  <MultiSelectCombobox
                    options={(candidates.data ?? []).map((user) => ({
                      value: user.id,
                      label: user.email && user.email !== user.name ? `${user.name} (${user.email})` : user.name,
                    }))}
                    placeholder={candidates.isLoading ? 'Cargando usuarios…' : 'Elegir usuarios'}
                    searchPlaceholder="Buscar por nombre o correo"
                    emptyMessage="No hay otros usuarios en la empresa"
                    selectedValues={field.value}
                    onChange={(values) => field.onChange(values.filter(Boolean))}
                    isLoading={candidates.isLoading}
                    aria-label="Usuarios con los que se comparte"
                    disabled={candidates.isLoading || candidates.isError}
                  />
                </FormControl>
                {candidates.isError ? (
                  <p role="alert" className="text-destructive text-sm">
                    No se pudieron cargar los usuarios.{' '}
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => void candidates.refetch()}
                    >
                      Reintentar
                    </Button>
                  </p>
                ) : null}
                {editing && (added.length > 0 || removed.length > 0) ? (
                  <p role="status" className="text-sm tabular-nums">
                    {baseline.size} compartidos hoy. Se agregan {added.length}.{' '}
                    <span className={removed.length > 0 ? 'text-destructive' : undefined}>
                      Se quitan {removed.length}.
                    </span>
                  </p>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        {leavingUsers ? (
          <p role="status" className="text-destructive text-sm">
            Se deja de compartir con {baseline.size} {baseline.size === 1 ? 'usuario' : 'usuarios'}.
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={closeSheet}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={mutation.isPending || form.formState.isSubmitting || (!editing && layout.length === 0)}
          >
            {mutation.isPending ? 'Guardando…' : editing ? 'Guardar alcance' : 'Guardar preset'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
