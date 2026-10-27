'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { Check, Smartphone } from 'lucide-react';
import { useId } from 'react';
import type { OverrideState, PermissionAction, RoleSourceRef } from '../../lib/permission-types';
import { getActionColor, getActionIcon, getActionLabel } from './action-presentation';

interface ActionHeadingProps {
  action: PermissionAction;
  descriptionId: string;
  /** Texto extra bajo la descripción (ej. qué depende de "Ver") */
  hint?: string | null;
  /** La app móvil también aplica este permiso (`MOBILE_PERMISSION_KEYS`). */
  mobile?: boolean;
}

/** Insignia «Móvil»: el permiso también rige en la app móvil. Informativa, no es un interruptor. */
export function MobileBadge() {
  return (
    <span
      className="bg-info-subtle text-info-subtle-foreground inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] leading-none font-medium"
      title="También se aplica en la app móvil"
    >
      <Smartphone aria-hidden="true" className="size-3" />
      Móvil
    </span>
  );
}

function ActionHeading({ action, descriptionId, hint, mobile }: ActionHeadingProps) {
  const Icon = getActionIcon(action.slug);
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <Icon aria-hidden="true" className={cn('size-3.5 shrink-0', getActionColor(action.slug))} />
        <span className="truncate">{getActionLabel(action)}</span>
        {mobile ? <MobileBadge /> : null}
      </span>
      {action.description ? (
        <span id={descriptionId} className="text-muted-foreground line-clamp-2 text-xs text-pretty">
          {action.description}
        </span>
      ) : null}
      {hint ? <span className="text-warn-subtle-foreground text-xs">{hint}</span> : null}
    </span>
  );
}

interface RoleActionToggleProps {
  action: PermissionAction;
  tabName: string;
  pressed: boolean;
  disabled?: boolean;
  highlighted?: boolean;
  hint?: string | null;
  mobile?: boolean;
  onPressedChange: (pressed: boolean) => void;
}

/** Acción de una vista en el editor del rol: un botón que se prende o se apaga. */
export function RoleActionToggle({
  action,
  tabName,
  pressed,
  disabled,
  highlighted,
  hint,
  mobile,
  onPressedChange,
}: RoleActionToggleProps) {
  const descriptionId = useId();
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={`${getActionLabel(action)} en ${tabName}${mobile ? ' (también en la app móvil)' : ''}`}
      aria-describedby={action.description ? descriptionId : undefined}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        'focus-visible:ring-ring flex min-h-11 w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
        pressed ? 'border-brand/50 bg-brand-subtle' : 'bg-background hover:bg-muted/60',
        highlighted && 'ring-warn/60 ring-2'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[5px] border',
          pressed ? 'border-brand bg-brand text-brand-foreground' : 'border-input bg-background'
        )}
      >
        {pressed ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <ActionHeading action={action} descriptionId={descriptionId} hint={hint} mobile={mobile} />
    </button>
  );
}

const STATE_LABELS: Record<OverrideState, string> = {
  inherit: 'Heredar',
  grant: 'Conceder',
  deny: 'Quitar',
};

interface UserActionToggleProps {
  action: PermissionAction;
  tabName: string;
  state: OverrideState;
  effective: boolean;
  roles: RoleSourceRef[];
  disabled?: boolean;
  highlighted?: boolean;
  mobile?: boolean;
  onStateChange: (state: OverrideState) => void;
}

function describeSource(state: OverrideState, effective: boolean, roles: RoleSourceRef[]): string {
  const roleNames = roles.map((role) => role.name).join(', ');
  if (state === 'grant') return roles.length > 0 ? `Ajuste personal (también lo da ${roleNames})` : 'Ajuste personal';
  if (state === 'deny') return `Quitado por ajuste personal${roleNames ? ` (lo da ${roleNames})` : ''}`;
  if (effective) return `Por ${roles.length === 1 ? 'el rol' : 'los roles'} ${roleNames}`;
  return 'Ninguno de sus roles lo da';
}

/**
 * Acción de una vista en el editor del usuario: muestra si la tiene y de dónde sale, y un
 * control de tres estados para heredarla del rol, concederla o quitarla.
 */
export function UserActionToggle({
  action,
  tabName,
  state,
  effective,
  roles,
  disabled,
  highlighted,
  mobile,
  onStateChange,
}: UserActionToggleProps) {
  const descriptionId = useId();
  const sourceId = useId();
  const label = getActionLabel(action);

  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-lg border px-3 py-2.5',
        effective ? 'border-ok/40 bg-ok-subtle/50' : 'bg-background',
        highlighted && 'ring-warn/60 ring-2'
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn('mt-1.5 size-2 shrink-0 rounded-full', effective ? 'bg-ok' : 'bg-muted-foreground/40')}
        />
        <ActionHeading action={action} descriptionId={descriptionId} mobile={mobile} />
      </div>
      <p id={sourceId} className="text-muted-foreground text-xs">
        <span className={cn('font-medium', effective ? 'text-ok-subtle-foreground' : 'text-foreground')}>
          {effective ? 'Habilitado' : 'Sin acceso'}
        </span>
        {' · '}
        {describeSource(state, effective, roles)}
      </p>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={state}
        disabled={disabled}
        onValueChange={(value) => {
          if (value) onStateChange(value as OverrideState);
        }}
        aria-label={`${label} en ${tabName}${mobile ? ' (también en la app móvil)' : ''}`}
        aria-describedby={`${sourceId}${action.description ? ` ${descriptionId}` : ''}`}
        className="grid w-full grid-cols-3"
      >
        {(Object.keys(STATE_LABELS) as OverrideState[]).map((value) => (
          <ToggleGroupItem
            key={value}
            value={value}
            className={cn(
              'h-10 text-xs data-[state=on]:font-semibold',
              value === 'inherit' && 'data-[state=on]:bg-muted data-[state=on]:text-foreground',
              value === 'grant' && 'data-[state=on]:bg-ok-subtle data-[state=on]:text-ok-subtle-foreground',
              value === 'deny' && 'data-[state=on]:bg-danger-subtle data-[state=on]:text-danger-subtle-foreground'
            )}
          >
            {STATE_LABELS[value]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
