'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Download, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { getModulesWithTabsServer, type ModulesWithTabsData, type RoleWithCount } from '../../actions.server';
import type { useRoleEquipmentTypesDraft } from '../../hooks/useEquipmentTypeVisibility';
import type { RoleNotificationsDraft } from '../../hooks/useRoleNotificationsDraft';
import { buildPermissionIndex, diffPermissionSets, permissionKey } from '../../lib/permission-rules';
import type { PermissionPair } from '../../lib/permission-types';
import { RoleEquipmentTypesSection } from '../RoleEquipmentTypesSection';
import { RoleNotificationsSection } from '../RoleNotificationsSection';
import { RoleTemplateSelector } from '../RoleTemplateSelector';
import { PermissionEditor } from '../permission-editor/PermissionEditor';

interface RoleEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: () => void;
  editingRole: RoleWithCount | null;
  roles: RoleWithCount[];
  initialModules: ModulesWithTabsData;
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  color: string;
  onColorChange: (value: string) => void;
  permissions: PermissionPair[];
  /** Permisos del rol leídos de la base al abrir (null mientras no llegan o si es un rol nuevo) */
  permissionsBaseline: PermissionPair[] | null;
  onPermissionsChange: (permissions: PermissionPair[]) => void;
  templateRoleIds: number[];
  onTemplateRoleIdsChange: (ids: number[]) => void;
  rolePermissionsCache: Record<number, PermissionPair[]>;
  isImporting: boolean;
  onImportPermissions: () => void;
  equipmentTypesDraft: ReturnType<typeof useRoleEquipmentTypesDraft>;
  equipmentTypesSaveError: string | null;
  notificationsDraft: RoleNotificationsDraft;
  notificationsSaveError: string | null;
  isSaving: boolean;
  isWaitingEquipmentTypesBaseline: boolean;
  isWaitingPermissionsBaseline: boolean;
  onSave: () => void;
}

const toKeySet = (pairs: PermissionPair[]) => new Set(pairs.map((p) => permissionKey(p.tabId, p.actionId)));

