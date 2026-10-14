'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalibrateTab, MissingTab, RepairTab } from './TireBasicActionTabs';
import { ReplaceTab } from './TireReplaceTab';
import { useTirePositionActions, type TirePositionActionsParams } from './useTirePositionActions';

/** Acciones sobre una posición que ya tiene cubierta: calibrar, reparar, reemplazar o reportar extravío. */
export function TireActionsWithTire(props: TirePositionActionsParams) {
  const actions = useTirePositionActions(props);

  return (
    <Tabs defaultValue="calibrate">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="calibrate">Calibrar</TabsTrigger>
        <TabsTrigger value="repair">Reparar</TabsTrigger>
        <TabsTrigger value="replace">Reemplazar</TabsTrigger>
        <TabsTrigger value="missing" className="text-destructive data-[state=active]:text-destructive">
          Extravío
        </TabsTrigger>
      </TabsList>

      <CalibrateTab actions={actions} />
      <RepairTab actions={actions} vehicleId={props.vehicleId} />
      <ReplaceTab actions={actions} vehicleId={props.vehicleId} />
      <MissingTab actions={actions} />
    </Tabs>
  );
}
