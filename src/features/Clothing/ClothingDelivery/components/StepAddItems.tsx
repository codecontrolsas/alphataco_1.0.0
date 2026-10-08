'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  getBrandsForItem,
  getItemsForDelivery,
  getSizesForItemBrand,
  type DeliveryWarehouse,
} from '@/features/Clothing/ClothingDelivery/actions/queries.server';
import { formatQuantity } from '@/features/Warehouses/lib/format';
import { Logger } from '@/lib/logger';
import { useQuery } from '@tanstack/react-query';
import { Package, Plus, Trash2 } from 'lucide-react';
import { useCallback, useId, useState } from 'react';

const logger = new Logger('Clothing/StepAddItems');

export type WizardItem = {
  clothingItemId: string;
  itemName: string;
  clothingBrandId?: string;
  brandName?: string;
  clothingSizeId?: string;
  sizeName?: string;
  quantity: number;
  hasCertificate: boolean;
};

interface ItemRowProps {
  index: number;
  item: WizardItem;
  companyId: string;
  onUpdate: (index: number, updated: Partial<WizardItem>) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
  warehouseId: string | null;
}

function ItemRow({ index, item, companyId, onUpdate, onRemove, canRemove, warehouseId }: ItemRowProps) {
  const idPrefix = useId();

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ['clothing-items-for-delivery', companyId],
    queryFn: () => getItemsForDelivery(),
    staleTime: 60_000,
  });

  const { data: brands = [], isLoading: loadingBrands } = useQuery({
    queryKey: ['clothing-brands-for-item', item.clothingItemId],
    queryFn: () => getBrandsForItem(item.clothingItemId),
    staleTime: 60_000,
    enabled: !!item.clothingItemId,
  });

  const { data: sizes = [], isLoading: loadingSizes } = useQuery({
    // Con el deposito en la clave: cambiar de deposito trae el disponible de ese deposito.
    queryKey: ['clothing-sizes-for-item-brand', item.clothingItemId, item.clothingBrandId, warehouseId],
    queryFn: () => getSizesForItemBrand(item.clothingItemId, item.clothingBrandId!, warehouseId),
    staleTime: 15_000,
    enabled: !!item.clothingItemId && !!item.clothingBrandId,
  });

  const handleItemChange = useCallback(
    (itemId: string) => {
      const selected = items.find((i) => i.id === itemId);
      logger.debug('Item selected in row', { data: { index, itemId } });
      onUpdate(index, {
        clothingItemId: itemId,
        itemName: selected?.name ?? '',
        clothingBrandId: undefined,
        brandName: undefined,
        clothingSizeId: undefined,
        sizeName: undefined,
      });
    },
    [index, items, onUpdate]
  );

  const handleBrandChange = useCallback(
    (brandId: string) => {
      const selected = brands.find((b) => b?.id === brandId);
      logger.debug('Brand selected in row', { data: { index, brandId } });
      onUpdate(index, {
        clothingBrandId: brandId,
        brandName: selected?.name ?? '',
        clothingSizeId: undefined,
        sizeName: undefined,
      });
    },
    [index, brands, onUpdate]
  );

  const handleSizeChange = useCallback(
    (sizeId: string) => {
      const selected = sizes.find((s) => s?.id === sizeId);
      logger.debug('Size selected in row', { data: { index, sizeId } });
      onUpdate(index, {
        clothingSizeId: sizeId,
        sizeName: selected?.name ?? '',
      });
    },
    [index, sizes, onUpdate]
  );

  const selectedSize = sizes.find((s) => s?.id === item.clothingSizeId) ?? null;

  // Draft string mientras el input tiene foco — permite estado vacio durante edicion.
  // Cuando no esta enfocado, displayQuantity refleja item.quantity (siempre sincronizado al padre).
  const [quantityDraft, setQuantityDraft] = useState<string | null>(null);
  const displayQuantity = quantityDraft ?? String(item.quantity);

  const handleQuantityFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setQuantityDraft(String(item.quantity));
      e.target.select();
    },
    [item.quantity]
  );

  const handleQuantityChange = useCallback(
    (val: string) => {
      setQuantityDraft(val);
      if (val === '') return;
      const num = parseInt(val, 10);
      if (!isNaN(num) && num >= 1) {
        onUpdate(index, { quantity: num });
      }
    },
    [index, onUpdate]
  );

  const handleQuantityBlur = useCallback(() => {
    const num = parseInt(quantityDraft ?? '', 10);
    if (isNaN(num) || num < 1) {
      onUpdate(index, { quantity: 1 });
    }
    setQuantityDraft(null);
  }, [quantityDraft, index, onUpdate]);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <Package className="h-4 w-4" />
          Artículo {index + 1}
        </span>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemove(index)}
            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Row 1: Artículo | Cantidad */}
      <div className="grid gap-3 grid-cols-2">
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor={`${idPrefix}-item`} className="text-xs">
            Artículo <span className="text-destructive">*</span>
          </Label>
          <Select value={item.clothingItemId || undefined} onValueChange={handleItemChange}>
            <SelectTrigger id={`${idPrefix}-item`} className="h-9 w-full">
              <SelectValue placeholder={loadingItems ? 'Cargando...' : 'Seleccionar artículo'} />
            </SelectTrigger>
            <SelectContent>
              {items.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.code ? `[${i.code}] ${i.name}` : i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-qty`} className="text-xs">
            Cantidad <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${idPrefix}-qty`}
            type="number"
            min={1}
            value={displayQuantity}
            onChange={(e) => handleQuantityChange(e.target.value)}
            onFocus={handleQuantityFocus}
            onBlur={handleQuantityBlur}
            className="h-9"
          />
        </div>
      </div>

      {/* Row 2: Marca | Talle */}
      <div className="grid gap-3 grid-cols-2">
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor={`${idPrefix}-brand`} className="text-xs">
            Marca
          </Label>
          <Select
            value={item.clothingBrandId || undefined}
            onValueChange={handleBrandChange}
            disabled={!item.clothingItemId || loadingBrands}
          >
            <SelectTrigger id={`${idPrefix}-brand`} className="h-9 w-full">
              <SelectValue
                placeholder={
                  !item.clothingItemId
                    ? 'Seleccione artículo'
                    : loadingBrands
                      ? 'Cargando...'
                      : brands.length === 0
                        ? 'Sin marcas'
                        : 'Seleccionar marca'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) =>
                b ? (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ) : null
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 min-w-0">
          <Label htmlFor={`${idPrefix}-size`} className="text-xs">
            Talle
          </Label>
          <Select
            value={item.clothingSizeId || undefined}
            onValueChange={handleSizeChange}
            disabled={!item.clothingBrandId || loadingSizes}
          >
            <SelectTrigger id={`${idPrefix}-size`} className="h-9 w-full">
              <SelectValue
                placeholder={
                  !item.clothingBrandId
                    ? 'Seleccione marca'
                    : loadingSizes
                      ? 'Cargando...'
                      : sizes.length === 0
                        ? 'Sin talles'
                        : 'Seleccionar talle'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {/* Un talle sin stock se puede elegir: el servidor rechaza la entrega con el detalle. */}
              {sizes.map((s) =>
                s ? (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="tabular-nums">
                      {s.name}
                      {s.available !== null && (Number(s.available) > 0 ? ` · ${formatQuantity(s.available)} disp.` : ' · Sin stock')}
                    </span>
                  </SelectItem>
                ) : null
              )}
            </SelectContent>
          </Select>
          {selectedSize?.available != null && (
            <p className={`text-xs tabular-nums ${Number(selectedSize.available) < item.quantity ? 'text-destructive' : 'text-muted-foreground'}`}>
              Disponible: {formatQuantity(selectedSize.available)}
            </p>
          )}
        </div>
      </div>

      {/* Row 3: Posee certificado */}
      <div className="flex items-center gap-2 pt-1">
        <Checkbox
          id={`${idPrefix}-certificate`}
          checked={item.hasCertificate}
          onCheckedChange={(checked) => onUpdate(index, { hasCertificate: checked === true })}
        />
        <Label htmlFor={`${idPrefix}-certificate`} className="text-xs cursor-pointer">
          Posee certificado
        </Label>
      </div>
    </div>
  );
}

