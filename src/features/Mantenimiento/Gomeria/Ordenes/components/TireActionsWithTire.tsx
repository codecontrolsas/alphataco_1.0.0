'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { CalibrateTab, MissingTab, RepairTab } from './TireBasicActionTabs';
import { ReplaceTab } from './TireReplaceTab';
import { useTirePositionActions, type TirePositionActionsParams } from './useTirePositionActions';

const ACTION_OPTIONS = [
  { value: 'calibrate', label: 'Calibrar' },
  { value: 'repair', label: 'Reparar' },
  { value: 'replace', label: 'Reemplazar' },
  { value: 'missing', label: 'Reportar extravío' },
] as const;

type ActionValue = (typeof ACTION_OPTIONS)[number]['value'];

/** Acciones sobre una posición que ya tiene cubierta: calibrar, reparar, reemplazar o reportar extravío. */
export function TireActionsWithTire(props: TirePositionActionsParams) {
  const actions = useTirePositionActions(props);
  const [action, setAction] = useState<ActionValue>('calibrate');

  return (
    <div className="space-y-2">
      <Select value={action} onValueChange={(value) => setAction(value as ActionValue)}>
        <SelectTrigger aria-label="Acción sobre la cubierta" className="w-full sm:w-60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ACTION_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {action === 'calibrate' && <CalibrateTab actions={actions} />}
      {action === 'repair' && <RepairTab actions={actions} vehicleId={props.vehicleId} />}
      {action === 'replace' && <ReplaceTab actions={actions} vehicleId={props.vehicleId} />}
      {action === 'missing' && <MissingTab actions={actions} />}
    </div>
  );
}
