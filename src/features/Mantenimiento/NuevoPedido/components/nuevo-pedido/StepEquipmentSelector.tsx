'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { conditionLabels } from '@/shared/utils/mappers';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { ResourceOption } from './types';

export interface StepEquipmentSelectorProps {
  default_equipment_id?: string;
  engineHours: string;
  equipmentOpen: boolean;
  filteredEquipment: ResourceOption[];
  handleSelectEquipment: (equipmentId: string) => void;
  hasOtherEquipmentError: boolean;
  isLoadingOtherEquipment: boolean;
  isOtherEquipment: boolean;
  kilometer: string;
  refetchOtherEquipment: () => void;
  selectedEquipment: ResourceOption | undefined;
  selectedEquipmentId: string;
  setEngineHours: (value: string) => void;
  setEquipmentOpen: (value: boolean) => void;
  setKilometer: (value: string) => void;
  setSearchTerm: (value: string) => void;
  totalMatchingResources: number;
}

/** Paso "Equipo": selector del recurso y carga de kilometraje / horómetro. */
export function StepEquipmentSelector({
  default_equipment_id,
  engineHours,
  equipmentOpen,
  filteredEquipment,
  handleSelectEquipment,
  hasOtherEquipmentError,
  isLoadingOtherEquipment,
  isOtherEquipment,
  kilometer,
  refetchOtherEquipment,
  selectedEquipment,
  selectedEquipmentId,
  setEngineHours,
  setEquipmentOpen,
  setKilometer,
  setSearchTerm,
  totalMatchingResources,
}: StepEquipmentSelectorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label id="resource-select-label">
          {isOtherEquipment ? 'Seleccioná el equipamiento' : 'Seleccioná el equipo'}
        </Label>
        <Popover
          open={equipmentOpen}
          onOpenChange={(open) => {
            setEquipmentOpen(open);
            if (!open) setSearchTerm('');
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={equipmentOpen}
              aria-labelledby="resource-select-label"
              aria-busy={isOtherEquipment && isLoadingOtherEquipment}
              disabled={!!default_equipment_id || (isOtherEquipment && isLoadingOtherEquipment)}
              className={cn('h-12 w-full justify-between text-base', !selectedEquipmentId && 'text-muted-foreground')}
            >
              <span className="truncate">
                {isOtherEquipment && isLoadingOtherEquipment
                  ? 'Cargando equipamientos…'
                  : selectedEquipment
                    ? `${selectedEquipment.label}${selectedEquipment.internNumber ? ` (Nº${selectedEquipment.internNumber})` : ''}`
                    : isOtherEquipment
                      ? 'Seleccioná un equipamiento'
                      : 'Seleccioná un equipo'}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          {/* w-[var(--radix-popover-trigger-width)] hace que el desplegable ocupe el mismo
              ancho que el campo, para que la info del equipo entre a lo largo */}
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            {/* shouldFilter={false}: el filtrado lo hace `filteredEquipment`. Con el
                filtro interno de cmdk activo (que puntúa contra el `value` de cada
                item, o sea solo el dominio) la búsqueda por número interno, tipo o
                subtipo se descartaba y el desplegable decía "No se encontró". */}
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={
                  isOtherEquipment
                    ? 'Buscar por serie, número, tipo o subtipo…'
                    : 'Buscar por dominio, serie, número, tipo o subtipo…'
                }
                onValueChange={setSearchTerm}
              />
              {/* El aviso va ARRIBA del listado y como region estable (ticket 651).
                  Abajo quedaba fuera de vista — el `CommandList` muestra ~6 filas de
                  50, así que el usuario que creia que su equipo no existia nunca lo
                  leia. Se renderiza siempre (vacio cuando no aplica) para que los
                  lectores de pantalla anuncien el cambio. */}
              <p
                role="status"
                aria-live="polite"
                className={cn(
                  'px-3 text-xs text-muted-foreground tabular-nums',
                  totalMatchingResources > filteredEquipment.length ? 'border-b py-2' : 'sr-only'
                )}
              >
                {totalMatchingResources > filteredEquipment.length
                  ? `Mostrando ${filteredEquipment.length} de ${totalMatchingResources} ${
                      isOtherEquipment ? 'equipamientos' : 'equipos'
                    }. Escribí para afinar la búsqueda.`
                  : ''}
              </p>
              <CommandList>
                <CommandEmpty>
                  {isOtherEquipment ? 'No se encontró el equipamiento' : 'No se encontró el equipo'}
                </CommandEmpty>
                <CommandGroup>
                  {filteredEquipment.map((equip) => (
                    <CommandItem
                      className="min-h-12"
                      key={equip.id}
                      value={equip.label}
                      onSelect={() => handleSelectEquipment(equip.id)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          equip.id === selectedEquipmentId ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
                        <span className="shrink-0 font-medium tabular-nums">
                          {equip.label}
                          {equip.internNumber && ` (Nº${equip.internNumber})`}
                        </span>
                        <span className="min-w-0 truncate text-sm text-muted-foreground">
                          {[
                            equip.typeName,
                            equip.subTypeName,
                            equip.unitTypeName,
                            // La condicion viene como valor de enum (`en_preparacion`):
                            // se muestra con su etiqueta legible.
                            equip.condition ? conditionLabels[equip.condition] ?? equip.condition : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* La carga puede fallar: sin esta rama el combobox vacío diría "no se
            encontró", afirmando que no hay equipamientos cuando en realidad no
            se pudieron traer. */}
        {isOtherEquipment && hasOtherEquipmentError && (
          <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
            No se pudieron cargar los equipamientos.
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto min-h-11 p-0 text-sm"
              onClick={() => refetchOtherEquipment()}
            >
              Reintentar
            </Button>
          </p>
        )}
      </div>

      {/* Los equipamientos no llevan kilometraje: solo se mide su horómetro */}
      {selectedEquipment && (
        <div className={cn('grid gap-4', isOtherEquipment ? 'grid-cols-1 sm:max-w-xs' : 'grid-cols-2')}>
          {!isOtherEquipment && (
            <div className="space-y-2">
              <Label htmlFor="kilometer">Kilometraje actual</Label>
              <Input
                id="kilometer"
                type="number"
                inputMode="numeric"
                value={kilometer}
                onChange={(e) => setKilometer(e.target.value)}
                placeholder="0"
                min={Number(selectedEquipment.kilometer) || 0}
                className="h-12 text-base tabular-nums"
              />
              {selectedEquipment.kilometer && (
                <p className="text-sm text-muted-foreground tabular-nums">
                  Último registrado: {selectedEquipment.kilometer} km
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="engineHours">Horómetro</Label>
            <Input
              id="engineHours"
              type="number"
              inputMode="decimal"
              value={engineHours}
              onChange={(e) => setEngineHours(e.target.value)}
              placeholder="0"
              min={Number(selectedEquipment.engineHours) || 0}
              className="h-12 text-base tabular-nums"
            />
            {/* null no es 0: sin lectura previa se dice que no hay, no se inventa un cero */}
            <p className="text-sm text-muted-foreground tabular-nums">
              {selectedEquipment.engineHours
                ? `Último registrado: ${selectedEquipment.engineHours} hs`
                : 'Sin registro previo'}
            </p>
          </div>
        </div>
      )}

      {selectedEquipment && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {isOtherEquipment ? 'Equipamiento seleccionado' : 'Equipo seleccionado'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between gap-4">
              <span className="shrink-0 text-sm text-muted-foreground">Identificación:</span>
              <span className="min-w-0 truncate font-medium">{selectedEquipment.label}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="shrink-0 text-sm text-muted-foreground">Tipo:</span>
              <span className="min-w-0 truncate">
                {[selectedEquipment.typeName, selectedEquipment.subTypeName].filter(Boolean).join(' · ') || '—'}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="shrink-0 text-sm text-muted-foreground">Condición:</span>
              {selectedEquipment.condition ? (
                <Badge variant={selectedEquipment.condition === 'operativo' ? 'success' : 'destructive'}>
                  {conditionLabels[selectedEquipment.condition] ?? selectedEquipment.condition}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">Sin datos</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
