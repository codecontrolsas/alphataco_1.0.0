'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileDown, Filter, Loader2, Search, X } from 'lucide-react';
import moment from 'moment';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { DiagramFilterCatalog } from '../../actions/diagram-search-actions';
import { DateRangePresetPicker, type PickerDateRange } from '../../components/DateRangePresetPicker';
import {
  MAX_RANGE_DAYS,
  countRangeDays,
  type ArrayFilterKey,
  type DiagramCalendarFilters,
} from '../utils/calendar-filters';
import { ActiveFilterChips } from './ActiveFilterChips';

const SEARCH_DEBOUNCE_MS = 300;
const DATE_FORMAT = 'YYYY-MM-DD';
const RANGE_PRESETS = [
  { label: '7 días', days: 7 },
  { label: '14 días', days: 14 },
  { label: '30 días', days: 30 },
  { label: '60 días', days: 60 },
  { label: '90 días', days: 90 },
];

interface CalendarToolbarProps {
  filters: DiagramCalendarFilters;
  activeListCount: number;
  hasActiveFilters: boolean;
  catalog: DiagramFilterCatalog | undefined;
  onSearchChange: (search: string) => void;
  onRangeChange: (from: string, to: string) => void;
  onRemoveValue: (key: ArrayFilterKey, id: string) => void;
  onClearAll: () => void;
  onOpenFilters: () => void;
  onExport: () => void;
  isExporting: boolean;
  canExport: boolean;
  /** Texto del botón de exportación (aclara cuántos empleados lleva el archivo cuando no están todos cargados). */
  exportLabel: string;
  /** Cambia cuando el padre limpia los filtros (por ejemplo desde el panel): el texto del buscador se vacía. */
  clearToken: number;
}

/** Barra del calendario: buscador, rango de fechas, filtros y exportación, más los chips de filtros activos. */
export function CalendarToolbar({
  filters,
  activeListCount,
  hasActiveFilters,
  catalog,
  onSearchChange,
  onRangeChange,
  onRemoveValue,
  onClearAll,
  onOpenFilters,
  onExport,
  isExporting,
  canExport,
  exportLabel,
  clearToken,
}: CalendarToolbarProps) {
  // El texto que se está escribiendo vive acá; recién pasados 300 ms sin teclear se aplica como filtro.
  const [draft, setDraft] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [seenClearToken, setSeenClearToken] = useState(clearToken);
  if (clearToken !== seenClearToken) {
    // Ajuste de estado durante el render (no hace falta un efecto): el padre limpió los filtros por otro camino.
    setSeenClearToken(clearToken);
    setDraft('');
  }

  // Al desmontar no debe quedar un timer pendiente escribiendo la URL de otra pantalla.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const applySearch = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    setDraft(value);
    onSearchChange(value.trim());
  };

  const handleSearchInput = (value: string) => {
    setDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      onSearchChange(value.trim());
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleClearAll = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    setDraft('');
    onClearAll();
  };

  const pickerValue = useMemo<PickerDateRange>(
    () => ({ from: moment(filters.from, DATE_FORMAT).toDate(), to: moment(filters.to, DATE_FORMAT).toDate() }),
    [filters.from, filters.to]
  );

  const handleRange = (range: PickerDateRange) => {
    const from = moment(range.from).format(DATE_FORMAT);
    const to = moment(range.to).format(DATE_FORMAT);
    if (countRangeDays(from, to) > MAX_RANGE_DAYS) {
      toast.info(`El máximo es de ${MAX_RANGE_DAYS} días: se ajustó la fecha final.`);
    }
    onRangeChange(from, to);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="relative min-w-0 flex-1 basis-60 sm:max-w-sm">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            value={draft}
            onChange={(event) => handleSearchInput(event.target.value)}
            placeholder="Buscar por nombre, apellido o legajo..."
            aria-label="Buscar por nombre, apellido o legajo"
            maxLength={100}
            className="pr-9 pl-8 [&::-webkit-search-cancel-button]:hidden"
          />
          {draft && (
            <button
              type="button"
              onClick={() => applySearch('')}
              aria-label="Borrar búsqueda"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 outline-none focus-visible:ring-2"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>

        <DateRangePresetPicker
          value={pickerValue}
          onChange={handleRange}
          presets={RANGE_PRESETS}
          maxDays={MAX_RANGE_DAYS}
        />

        <Button type="button" variant="outline" onClick={onOpenFilters}>
          <Filter aria-hidden="true" className="size-4" />
          Filtros
          {activeListCount > 0 && (
            <Badge variant="secondary" aria-label={`${activeListCount} filtros activos`}>
              {activeListCount}
            </Badge>
          )}
        </Button>

        {hasActiveFilters && (
          <Button type="button" variant="ghost" onClick={handleClearAll}>
            Limpiar todo
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          className="sm:ml-auto"
          onClick={onExport}
          disabled={!canExport || isExporting}
        >
          {isExporting ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <FileDown aria-hidden="true" className="size-4" />
          )}
          {exportLabel}
        </Button>
      </div>

      <ActiveFilterChips
        filters={filters}
        catalog={catalog}
        onRemoveSearch={() => applySearch('')}
        onRemoveValue={onRemoveValue}
      />
    </div>
  );
}