interface StepAddItemsProps {
  companyId: string;
  items: WizardItem[];
  onChange: (items: WizardItem[]) => void;
  /** Deposito del que sale la entrega (Almacenes etapa 5). */
  warehouses: DeliveryWarehouse[];
  loadingWarehouses: boolean;
  warehouseId: string | null;
  onWarehouseChange: (warehouseId: string) => void;
}

const emptyItem = (): WizardItem => ({
  clothingItemId: '',
  itemName: '',
  clothingBrandId: undefined,
  brandName: undefined,
  clothingSizeId: undefined,
  sizeName: undefined,
  quantity: 1,
  hasCertificate: false,
});

export function StepAddItems({
  companyId,
  items,
  onChange,
  warehouses,
  loadingWarehouses,
  warehouseId,
  onWarehouseChange,
}: StepAddItemsProps) {
  const handleAdd = useCallback(() => {
    onChange([...items, emptyItem()]);
  }, [items, onChange]);

  const handleUpdate = useCallback(
    (index: number, updated: Partial<WizardItem>) => {
      const next = items.map((item, i) => (i === index ? { ...item, ...updated } : item));
      onChange(next);
    },
    [items, onChange]
  );

  const handleRemove = useCallback(
    (index: number) => {
      onChange(items.filter((_, i) => i !== index));
    },
    [items, onChange]
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-1.5 text-foreground">Artículos a entregar</p>
        <p className="text-sm text-muted-foreground mb-3">
          Agregue todos los artículos de la entrega, con marca y talle. Debe haber al menos uno.
        </p>
      </div>

      <div className="space-y-1.5 max-w-sm">
        <Label htmlFor="clothing-delivery-warehouse" className="text-xs">
          Depósito
        </Label>
        <Select value={warehouseId ?? undefined} onValueChange={onWarehouseChange} disabled={loadingWarehouses}>
          <SelectTrigger id="clothing-delivery-warehouse" className="h-9 w-full">
            <SelectValue
              placeholder={
                loadingWarehouses ? 'Cargando...' : warehouses.length === 0 ? 'No hay depósitos activos' : 'Elegí el depósito'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name} ({w.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <ItemRow
            key={index}
            index={index}
            item={item}
            companyId={companyId}
            onUpdate={handleUpdate}
            onRemove={handleRemove}
            canRemove={items.length > 1}
            warehouseId={warehouseId}
          />
        ))}
      </div>

      <Button type="button" variant="outline" onClick={handleAdd} className="w-full gap-2 border-dashed">
        <Plus className="h-4 w-4" />
        Agregar artículo
      </Button>
    </div>
  );
}
