'use client';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { RoleWithCount } from '../../actions.server';
import type { RoleNotificationsDraft } from '../../hooks/useRoleNotificationsDraft';
import { RoleNotificationsSection } from '../RoleNotificationsSection';

interface RoleNotificationsSheetProps {
  role: RoleWithCount | null;
  onOpenChange: (open: boolean) => void;
  draft: RoleNotificationsDraft;
  saveError: string | null;
  isSaving: boolean;
  onSave: () => void;
}

/**
 * Avisos de un rol de sistema (#786). Sus permisos no se editan, pero qué notificaciones recibe sí: es
 * el rol de la mayoría de los administradores.
 */
export function RoleNotificationsSheet({
  role,
  onOpenChange,
  draft,
  saveError,
  isSaving,
  onSave,
}: RoleNotificationsSheetProps) {
  const isBlocked = isSaving || !draft.isBaselineReady;
  const changed = draft.changes.add.length + draft.changes.remove.length;
  return (
    <Sheet open={role !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-5 py-4 pr-12">
          <SheetTitle className="text-lg">Notificaciones: {role?.name}</SheetTitle>
          <SheetDescription>
            Es un rol del sistema: sus permisos no se modifican, pero podés elegir qué avisos recibe.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <RoleNotificationsSection draft={draft} disabled={isSaving} saveError={saveError} />
        </div>
        <footer className="bg-background flex flex-col gap-3 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" aria-live="polite" className="text-muted-foreground text-sm tabular-nums">
            {changed === 0 ? 'Sin cambios' : changed === 1 ? '1 cambio sin guardar' : `${changed} cambios sin guardar`}
          </p>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 flex-1 sm:flex-none"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={isBlocked || changed === 0}
              aria-busy={isBlocked}
              className="h-10 flex-1 sm:flex-none"
            >
              {isSaving ? 'Guardando…' : 'Guardar avisos'}
            </Button>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
