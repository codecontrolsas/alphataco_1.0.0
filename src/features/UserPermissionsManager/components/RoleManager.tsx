'use client';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createRoleWithPermissions,
  deleteRoleServer,
  getAllRolesWithCounts,
  getRolePermissionsServer,
  updateRoleWithPermissions,
} from '@/features/UserPermissionsManager/actions.server';
import { Logger } from '@/lib/logger';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ModulesWithTabsData, RoleWithCount } from '../actions.server';
import {
  equipmentTypeVisibilityKeys,
  useRoleEquipmentTypesDraft,
  type RoleEquipmentTypeChanges,
} from '../hooks/useEquipmentTypeVisibility';
import { ManageRoleUsersDialog } from './ManageRoleUsersDialog';
import { DeleteRoleDialog } from './role-manager/DeleteRoleDialog';
import { RoleEditorSheet } from './role-manager/RoleEditorSheet';
import { RoleGroups } from './role-manager/RoleGroups';
import { describeEquipmentTypesOutcome, saveRoleEquipmentTypeChanges } from './role-manager/equipment-types-save';

const logger = new Logger('RoleManager');

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleManagerProps {
  initialRoles: RoleWithCount[];
  initialRolePermissions: Record<number, Array<{ tabId: string; actionId: string }>>;
  initialModules: ModulesWithTabsData;
}

// ─── RoleManager ──────────────────────────────────────────────────────────────

