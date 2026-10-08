'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  createClothingItem,
  getActiveClothingBrands,
  getActiveClothingSizes,
  getItemBrandSizes,
  setItemBrandSizes,
  updateClothingItem,
} from '@/features/Clothing/actions/catalog.server';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import type { ClothingItemListItem } from '../ClothingItemsList/actions.server';
import { ItemBrandSizeManager, type BrandSizeGroup } from './ItemBrandSizeManager';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('ClothingItemForm');

// ============================================================================
// SCHEMA
// ============================================================================

const formSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(150, 'El nombre no puede superar los 150 caracteres'),
  code: z.string().max(50, 'El código no puede superar los 50 caracteres').optional().or(z.literal('')),
  description: z.string().max(500, 'La descripción no puede superar los 500 caracteres').optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

// ============================================================================
// PROPS
// ============================================================================

interface ClothingItemFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ClothingItemListItem | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ClothingItemForm({ open, onOpenChange, item }: ClothingItemFormProps) {
  const queryClient = useQueryClient();
  const isEditing = !!item;

  // ─── Brand-size local state (unified for create and edit) ─────────────────
  const [brandSizeGroups, setBrandSizeGroups] = useState<BrandSizeGroup[]>([]);
  // Ref to avoid stale closure in onSubmit
  const brandSizeGroupsRef = useRef<BrandSizeGroup[]>([]);
  brandSizeGroupsRef.current = brandSizeGroups;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', code: '', description: '' },
  });

  // ─── Fetch catalogs ───────────────────────────────────────────────────────
  const { data: activeBrands, isLoading: isLoadingBrands } = useQuery({
    queryKey: ['active-clothing-brands'],
    queryFn: () => getActiveClothingBrands(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: activeSizes, isLoading: isLoadingSizes } = useQuery({
    queryKey: ['active-clothing-sizes'],
    queryFn: () => getActiveClothingSizes(),
    staleTime: 5 * 60 * 1000,
  });

  // ─── Fetch existing combinations (edit mode only) ─────────────────────────
  const { data: existingEntries, isLoading: isLoadingEntries } = useQuery({
    queryKey: ['item-brand-sizes', item?.id],
    queryFn: () => getItemBrandSizes(item!.id),
    // Es la base contra la que se calculan altas y bajas: se lee fresca al abrir.
    staleTime: 0,
    enabled: !!item?.id && open,
  });

  // ─── Sync form + brand-size state when dialog opens ───────────────────────
  useEffect(() => {
    if (!open) return;

    if (item) {
      form.reset({ name: item.name, code: item.code ?? '', description: item.description ?? '' });
    } else {
      form.reset({ name: '', code: '', description: '' });
      setBrandSizeGroups([]);
    }
  }, [open, item, form]);

  // Sync brand-size groups from server data when it loads (edit mode)
  useEffect(() => {
    if (!existingEntries || !activeBrands || !activeSizes) return;

    const map = new Map<string, { brandName: string; sizes: { id: string; name: string }[] }>();
    for (const entry of existingEntries) {
      const brandId = entry.clothing_brand_id;
      if (!map.has(brandId)) {
        const brand = activeBrands.find((b) => b.id === brandId);
        map.set(brandId, { brandName: brand?.name ?? brandId, sizes: [] });
      }
      const size = activeSizes.find((s) => s.id === entry.clothing_size_id);
      map.get(brandId)!.sizes.push({ id: entry.clothing_size_id, name: size?.name ?? entry.clothing_size_id });
    }

    setBrandSizeGroups(
      Array.from(map.entries()).map(([brandId, { brandName, sizes }]) => ({ brandId, brandName, sizes }))
    );
  }, [existingEntries, activeBrands, activeSizes]);

  // ─── Brand-size handlers ──────────────────────────────────────────────────
  const handleAddBrandSize = useCallback(
    (brandId: string, sizeIds: string[]) => {
      const brand = activeBrands?.find((b) => b.id === brandId);
      const sizes = sizeIds
        .map((sId) => {
          const s = activeSizes?.find((sz) => sz.id === sId);
          return s ? { id: s.id, name: s.name } : null;
        })
        .filter(Boolean) as { id: string; name: string }[];

      setBrandSizeGroups((prev) => {
        const withoutBrand = prev.filter((g) => g.brandId !== brandId);
        return [...withoutBrand, { brandId, brandName: brand?.name ?? brandId, sizes }];
      });
    },
    [activeBrands, activeSizes]
  );

  const handleRemoveBrandSize = useCallback((brandId: string) => {
    setBrandSizeGroups((prev) => prev.filter((g) => g.brandId !== brandId));
  }, []);

  // ─── Close handler ────────────────────────────────────────────────────────
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      form.reset({ name: '', code: '', description: '' });
      setBrandSizeGroups([]);
    }
    onOpenChange(nextOpen);
  };

  // ─── Single submit: saves everything ──────────────────────────────────────
  async function onSubmit(values: FormValues) {
    logger.debug(isEditing ? 'Updating clothing item' : 'Creating clothing item', {
      data: { name: values.name, id: item?.id },
    });

    try {
      const payload = {
        name: values.name,
        code: values.code || undefined,
        description: values.description || undefined,
      };

      const currentGroups = brandSizeGroupsRef.current;
      const combinations = currentGroups.flatMap((g) => g.sizes.map((s) => ({ brandId: g.brandId, sizeId: s.id })));
      // Altas y bajas explicitas contra la matriz leida del servidor al abrir (nunca "lo que no
      // vino se borra"): cada combinacion tiene su material de stock (Almacenes etapa 5).
      const key = (p: { brandId: string; sizeId: string }) => `${p.brandId}|${p.sizeId}`;
      const baseline = (existingEntries ?? []).map((e) => ({ brandId: e.clothing_brand_id, sizeId: e.clothing_size_id }));
      const baselineKeys = new Set(baseline.map(key));
      const currentKeys = new Set(combinations.map(key));
      const changes = {
        add: combinations.filter((c) => !baselineKeys.has(key(c))),
        remove: baseline.filter((b) => !currentKeys.has(key(b))),
      };

      logger.debug('Submitting with combinations', {
        data: { add: changes.add.length, remove: changes.remove.length, groups: currentGroups.length },
      });

      if (isEditing && item) {
        await updateClothingItem(item.id, payload);
        if (changes.add.length > 0 || changes.remove.length > 0) await setItemBrandSizes(item.id, changes);
        toast.success('Artículo actualizado exitosamente');
      } else {
        const created = await createClothingItem(payload);
        if (combinations.length > 0) {
          await setItemBrandSizes(created.id, { add: combinations, remove: [] });
        }
        toast.success('Artículo creado exitosamente');
      }

      await queryClient.invalidateQueries({ queryKey: ['clothing-items'] });
      if (item?.id) {
        await queryClient.invalidateQueries({ queryKey: ['item-brand-sizes', item.id] });
      }
      handleOpenChange(false);
    } catch (error) {
      logger.error('Error saving clothing item', { data: { error } });
      const message =
        error instanceof Error && error.message.includes('Unique')
          ? 'Ya existe un artículo con ese nombre'
          : 'Error al guardar el artículo. Por favor, intente de nuevo.';
      toast.error(message);
    }
  }

  const isLoadingCatalogs = isLoadingBrands || isLoadingSizes || (isEditing && isLoadingEntries);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar artículo' : 'Nuevo artículo'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Modificá los datos del artículo de indumentaria.'
              : 'Ingresá los datos del nuevo artículo de indumentaria.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Camisa manga larga, Botas de seguridad..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Código <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: CAM-ML-001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Descripción <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descripción adicional del artículo..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* Brand-size section — integrated into the same form */}
            {isLoadingCatalogs ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            ) : (
              <ItemBrandSizeManager
                groups={brandSizeGroups}
                materials={Object.fromEntries(
                  (existingEntries ?? []).flatMap((e) =>
                    e.material ? [[`${e.clothing_brand_id}|${e.clothing_size_id}`, e.material] as const] : []
                  )
                )}
                onAdd={handleAddBrandSize}
                onRemove={handleRemoveBrandSize}
                brands={activeBrands ?? []}
                sizes={activeSizes ?? []}
              />
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              {/* Sin la matriz cargada no hay base para calcular altas y bajas: no se guarda. */}
              <Button type="submit" disabled={form.formState.isSubmitting || isLoadingCatalogs}>
                {form.formState.isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear artículo'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
