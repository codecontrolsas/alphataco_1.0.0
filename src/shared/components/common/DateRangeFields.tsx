'use client';

import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Label } from '@/components/ui/label';
import moment from 'moment';

export type DayRange = { from: string; to: string };

const toDate = (value: string) => (value ? moment(value, 'YYYY-MM-DD').toDate() : undefined);
const toText = (date: Date | undefined) => (date ? moment(date).format('YYYY-MM-DD') : '');

/** "Desde" y "Hasta" con escritura directa y calendario; los valores son `YYYY-MM-DD` (vacío = sin límite). */
export function DateRangeFields({ value, onChange }: { value: DayRange; onChange: (range: DayRange) => void }) {
  return (
    <>
      <div className="space-y-1">
        <Label className="text-xs">Desde</Label>
        <EnhancedDatePicker
          date={toDate(value.from)}
          setDate={(d) => onChange({ ...value, from: toText(d) })}
          placeholder="DD/MM/AAAA"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Hasta</Label>
        <EnhancedDatePicker
          date={toDate(value.to)}
          setDate={(d) => onChange({ ...value, to: toText(d) })}
          placeholder="DD/MM/AAAA"
        />
      </div>
    </>
  );
}