/** Panel lateral de alta/edición de rol: datos, copiar de otros roles, permisos, tipos de equipamiento y avisos. */
export function RoleEditorSheet({
  open,
  onOpenChange,
  onCreate,
  editingRole,
  roles,
  initialModules,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  color,
  onColorChange,
  permissions,
  permissionsBaseline,
  onPermissionsChange,
  templateRoleIds,
  onTemplateRoleIdsChange,
  rolePermissionsCache,
  isImporting,
  onImportPermissions,
  equipmentTypesDraft,
  equipmentTypesSaveError,
  notificationsDraft,
  notificationsSaveError,
  isSaving,
  isWaitingEquipmentTypesBaseline,
  isWaitingPermissionsBaseline,
  onSave,
}: RoleEditorSheetProps) {
  const { data: modules } = useQuery({
    queryKey: ['modules-with-tabs'],
    queryFn: () => getModulesWithTabsServer(),
    initialData: initialModules,
    staleTime: 5 * 60 * 1000,
  });
  const index = useMemo(() => buildPermissionIndex(modules), [modules]);

  const delta = useMemo(() => {
    if (!editingRole || !permissionsBaseline) return null;
    const { added, removed } = diffPermissionSets(toKeySet(permissionsBaseline), toKeySet(permissions));
    return { added: added.length, removed: removed.length };
  }, [editingRole, permissionsBaseline, permissions]);

  const isBlocked = isSaving || isWaitingEquipmentTypesBaseline || isWaitingPermissionsBaseline;

  return (
    <>
      <PermissionGuard module="configuracion" tab="gestion-roles" action="create">
        <Button type="button" onClick={onCreate}>
          <Plus aria-hidden="true" />
          Nuevo rol
        </Button>
      </PermissionGuard>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-5xl">
          <SheetHeader className="border-b px-5 py-4 pr-12">
            <SheetTitle className="text-lg">{editingRole ? `Editar rol: ${editingRole.name}` : 'Nuevo rol'}</SheetTitle>
            <SheetDescription>
              {editingRole
                ? `${editingRole.userCount} ${editingRole.userCount === 1 ? 'usuario tiene' : 'usuarios tienen'} este rol en la empresa.`
                : 'Lo que se marque acá lo van a poder hacer todos los usuarios con este rol.'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <section aria-labelledby="role-data-title" className="@container space-y-4">
              <h3 id="role-data-title" className="text-sm font-semibold">
                Datos del rol
              </h3>
              <div className="grid gap-4 @2xl:grid-cols-[minmax(0,1fr)_14rem]">
                <div className="space-y-2">
                  <Label htmlFor="role-name">Nombre *</Label>
                  <Input
                    id="role-name"
                    placeholder="Ej.: Supervisor de taller"
                    value={name}
                    onChange={(event) => onNameChange(event.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role-color">Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="role-color"
                      type="color"
                      value={color}
                      onChange={(event) => onColorChange(event.target.value)}
                      className="h-10 w-14 shrink-0 cursor-pointer p-1"
                    />
                    <Input
                      type="text"
                      value={color}
                      onChange={(event) => onColorChange(event.target.value)}
                      placeholder="#3b82f6"
                      aria-label="Color del rol en formato hexadecimal"
                      className="h-10 min-w-0 flex-1 font-mono"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-description">Descripción</Label>
                <Textarea
                  id="role-description"
                  placeholder="Ej.: Carga y aprueba órdenes del taller"
                  value={description}
                  onChange={(event) => onDescriptionChange(event.target.value)}
                  rows={2}
                />
              </div>
            </section>

            <details className="group rounded-xl border">
              <summary className="focus-visible:ring-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 text-sm font-medium outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
                Copiar permisos de otros roles
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="space-y-3 border-t px-4 py-4">
                <p className="text-muted-foreground text-sm">
                  Se suman a los que ya tiene marcados; no se quita ninguno.
                </p>
                <RoleTemplateSelector
                  roles={roles.filter((role) => !editingRole || role.id !== editingRole.id)}
                  selectedRoleIds={templateRoleIds}
                  onSelectionChange={onTemplateRoleIdsChange}
                  rolePermissionsCache={rolePermissionsCache}
                />
                {templateRoleIds.length > 0 ? (
                  <Button type="button" variant="outline" onClick={onImportPermissions} disabled={isImporting}>
                    <Download aria-hidden="true" />
                    {isImporting
                      ? 'Copiando…'
                      : `Copiar permisos de ${templateRoleIds.length} ${templateRoleIds.length === 1 ? 'rol' : 'roles'}`}
                  </Button>
                ) : null}
              </div>
            </details>

            <section aria-labelledby="role-permissions-title" className="space-y-3">
              <h3 id="role-permissions-title" className="text-sm font-semibold">
                Permisos
              </h3>
              {isWaitingPermissionsBaseline ? (
                <p role="status" className="text-muted-foreground text-sm">
                  Cargando los permisos guardados del rol…
                </p>
              ) : (
                <PermissionEditor
                  mode="role"
                  modules={modules}
                  index={index}
                  permissions={permissions}
                  onPermissionsChange={onPermissionsChange}
                  disabled={isSaving}
                  busy={isSaving}
                  moduleAddons={{
                    mantenimiento: (
                      <RoleEquipmentTypesSection
                        draft={equipmentTypesDraft}
                        disabled={isSaving}
                        saveError={equipmentTypesSaveError}
                      />
                    ),
                  }}
                />
              )}
            </section>

            <RoleNotificationsSection
              draft={notificationsDraft}
              disabled={isSaving}
              saveError={notificationsSaveError}
              permissionCheck={{ modules, permissions }}
            />
          </div>

          <footer className="bg-background flex flex-col gap-3 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p role="status" aria-live="polite" className="text-sm tabular-nums">
              {delta ? (
                delta.added === 0 && delta.removed === 0 ? (
                  <span className="text-muted-foreground">Sin cambios en los permisos</span>
                ) : (
                  <>
                    {delta.added > 0 ? (
                      <span className="text-ok-subtle-foreground font-medium">
                        {delta.added === 1 ? 'Se agrega 1' : `Se agregan ${delta.added}`}
                      </span>
                    ) : null}
                    {delta.added > 0 && delta.removed > 0 ? ' · ' : null}
                    {delta.removed > 0 ? (
                      <span className="text-danger font-medium">
                        {delta.removed === 1 ? 'Se quita 1' : `Se quitan ${delta.removed}`}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground"> · {permissions.length} en total</span>
                  </>
                )
              ) : editingRole ? (
                ''
              ) : (
                <span className="text-muted-foreground">
                  {permissions.length} {permissions.length === 1 ? 'permiso marcado' : 'permisos marcados'}
                </span>
              )}
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
                disabled={isBlocked}
                aria-busy={isBlocked}
                className="h-10 flex-1 sm:flex-none"
              >
                {isSaving
                  ? 'Guardando…'
                  : isWaitingPermissionsBaseline
                    ? 'Cargando permisos…'
                    : isWaitingEquipmentTypesBaseline
                      ? 'Cargando tipos…'
                      : editingRole
                        ? 'Guardar rol'
                        : 'Crear rol'}
              </Button>
            </div>
          </footer>
        </SheetContent>
      </Sheet>
    </>
  );
}
