'use client';

import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Label } from '@/components/ui/label';
import moment from 'moment';
import { useId } from 'react';

export type DayRange = { from: string; to: string };

const toDate = (value: string) => (value ? moment(value, 'YYYY-MM-DD').toDate() : undefined);
const toText = (date: Date | undefined) => (date ? moment(date).format('YYYY-MM-DD') : '');

/** "Desde" y "Hasta" con escritura directa y calendario; los valores son `YYYY-MM-DD` (vacío = sin límite). */
export function DateRangeFields({ value, onChange }: { value: DayRange; onChange: (range: DayRange) => void }) {
  const fromId = useId();
  const toId = useId();
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={fromId} className="text-xs">
          Desde
        </Label>
        <EnhancedDatePicker
          id={fromId}
          date={toDate(value.from)}
          setDate={(d) => onChange({ ...value, from: toText(d) })}
          placeholder="DD/MM/AAAA"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={toId} className="text-xs">
          Hasta
        </Label>
        <EnhancedDatePicker
          id={toId}
          date={toDate(value.to)}
          setDate={(d) => onChange({ ...value, to: toText(d) })}
          placeholder="DD/MM/AAAA"
        />
      </div>
    </>
  );
}
