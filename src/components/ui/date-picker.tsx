'use client';

import { CalendarDays } from 'lucide-react';
import moment from 'moment';
import dynamic from 'next/dynamic';
import * as React from 'react';
import type { Matcher } from 'react-day-picker';
import { Drawer as DrawerPrimitive } from 'vaul';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { MonthGrid } from '@/components/ui/date-picker-month-grid';
import {
  buildRevertMessage,
  caretAfterDigits,
  countDigits,
  evaluateText,
  formatDate,
  getUnavailableReason,
  maskText,
  PLACEHOLDER,
  resolveBounds,
  sameUnit,
  UNIT,
  type DatePickerGranularity,
} from '@/components/ui/date-picker-text';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useResponsiveDialogSurface } from '@/components/ui/responsive-dialog-context';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '@/shared/hooks/use-media-query';

const logger = new Logger('components/ui/date-picker');

export type { DatePickerGranularity };

export type DatePickerProps = {
  /** Fecha elegida (medianoche local; en `month`, el día 1). `null` = vacío. */
  value: Date | null;
  /** Se emite solo con una fecha válida y dentro de rango, o con `null` cuando se borra el texto. */
  onChange: (value: Date | null) => void;
  /** `month` = MM/AAAA con un grid de 12 meses en vez del calendario. */
  granularity?: DatePickerGranularity;
  /** Inclusive. */
  min?: Date;
  /** Inclusive. */
  max?: Date;
  /** Reglas cruzadas (fin ≥ inicio, etc.). En `month` se evalúa sobre el día 1. */
  isDateDisabled?: (date: Date) => boolean;
  /** Activa los desplegables de mes y año del calendario (reemplaza `fromYear`/`toYear`). */
  yearRange?: { from: number; to: number };
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  id?: string;
  name?: string;
  onBlur?: () => void;
  className?: string;
  ref?: React.Ref<HTMLInputElement>;
  'aria-label'?: string;
  /** Los inyecta `FormControl`. */
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  /**
   * Cambiarlo descarta lo escrito a medias y el aviso, y vuelve a mostrar `value`. Lo usa `FormDatePicker` para
   * enterarse de un `form.reset()` que deja el mismo valor (sin cambio de `value` no hay otra señal).
   */
  resetKey?: number;
};

const loadCalendar = () => import('@/components/ui/calendar');
// El input no depende de react-day-picker: el calendario se baja al abrir (o al pasar por el botón).
const LazyCalendar = dynamic(() => loadCalendar().then((mod) => mod.Calendar), {
  ssr: false,
  loading: () => <div aria-busy="true" className="h-[18.5rem] w-[15.75rem] pointer-coarse:w-[21rem]" />,
});

/**
 * Campo de fecha con escritura directa (`DD/MM/AAAA` o `MM/AAAA`) y calendario. En mobile el calendario
 * sale en un drawer (anidado si el campo ya vive dentro de un `ResponsiveDialog` en drawer).
 * Para formularios usar `FormDatePicker`, que adapta el valor al tipo que guarda cada form.
 */
