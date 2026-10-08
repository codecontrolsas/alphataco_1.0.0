'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, X } from 'lucide-react';
import { formatQuantity } from '@/features/Warehouses/lib/format';
import { useCallback, useState } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface BrandSizeGroup {
  brandId: string;
  brandName: string;
  sizes: { id: string; name: string }[];
}

interface BrandOption {
  id: string;
  name: string;
}

interface SizeOption {
  id: string;
  name: string;
}

interface ItemBrandSizeManagerProps {
  groups: BrandSizeGroup[];
  /**
   * Material de stock de cada combinacion ya guardada, por `brandId|sizeId` (Almacenes etapa 5).
   * Las combinaciones nuevas no lo tienen hasta guardar.
   */
  materials?: Record<string, { code: string; stock: string }>;
  onAdd: (brandId: string, sizeIds: string[]) => void;
  onRemove: (brandId: string) => void;
  brands: BrandOption[];
  sizes: SizeOption[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ItemBrandSizeManager({ groups, materials = {}, onAdd, onRemove, brands, sizes }: ItemBrandSizeManagerProps) {
  const [showAddRow, setShowAddRow] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [selectedSizeIds, setSelectedSizeIds] = useState<string[]>([]);

  const handleToggleSize = useCallback((sizeId: string, checked: boolean) => {
    setSelectedSizeIds((prev) => (checked ? [...prev, sizeId] : prev.filter((id) => id !== sizeId)));
  }, []);

  const handleAdd = useCallback(() => {
    if (!selectedBrandId || selectedSizeIds.length === 0) return;
    onAdd(selectedBrandId, selectedSizeIds);
    setShowAddRow(false);
    setSelectedBrandId('');
    setSelectedSizeIds([]);
  }, [selectedBrandId, selectedSizeIds, onAdd]);

  const handleCancel = useCallback(() => {
    setShowAddRow(false);
    setSelectedBrandId('');
    setSelectedSizeIds([]);
  }, []);

  // Filter out brands already assigned
  const usedBrandIds = new Set(groups.map((g) => g.brandId));
  const availableBrands = brands.filter((b) => !usedBrandIds.has(b.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Marcas y Talles</Label>
        {!showAddRow && availableBrands.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAddRow(true)}
            className="h-7 gap-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar
          </Button>
        )}
      </div>

      {/* Existing combinations */}
      {groups.length > 0 && (
        <div className="space-y-2">
          {groups.map(({ brandId, brandName, sizes: assignedSizes }) => (
            <div key={brandId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-sm font-medium shrink-0">{brandName}</span>
                <div className="flex flex-wrap gap-1">
                  {assignedSizes.map((size) => {
                    const material = materials[`${brandId}|${size.id}`];
                    return (
                      <Badge
                        key={size.id}
                        variant="secondary"
                        className="text-xs tabular-nums"
                        title={material ? `Material ${material.code} · stock total ${material.stock}` : 'Se crea su material al guardar'}
                      >
                        {size.name}
                        {material && <span className="ml-1 text-muted-foreground">· {formatQuantity(material.stock)}</span>}
                      </Badge>
                    );
                  })}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemove(brandId)}
                className="h-7 w-7 shrink-0 p-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {groups.length > 0 && Object.keys(materials).length > 0 && (
        <p className="text-xs text-muted-foreground">
          Junto a cada talle, el stock total en Almacenes. Cada combinación es un material de stock.
        </p>
      )}

      {groups.length === 0 && !showAddRow && (
        <p className="text-sm text-muted-foreground">Sin combinaciones asignadas.</p>
      )}

      {/* Inline add row */}
      {showAddRow && (
        <div className="rounded-md border border-dashed p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Nueva combinación</span>
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel} className="h-6 w-6 p-0">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Seleccioná una marca..." />
            </SelectTrigger>
            <SelectContent>
              {availableBrands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {sizes.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {sizes.map((size) => (
                <div key={size.id} className="flex items-center gap-1.5">
                  <Checkbox
                    id={`size-add-${size.id}`}
                    checked={selectedSizeIds.includes(size.id)}
                    onCheckedChange={(checked) => handleToggleSize(size.id, checked === true)}
                  />
                  <Label htmlFor={`size-add-${size.id}`} className="cursor-pointer text-sm font-normal">
                    {size.name}
                  </Label>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No hay talles activos disponibles.</p>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleAdd}
              disabled={!selectedBrandId || selectedSizeIds.length === 0}
              className="h-7 text-xs"
            >
              Agregar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