export function RoleManager({ initialRoles, initialRolePermissions, initialModules }: RoleManagerProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleWithCount | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<{ id: number; name: string } | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [roleColor, setRoleColor] = useState('#3b82f6');
  const [rolePermissions, setRolePermissions] = useState<Array<{ tabId: string; actionId: string }>>([]);
  // Permisos del rol tal como están en la BD al abrir el editor: base para calcular altas y bajas
  const [permissionsBaseline, setPermissionsBaseline] = useState<Array<{ tabId: string; actionId: string }> | null>(
    null
  );
  // Evita abrir dos veces el editor mientras se lee el baseline
  const [isOpeningEditor, setIsOpeningEditor] = useState(false);
  const [templateRoleIds, setTemplateRoleIds] = useState<number[]>([]);
  // Bloquea el boton de importar mientras se cargan los permisos de los roles plantilla
  const [isImporting, setIsImporting] = useState(false);
  const [manageUsersRole, setManageUsersRole] = useState<RoleWithCount | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [equipmentTypesSaveError, setEquipmentTypesSaveError] = useState<string | null>(null);

  // Tipos de equipamiento visibles del rol: baseline de la BD al abrir + borrador local
  const equipmentTypesDraft = useRoleEquipmentTypesDraft({
    roleId: editingRole?.id ?? null,
    enabled: isDialogOpen,
  });

  const invalidateEquipmentTypeVisibility = (roleId: number) => {
    queryClient.invalidateQueries({ queryKey: equipmentTypeVisibilityKeys.role(roleId) });
    // Lo que ve cada usuario se resuelve con sus roles
    queryClient.invalidateQueries({ queryKey: equipmentTypeVisibilityKeys.allUsers });
  };

  // Roles con SSR initial data
  const { data: roles = initialRoles } = useQuery({
    queryKey: ['roles'],
    queryFn: getAllRolesWithCounts,
    initialData: initialRoles,
    staleTime: 30 * 1000,
  });

  // Counts de permisos por rol (derivado de la query inicial o local)
  const [localRolePermissions, setLocalRolePermissions] =
    useState<Record<number, Array<{ tabId: string; actionId: string }>>>(initialRolePermissions);

  const getPermissionsCountForRole = (roleId: number): number => {
    return (localRolePermissions[roleId] ?? []).length;
  };

  // Mutación: crear rol (y después, con el id, sus tipos de equipamiento ocultos)
  const createRoleMutation = useMutation({
    mutationFn: async ({
      role,
      equipmentTypeChanges,
    }: {
      role: Parameters<typeof createRoleWithPermissions>[0];
      equipmentTypeChanges: RoleEquipmentTypeChanges;
    }) => {
      const newRole = await createRoleWithPermissions(role);
      const equipmentTypes = await saveRoleEquipmentTypeChanges(newRole.id, equipmentTypeChanges);
      return { newRole, equipmentTypes };
    },
    onSuccess: ({ newRole, equipmentTypes }) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      // Actualizar cache local de permisos
      setLocalRolePermissions((prev) => ({ ...prev, [newRole.id]: rolePermissions }));
      invalidateEquipmentTypeVisibility(newRole.id);

      if (equipmentTypes.status === 'failed') {
        // El rol ya existe: el diálogo pasa a edición para reintentar sin crear un duplicado
        setEditingRole({ ...newRole, userCount: 0, _count: { user_roles: 0 } });
        setEquipmentTypesSaveError(
          'El rol se creó, pero no se pudo guardar qué tipos de equipamiento ve. Vuelve a guardar para reintentar.'
        );
        toast.error('Tipos de equipamiento sin guardar', {
          description: `El rol "${newRole.name}" se creó, pero no se pudo guardar qué tipos de equipamiento ve.`,
        });
        return;
      }

      toast.success('Rol creado', {
        description: `El rol "${newRole.name}" ha sido creado exitosamente.${describeEquipmentTypesOutcome(equipmentTypes)}`,
      });
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      logger.error('Error al crear rol', { data: { error } });
      toast.error('Error', {
        description: error.message || 'No se pudo crear el rol',
      });
    },
  });

  // Mutación: actualizar rol (y después el delta de sus tipos de equipamiento ocultos)
  const updateRoleMutation = useMutation({
    mutationFn: async ({
      role,
      equipmentTypeChanges,
    }: {
      role: Parameters<typeof updateRoleWithPermissions>[0];
      equipmentTypeChanges: RoleEquipmentTypeChanges;
    }) => {
      const updatedRole = await updateRoleWithPermissions(role);
      const equipmentTypes = await saveRoleEquipmentTypeChanges(updatedRole.id, equipmentTypeChanges);
      return { updatedRole, equipmentTypes };
    },
    onSuccess: ({ updatedRole, equipmentTypes }) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      // Actualizar cache local de permisos
      setLocalRolePermissions((prev) => ({ ...prev, [updatedRole.id]: rolePermissions }));
      // El nuevo estado guardado es el baseline para un eventual reintento
      setPermissionsBaseline(rolePermissions);
      invalidateEquipmentTypeVisibility(updatedRole.id);
      const permissionsOutcome = `Permisos: ${updatedRole.added} agregados, ${updatedRole.removed} quitados.`;

      if (equipmentTypes.status === 'failed') {
        // Los permisos se guardaron; el borrador de tipos queda para reintentar
        setEquipmentTypesSaveError(
          'Los permisos del rol se guardaron, pero no se pudo guardar qué tipos de equipamiento ve. Vuelve a guardar para reintentar.'
        );
        toast.error('Tipos de equipamiento sin guardar', {
          description: `Los permisos de "${updatedRole.name}" se guardaron (${updatedRole.added} agregados, ${updatedRole.removed} quitados), pero no los tipos de equipamiento.`,
        });
        return;
      }

      toast.success('Rol actualizado', {
        description: `El rol "${updatedRole.name}" ha sido actualizado exitosamente. ${permissionsOutcome}${describeEquipmentTypesOutcome(equipmentTypes)}`,
      });
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      logger.error('Error al actualizar rol', { data: { error } });
      toast.error('Error', {
        description: error.message || 'No se pudo actualizar el rol',
      });
    },
  });

  // Mutación: eliminar rol
  const deleteRoleMutation = useMutation({
    mutationFn: deleteRoleServer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Rol eliminado', {
        description: 'El rol ha sido eliminado exitosamente',
      });
    },
    onError: (error: Error) => {
      logger.error('Error al eliminar rol', { data: { error } });
      toast.error('Error', {
        description: error.message || 'No se pudo eliminar el rol',
      });
    },
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleCreateRole = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDescription('');
    setRoleColor('#3b82f6');
    setRolePermissions([]);
    setPermissionsBaseline(null);
    setTemplateRoleIds([]);
    equipmentTypesDraft.reset();
    setEquipmentTypesSaveError(null);
    setIsDialogOpen(true);
  };

  const handleEditRole = async (role: RoleWithCount) => {
    if (isOpeningEditor) return;
    setIsOpeningEditor(true);

    try {
      // El baseline se lee SIEMPRE del servidor: el cache local puede estar viejo y de él
      // depende qué permisos se quitan al guardar. Si falla, el editor no se abre.
      const permissions = await getRolePermissionsServer(role.id);

      setEditingRole(role);
      setRoleName(role.name);
      setRoleDescription(role.description || '');
      setRoleColor(role.color || '#3b82f6');
      setTemplateRoleIds([]);
      equipmentTypesDraft.reset();
      setEquipmentTypesSaveError(null);
      setRolePermissions(permissions);
      setPermissionsBaseline(permissions);
      setLocalRolePermissions((prev) => ({ ...prev, [role.id]: permissions }));
      setIsDialogOpen(true);
    } catch (error) {
      logger.error('Error al cargar permisos del rol', { data: { error } });
      toast.error('No se pudieron cargar los permisos del rol', {
        description: 'Reintenta en unos segundos. El rol no se abrió para evitar perder permisos.',
      });
    } finally {
      setIsOpeningEditor(false);
    }
  };

  /** Delta de permisos contra el baseline leído al abrir: solo pares realmente agregados o quitados. */
  const computePermissionsDelta = (baseline: Array<{ tabId: string; actionId: string }>) => {
    const keyOf = (p: { tabId: string; actionId: string }) => `${p.tabId}:${p.actionId}`;
    const baselineKeys = new Set(baseline.map(keyOf));
    const currentKeys = new Set(rolePermissions.map(keyOf));
    const toPair = (p: { tabId: string; actionId: string }) => ({ tab_id: p.tabId, action_id: p.actionId });
    return {
      add: rolePermissions.filter((p) => !baselineKeys.has(keyOf(p))).map(toPair),
      remove: baseline.filter((p) => !currentKeys.has(keyOf(p))).map(toPair),
    };
  };

  const handleSaveRole = () => {
    if (!roleName.trim()) {
      toast.error('Error', { description: 'El nombre del rol es requerido' });
      return;
    }

    // Sin baseline no se puede calcular qué cambió en los tipos de equipamiento
    if (equipmentTypesDraft.hasChanges && !equipmentTypesDraft.isBaselineReady) return;

    setEquipmentTypesSaveError(null);
    const equipmentTypeChanges = equipmentTypesDraft.changes;

    if (editingRole) {
      // Sin baseline no se puede calcular qué cambió: no se guarda
      if (!permissionsBaseline) return;
      updateRoleMutation.mutate({
        role: {
          id: editingRole.id,
          name: roleName,
          description: roleDescription,
          color: roleColor,
          permissions: computePermissionsDelta(permissionsBaseline),
        },
        equipmentTypeChanges,
      });
    } else {
      createRoleMutation.mutate({
        role: {
          name: roleName,
          description: roleDescription,
          color: roleColor,
          permissions: rolePermissions,
        },
        equipmentTypeChanges,
      });
    }
  };

  const isSavingRole = createRoleMutation.isPending || updateRoleMutation.isPending;
  const isWaitingEquipmentTypesBaseline = equipmentTypesDraft.hasChanges && !equipmentTypesDraft.isBaselineReady;
  const isWaitingPermissionsBaseline = editingRole !== null && permissionsBaseline === null;

  const handleImportPermissions = async () => {
    if (templateRoleIds.length === 0) {
      toast.error('Error', { description: 'Selecciona al menos un rol para importar permisos' });
      return;
    }
    if (isImporting) return;

    setIsImporting(true);
    try {
      // Cargar permisos de los roles seleccionados (desde cache local o server)
      const allPermissions = await Promise.all(
        templateRoleIds.map(async (roleId) => {
          if (localRolePermissions[roleId] !== undefined) {
            return localRolePermissions[roleId];
          }
          const perms = await getRolePermissionsServer(roleId);
          setLocalRolePermissions((prev) => ({ ...prev, [roleId]: perms }));
          return perms;
        })
      );

      // Combinar eliminando duplicados
      const uniquePermissions = new Map<string, { tabId: string; actionId: string }>();
      allPermissions.flat().forEach((perm) => {
        uniquePermissions.set(`${perm.tabId}:${perm.actionId}`, perm);
      });

      // Combinar con permisos ya seleccionados
      const existingPermissions = new Map(rolePermissions.map((p) => [`${p.tabId}:${p.actionId}`, p]));
      uniquePermissions.forEach((perm, key) => existingPermissions.set(key, perm));

      setRolePermissions(Array.from(existingPermissions.values()));

      toast.success('Permisos importados', {
        description: `Se importaron ${uniquePermissions.size} permisos únicos de ${templateRoleIds.length} rol(es)`,
      });
    } catch (error) {
      logger.error('Error al importar permisos', { data: { error } });
      toast.error('Error', { description: 'No se pudieron importar los permisos' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleManageUsers = (role: RoleWithCount) => {
    setManageUsersRole(role);
  };

  const handleDeleteRole = (roleId: number, roleName: string) => {
    setRoleToDelete({ id: roleId, name: roleName });
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteRole = () => {
    if (roleToDelete) {
      deleteRoleMutation.mutate(roleToDelete.id);
      setDeleteConfirmOpen(false);
      setRoleToDelete(null);
    }
  };

  // ─── Derived state ─────────────────────────────────────────────────────────

  const { systemRoles, customRoles } = useMemo(() => {
    const filtered = roles.filter(
      (role) =>
        role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        role.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return {
      systemRoles: filtered.filter((r) => r.is_system),
      customRoles: filtered.filter((r) => !r.is_system),
    };
  }, [roles, searchQuery]);

  const filteredCount = systemRoles.length + customRoles.length;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-6">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Label className="text-base font-semibold">Roles Disponibles</Label>
              <p className="mt-1 text-sm text-muted-foreground">Crea y gestiona roles con permisos predefinidos</p>
            </div>
            <RoleEditorSheet
              open={isDialogOpen}
              onOpenChange={setIsDialogOpen}
              onCreate={handleCreateRole}
              editingRole={editingRole}
              roles={roles}
              initialModules={initialModules}
              name={roleName}
              onNameChange={setRoleName}
              description={roleDescription}
              onDescriptionChange={setRoleDescription}
              color={roleColor}
              onColorChange={setRoleColor}
              permissions={rolePermissions}
              permissionsBaseline={permissionsBaseline}
              onPermissionsChange={setRolePermissions}
              templateRoleIds={templateRoleIds}
              onTemplateRoleIdsChange={setTemplateRoleIds}
              rolePermissionsCache={localRolePermissions}
              isImporting={isImporting}
              onImportPermissions={handleImportPermissions}
              equipmentTypesDraft={equipmentTypesDraft}
              equipmentTypesSaveError={equipmentTypesSaveError}
              isSaving={isSavingRole}
              isWaitingEquipmentTypesBaseline={isWaitingEquipmentTypesBaseline}
              isWaitingPermissionsBaseline={isWaitingPermissionsBaseline}
              onSave={handleSaveRole}
            />
          </div>

          {/* Buscador de roles */}
          <div className="relative mb-4 md:w-1/3">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder="Buscar roles por nombre o descripción..."
              aria-label="Buscar roles por nombre o descripción"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <RoleGroups
          customRoles={customRoles}
          systemRoles={systemRoles}
          searchQuery={searchQuery}
          getPermissionsCount={getPermissionsCountForRole}
          onEdit={handleEditRole}
          onManageUsers={handleManageUsers}
          onDelete={handleDeleteRole}
          isDeleting={deleteRoleMutation.isPending}
        />
      </Card>

      <DeleteRoleDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        roleName={roleToDelete?.name}
        onCancel={() => setRoleToDelete(null)}
        onConfirm={confirmDeleteRole}
      />

      <ManageRoleUsersDialog
        role={manageUsersRole}
        open={!!manageUsersRole}
        onOpenChange={(open: boolean) => !open && setManageUsersRole(null)}
      />
    </div>
  );
}