export function DatePicker({
  value,
  onChange,
  granularity = 'day',
  min,
  max,
  isDateDisabled,
  yearRange,
  disabled,
  required,
  placeholder,
  id,
  name,
  onBlur,
  className,
  ref,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  resetKey = 0,
}: DatePickerProps) {
  const statusId = React.useId();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const focusInputOnCloseRef = React.useRef(false);
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const surface = useResponsiveDialogSurface();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(() => formatDate(value, granularity));
  const [message, setMessage] = React.useState<string | null>(null);

  // El valor del padre manda: si cambia desde afuera, o llega un reset que deja el mismo valor (`resetKey`), el
  // texto se resincroniza en render, sin `key` ni efecto (`rerender-derived-state-no-effect`).
  const valueKey = value ? value.getTime() : null;
  const [syncedKey, setSyncedKey] = React.useState(valueKey);
  const [syncedResetKey, setSyncedResetKey] = React.useState(resetKey);
  if (valueKey !== syncedKey || resetKey !== syncedResetKey) {
    setSyncedKey(valueKey);
    setSyncedResetKey(resetKey);
    setText(formatDate(value, granularity));
    setMessage(null);
  }

  const bounds = resolveBounds(min, max);
  const warnIfConflict = () => {
    if (bounds.conflict) logger.warn('min es posterior a max: se ignoran los dos límites', { data: { min, max } });
  };

  const setInputRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );

  const emit = (date: Date | null) => {
    if (!sameUnit(date, value, granularity)) onChange(date);
  };

  /** Aplica la máscara, conserva el cursor y emite si lo escrito ya es una fecha válida. */
  const applyText = (input: HTMLInputElement, raw: string, caretDigits: number) => {
    const next = maskText(raw, granularity);
    // Se escribe en el DOM antes del render: React no vuelve a tocar el valor y el cursor no salta al final.
    input.value = next;
    const caret = caretAfterDigits(next, caretDigits);
    input.setSelectionRange(caret, caret);
    setText(next);

    const evaluation = evaluateText(next, granularity, bounds, isDateDisabled);
    if (evaluation.kind === 'empty' || evaluation.kind === 'valid') {
      setMessage(null);
      emit(evaluation.kind === 'valid' ? evaluation.date : null);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const caret = input.selectionStart ?? input.value.length;
    applyText(input, input.value, countDigits(input.value.slice(0, caret)));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const caret = input.selectionStart ?? 0;
    // Backspace sobre una barra borra el dígito anterior (si no, la máscara la vuelve a poner).
    if (event.key === 'Backspace' && caret === input.selectionEnd && text[caret - 1] === '/') {
      event.preventDefault();
      applyText(input, text.slice(0, caret - 2) + text.slice(caret), countDigits(text.slice(0, caret - 2)));
    }
    // Enter con texto pendiente (a medias, inválido o fuera de rango) solo resuelve el campo: confirma o revierte,
    // y no envía el form, que si no saldría con el valor anterior mientras la pantalla muestra otro. Sin texto
    // pendiente, Enter hace lo de siempre (envío implícito del form).
    if (event.key === 'Enter' && text !== formatDate(value, granularity)) {
      event.preventDefault();
      commitText();
    }
  };

  const commitText = () => {
    const evaluation = evaluateText(text, granularity, bounds, isDateDisabled);
    if (evaluation.kind === 'empty') return;
    if (evaluation.kind === 'valid') {
      setText(formatDate(evaluation.date, granularity));
      setMessage(null);
      emit(evaluation.date);
      return;
    }
    warnIfConflict();
    setText(formatDate(value, granularity));
    setMessage(buildRevertMessage(evaluation, text, value, granularity));
  };

  const handleBlur = () => {
    commitText();
    onBlur?.();
  };

  const handleOpenChange = (next: boolean) => {
    if (next) warnIfConflict();
    setOpen(next);
  };

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      const normalized = moment(date).startOf(UNIT[granularity]).toDate();
      setText(formatDate(normalized, granularity));
      setMessage(null);
      emit(normalized);
      // En desktop el foco vuelve al input para seguir con Tab; en mobile no, para no abrir el teclado.
      focusInputOnCloseRef.current = !isMobile;
    }
    setOpen(false);
  };

  const preloadCalendar = () => {
    if (granularity === 'day') void loadCalendar();
  };

  const isUnavailable = (date: Date) => getUnavailableReason(date, granularity, bounds, isDateDisabled) !== null;
  const initialMonth = value ?? bounds.min ?? new Date();
  const disabledMatchers: Matcher[] = [
    ...(bounds.min ? [{ before: bounds.min }] : []),
    ...(bounds.max ? [{ after: bounds.max }] : []),
    ...(isDateDisabled ? [isDateDisabled] : []),
  ];

  const panel =
    granularity === 'day' ? (
      <LazyCalendar
        mode="single"
        selected={value ?? undefined}
        defaultMonth={initialMonth}
        onSelect={handleSelect}
        autoFocus
        captionLayout={yearRange ? 'dropdown' : 'label'}
        startMonth={yearRange ? new Date(yearRange.from, 0) : undefined}
        endMonth={yearRange ? new Date(yearRange.to, 11) : undefined}
        disabled={disabledMatchers}
      />
    ) : (
      <MonthGrid
        value={value}
        initialYear={initialMonth.getFullYear()}
        yearRange={yearRange}
        isMonthDisabled={isUnavailable}
        onSelect={handleSelect}
      />
    );

  const panelTitle = granularity === 'day' ? 'Elegir fecha' : 'Elegir mes';
  const DrawerRoot = surface === 'drawer' ? DrawerPrimitive.NestedRoot : Drawer;

  return (
    <div className={cn('flex w-full min-w-0 flex-col', className)}>
      <Popover open={open && !isMobile} onOpenChange={handleOpenChange}>
        <PopoverAnchor asChild>
          <div
            data-slot="date-picker"
            className={cn(
              'border-input bg-card dark:bg-background flex h-8 w-full min-w-0 items-stretch border pointer-coarse:h-11',
              'hover:border-fg-subtle transition-[border-color] duration-(--duration-fast)',
              'has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2',
              // Error (DISENO principio 6): borde danger y barra de 2px a la izquierda.
              'has-[input[aria-invalid=true]]:border-danger has-[input[aria-invalid=true]]:shadow-[inset_2px_0_0_var(--danger)]',
              'has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50'
            )}
          >
            <Input
              ref={setInputRef}
              id={id}
              name={name}
              type="text"
              value={text}
              placeholder={placeholder ?? PLACEHOLDER[granularity]}
              disabled={disabled}
              required={required}
              aria-label={ariaLabel}
              aria-invalid={ariaInvalid}
              aria-describedby={ariaDescribedBy ? `${ariaDescribedBy} ${statusId}` : statusId}
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="done"
              spellCheck={false}
              maxLength={granularity === 'day' ? 10 : 7}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              className="h-full flex-1 border-0 bg-transparent font-mono tabular-nums hover:border-0 focus-visible:outline-none disabled:opacity-100 dark:bg-transparent"
            />
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={granularity === 'day' ? 'Abrir calendario' : 'Abrir selector de mes'}
                aria-haspopup="dialog"
                aria-expanded={open}
                disabled={disabled}
                onPointerEnter={preloadCalendar}
                onFocus={preloadCalendar}
                className="text-muted-foreground h-full w-8 pointer-coarse:w-11"
              >
                <CalendarDays />
              </Button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>
        {isMobile ? null : (
          <PopoverContent
            align="end"
            className="w-auto p-0"
            onCloseAutoFocus={(event) => {
              if (!focusInputOnCloseRef.current) return;
              focusInputOnCloseRef.current = false;
              event.preventDefault();
              inputRef.current?.focus();
            }}
          >
            {panel}
          </PopoverContent>
        )}
      </Popover>
      {isMobile ? (
        <DrawerRoot open={open} onOpenChange={handleOpenChange}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{panelTitle}</DrawerTitle>
              <DrawerDescription className="sr-only">
                {granularity === 'day' ? 'Tocá un día para elegirlo.' : 'Tocá un mes para elegirlo.'}
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex justify-center overflow-y-auto px-4">{panel}</div>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button type="button" variant="secondary">
                  Cerrar
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </DrawerRoot>
      ) : null}
      {/* Siempre montado: una región `status` que se monta recién al avisar no se anuncia. */}
      <p id={statusId} role="status" className={message ? 'text-warning-text text-caption mt-1' : 'sr-only'}>
        {message}
      </p>
    </div>
  );
}
