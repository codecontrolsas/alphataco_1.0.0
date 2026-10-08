'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  cleanAllUserPermissionsAndRoles,
  cleanUserCustomPermissions,
  getModulesWithTabsServer,
  getUserRolesServer,
  removeUserPermissionServer,
  setUserPermissionServer,
  type ModulesWithTabsData,
  type UserPermissionsData,
  type UserRolesData,
} from '@/features/UserPermissionsManager/actions.server';
import { Logger } from '@/lib/logger';
import { getModuleIcon } from '@/shared/constants/module-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eraser, Eye, HelpCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { UserEquipmentTypesSection } from './UserEquipmentTypesSection';

const logger = new Logger('ModulePermissions');

type ModuleItem = ModulesWithTabsData[number];
type TabItem = ModuleItem['tabs'][number];

interface ModulePermissionsProps {
  userId: string;
  permissions: UserPermissionsData;
  disabled?: boolean;
  initialModules: ModulesWithTabsData;
  initialUserRoles: UserRolesData;
}

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  view: Eye,
  create: Plus,
  update: Pencil,
  delete: Trash2,
};

const ACTION_LABELS: Record<string, string> = {
  view: 'Ver',
  create: 'Crear',
  update: 'Editar',
  delete: 'Eliminar',
};

const ACTION_COLORS: Record<string, string> = {
  view: 'text-blue-600',
  create: 'text-green-600',
  update: 'text-yellow-600',
  delete: 'text-red-600',
};

export function ModulePermissions({
  userId,
  permissions,
  disabled = false,
  initialModules,
  initialUserRoles,
}: ModulePermissionsProps) {
  const queryClient = useQueryClient();
  const [isCleanDialogOpen, setIsCleanDialogOpen] = useState(false);

  const { data: modules = initialModules, isLoading } = useQuery({
    queryKey: ['modules-with-tabs'],
    queryFn: getModulesWithTabsServer,
    initialData: initialModules,
    staleTime: 5 * 60 * 1000,
  });

  const { data: userRoles = initialUserRoles } = useQuery({
    queryKey: ['user-roles', userId],
    queryFn: () => getUserRolesServer(userId),
    initialData: initialUserRoles,
    enabled: !!userId,
  });

  const permissionMap = useMemo(() => {
    const map = new Map<
      string,
      {
        source: string;
        isGranted: boolean;
        roleId?: number | null;
        roleName?: string | null;
        roleColor?: string | null;
      }
    >();
    if (Array.isArray(permissions)) {
      permissions.forEach((perm) => {
        const key = `${perm.tab_id}:${perm.action_id}`;
        map.set(key, {
          source: perm.source,
          isGranted: perm.is_granted === true,
          roleId: perm.role_id,
          roleName: perm.role_name,
          roleColor: perm.role_color,
        });
      });
    }
    return map;
  }, [permissions]);

  const setPermissionMutation = useMutation({
    mutationFn: ({ tabId, actionId, isGranted }: { tabId: string; actionId: string; isGranted: boolean }) =>
      setUserPermissionServer(userId, tabId, actionId, isGranted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions', userId] });
      queryClient.invalidateQueries({ queryKey: ['permissions'] });
    },
    onError: () => {
      toast.error('Error', { description: 'No se pudo actualizar el permiso', duration: Infinity });
    },
  });

  const removePermissionMutation = useMutation({
    mutationFn: ({ tabId, actionId }: { tabId: string; actionId: string }) =>
      removeUserPermissionServer(userId, tabId, actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions', userId] });
      queryClient.invalidateQueries({ queryKey: ['permissions'] });
    },
    onError: () => {
      toast.error('Error', { description: 'No se pudo remover el permiso', duration: Infinity });
    },
  });

  const cleanCustomPermissionsMutation = useMutation({
    mutationFn: () => cleanUserCustomPermissions(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions', userId] });
      queryClient.invalidateQueries({ queryKey: ['permissions'] });
      queryClient.invalidateQueries({ queryKey: ['user-roles', userId] });
      toast.success('Permisos limpiados', { description: 'Se eliminaron todos los permisos personalizados' });
      setIsCleanDialogOpen(false);
    },
    onError: () => {
      toast.error('Error', { description: 'No se pudieron limpiar los permisos', duration: Infinity });
    },
  });

  const cleanAllPermissionsMutation = useMutation({
    mutationFn: () => cleanAllUserPermissionsAndRoles(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions', userId] });
      queryClient.invalidateQueries({ queryKey: ['permissions'] });
      queryClient.invalidateQueries({ queryKey: ['user-roles', userId] });
      queryClient.invalidateQueries({ queryKey: ['role-user-counts'] });
      toast.success('Todos los permisos eliminados', { description: 'Se eliminaron todos los roles y permisos personalizados' });
      setIsCleanDialogOpen(false);
    },
    onError: () => {
      toast.error('Error', { description: 'No se pudieron eliminar todos los permisos', duration: Infinity });
    },
  });

  const isPermissionActive = (tabId: string, actionId: string) => {
    const permKey = `${tabId}:${actionId}`;
    const permission = permissionMap.get(permKey);
    return permission?.isGranted || false;
  };

  const countTabActions = (tab: TabItem): { total: number; selected: number } => {
    let total = tab.actions?.length || 0;
    let selected = tab.actions?.filter((action) => isPermissionActive(tab.id, action.id)).length || 0;

    if (tab.subtabs && tab.subtabs.length > 0) {
      (tab.subtabs as TabItem[]).forEach((subtab) => {
        const subtabCounts = countTabActions(subtab);
        total += subtabCounts.total;
        selected += subtabCounts.selected;
      });
    }

    return { total, selected };
  };

  const isTabFullySelected = (tab: TabItem): boolean => {
    const counts = countTabActions(tab);
    return counts.total > 0 && counts.selected === counts.total;
  };

  const isModuleFullySelected = (module: ModuleItem): boolean => {
    if (!module.tabs || module.tabs.length === 0) return false;
    return (module.tabs as TabItem[]).every((tab) => isTabFullySelected(tab));
  };

  const toggleModule = async (module: ModuleItem) => {
    if (disabled) return;

    const isFullySelected = isModuleFullySelected(module);
    const toAdd: Array<{ tabId: string; actionId: string }> = [];
    const toRemove: Array<{ tabId: string; actionId: string }> = [];

    const collectChanges = (tab: TabItem) => {
      tab.actions?.forEach((action) => {
        const isActive = isPermissionActive(tab.id, action.id);
        if (isFullySelected && isActive) {
          toRemove.push({ tabId: tab.id, actionId: action.id });
        } else if (!isFullySelected && !isActive) {
          toAdd.push({ tabId: tab.id, actionId: action.id });
        }
      });

      if (tab.subtabs && tab.subtabs.length > 0) {
        (tab.subtabs as TabItem[]).forEach((subtab) => collectChanges(subtab));
      }
    };

    (module.tabs as TabItem[])?.forEach((tab) => collectChanges(tab));

    try {
      if (toAdd.length > 0) {
        await Promise.all(
          toAdd.map((perm) =>
            setPermissionMutation.mutateAsync({
              tabId: perm.tabId,
              actionId: perm.actionId,
              isGranted: true,
            })
          )
        );
      }
      if (toRemove.length > 0) {
        await Promise.all(
          toRemove.map((perm) => removePermissionMutation.mutateAsync({ tabId: perm.tabId, actionId: perm.actionId }))
        );
      }
      queryClient.invalidateQueries({ queryKey: ['user-permissions', userId] });
    } catch (error) {
      logger.error('Error toggling module', { data: { error } });
    }
  };

  const toggleTab = (tab: TabItem) => {
    if (disabled) return;

    const isFullySelected = isTabFullySelected(tab);

    const toggleTabRecursive = (t: TabItem) => {
      t.actions?.forEach((action) => {
        const isActive = isPermissionActive(t.id, action.id);
        if (isFullySelected && isActive) {
          removePermissionMutation.mutate({ tabId: t.id, actionId: action.id });
        } else if (!isFullySelected && !isActive) {
          setPermissionMutation.mutate({ tabId: t.id, actionId: action.id, isGranted: true });
        }
      });

      if (t.subtabs && t.subtabs.length > 0) {
        (t.subtabs as TabItem[]).forEach((subtab) => toggleTabRecursive(subtab));
      }
    };

    toggleTabRecursive(tab);
  };

  const handlePermissionToggle = async (tabId: string, actionId: string, tab?: TabItem) => {
    if (disabled) return;

    const isActive = isPermissionActive(tabId, actionId);
    const permKey = `${tabId}:${actionId}`;
    const permission = permissionMap.get(permKey);

    const action = tab?.actions?.find((a) => a.id === actionId);
    const actionSlug = action?.slug;

    if (isActive && actionSlug === 'view') {
      const hasOtherPermissions = tab?.actions?.some((a) => {
        if (a.slug === 'view') return false;
        const otherKey = `${tabId}:${a.id}`;
        const otherPerm = permissionMap.get(otherKey);
        return otherPerm?.isGranted;
      });

      if (hasOtherPermissions) return;
    }

    if (tab && tab.subtabs && tab.subtabs.length > 0) {
      const toAdd: Array<{ tabId: string; actionId: string }> = [];
      const toRemove: Array<{ tabId: string; actionId: string }> = [];

      const collectAllTabs = (t: TabItem) => {
        if (isActive) {
          toRemove.push({ tabId: t.id, actionId });
        } else {
          toAdd.push({ tabId: t.id, actionId });
        }

        if (t.subtabs && t.subtabs.length > 0) {
          (t.subtabs as TabItem[]).forEach((subtab) => collectAllTabs(subtab));
        }
      };

      collectAllTabs(tab);

      if (!isActive && actionSlug && ['create', 'update', 'delete'].includes(actionSlug)) {
        const viewAction = tab?.actions?.find((a) => a.slug === 'view');
        if (viewAction) {
          const viewKey = `${tabId}:${viewAction.id}`;
          const viewPerm = permissionMap.get(viewKey);
          if (!viewPerm?.isGranted) {
            toAdd.push({ tabId, actionId: viewAction.id });
          }

          const addViewToSubtabs = (subtabs: TabItem[]) => {
            subtabs.forEach((subtab) => {
              const subtabViewAction = subtab.actions?.find((a) => a.slug === 'view');
              if (subtabViewAction) {
                const subtabViewKey = `${subtab.id}:${subtabViewAction.id}`;
                const subtabViewPerm = permissionMap.get(subtabViewKey);
                if (!subtabViewPerm?.isGranted) {
                  toAdd.push({ tabId: subtab.id, actionId: subtabViewAction.id });
                }
              }
              if (subtab.subtabs) {
                addViewToSubtabs(subtab.subtabs as TabItem[]);
              }
            });
          };
          if (tab.subtabs && tab.subtabs.length > 0) {
            addViewToSubtabs(tab.subtabs as TabItem[]);
          }
        }
      }

      try {
        if (toAdd.length > 0) {
          await Promise.all(
            toAdd.map((perm) =>
              setPermissionMutation.mutateAsync({
                tabId: perm.tabId,
                actionId: perm.actionId,
                isGranted: true,
              })
            )
          );
        }
        if (toRemove.length > 0) {
          await Promise.all(
            toRemove.map((perm) => removePermissionMutation.mutateAsync({ tabId: perm.tabId, actionId: perm.actionId }))
          );
        }
        queryClient.invalidateQueries({ queryKey: ['user-permissions', userId] });
      } catch (error) {
        logger.error('Error toggling permission with children', { data: { error } });
      }
    } else {
      if (!isActive && actionSlug && ['create', 'update', 'delete'].includes(actionSlug)) {
        const viewAction = tab?.actions?.find((a) => a.slug === 'view');
        if (viewAction) {
          const viewKey = `${tabId}:${viewAction.id}`;
          const viewPerm = permissionMap.get(viewKey);
          if (!viewPerm?.isGranted) {
            await setPermissionMutation.mutateAsync({ tabId, actionId: viewAction.id, isGranted: true });
          }
        }
      }

      if (isActive) {
        if (permission?.source === 'role') {
          setPermissionMutation.mutate({ tabId, actionId, isGranted: false });
        } else {
          removePermissionMutation.mutate({ tabId, actionId });
        }
      } else {
        setPermissionMutation.mutate({ tabId, actionId, isGranted: true });
      }
    }
  };

  const renderActions = (tab: TabItem) => {
    if (!tab.actions || tab.actions.length === 0) return null;

    return (
      <div className="flex items-center gap-3 flex-wrap">
        {tab.actions.map((action) => {
          const ActionIcon = ACTION_ICONS[action.slug as keyof typeof ACTION_ICONS];
          const isActive = isPermissionActive(tab.id, action.id);
          const permKey = `${tab.id}:${action.id}`;
          const permission = permissionMap.get(permKey);
          const source = permission?.source;
          const roleColor = permission?.roleColor;
          const roleName = permission?.roleName;
          const isFromRole = source === 'role';

          const isViewLocked =
            action.slug === 'view' &&
            isActive &&
            tab.actions?.some((a) => {
              if (a.slug === 'view') return false;
              const otherKey = `${tab.id}:${a.id}`;
              const otherPerm = permissionMap.get(otherKey);
              return otherPerm?.isGranted;
            });

          const isDisabled = disabled || isFromRole || isViewLocked;

          const checkboxElement = (
            <div
              key={action.id}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border transition-all ${
                isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              } ${
                isActive
                  ? 'border-primary/50 bg-primary/10 shadow-sm'
                  : 'border-border/50 hover:border-primary/30 hover:bg-muted/50'
              }`}
              onClick={() => !isDisabled && handlePermissionToggle(tab.id, action.id, tab)}
            >
              <Checkbox
                checked={isActive}
                disabled={isDisabled}
                onCheckedChange={() => !isDisabled && handlePermissionToggle(tab.id, action.id, tab)}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-4"
              />
              {ActionIcon && (
                <ActionIcon
                  className={`h-3.5 w-3.5 ${
                    ACTION_COLORS[action.slug as keyof typeof ACTION_COLORS] || 'text-muted-foreground'
                  }`}
                />
              )}
              <span className="text-xs font-medium">
                {ACTION_LABELS[action.slug as keyof typeof ACTION_LABELS] || action.name}
              </span>
              {source === 'role' && roleName && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1.5 font-medium"
                  style={{
                    backgroundColor: roleColor ? `${roleColor}20` : '#3b82f620',
                    borderColor: roleColor || '#3b82f6',
                    color: roleColor || '#3b82f6',
                  }}
                >
                  {roleName.charAt(0).toUpperCase()}
                </Badge>
              )}
            </div>
          );

          if (isDisabled) {
            return (
              <Tooltip key={action.id}>
                <TooltipTrigger asChild>{checkboxElement}</TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {isFromRole
                      ? `Este permiso viene del rol "${roleName}" y no puede ser removido aquí`
                      : 'No se puede desactivar "Ver" mientras otros permisos estén activos'}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          }

          return checkboxElement;
        })}
      </div>
    );
  };

  const renderSubtab = (tab: TabItem, level: number, moduleSlug?: string) => {
    const hasSubtabs = tab.subtabs && tab.subtabs.length > 0;
    const counts = countTabActions(tab);
    const tabSelected = isTabFullySelected(tab);
    const tabPartiallySelected = counts.selected > 0 && !tabSelected;

    return (
      <div key={tab.id} className="space-y-3 pl-4 border-l border-border/50">
        <div className="flex items-start gap-3 py-2">
          <Checkbox
            checked={tabSelected}
            ref={(el: HTMLButtonElement | null) => {
              if (el) (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = tabPartiallySelected;
            }}
            onCheckedChange={() => toggleTab(tab)}
            disabled={disabled}
            className="mt-0.5"
          />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-muted-foreground">{tab.name}</span>
              {counts.total > 0 && (
                <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                  {counts.selected}/{counts.total}
                </Badge>
              )}
            </div>
            {renderActions(tab)}
          </div>
        </div>

        {hasSubtabs && (
          <div className="space-y-2">
            {(tab.subtabs as TabItem[]).map((subtab) => renderSubtab(subtab, level + 1, moduleSlug))}
          </div>
        )}

        {moduleSlug === 'comercial' && tab.slug === 'customers' && (
          <>
            <Separator className="my-3" />
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
              <div className="flex items-start gap-2">
                <HelpCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">Tab Contratos</p>
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    Los permisos para la tab de Contratos se heredan del módulo <strong>Comercial</strong> → tab{' '}
                    <strong>Contratos/Servicios</strong>. Gestiona los permisos desde allí.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="text-sm text-muted-foreground">Cargando permisos...</div>
      </Card>
    );
  }

  const customPermissions = permissions.filter((p) => p.source === 'custom');
  const hasCustomPermissions = customPermissions.length > 0;
  const hasRoles = userRoles.length > 0;
  const hasAnyPermissions = hasCustomPermissions || hasRoles;

  return (
    <TooltipProvider>
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <Label className="text-base font-semibold">Permisos por Módulo</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Configura el acceso a módulos, tabs y acciones específicas
              </p>
            </div>

            {hasAnyPermissions && (
              <AlertDialog open={isCleanDialogOpen} onOpenChange={setIsCleanDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={disabled}>
                    <Eraser className="h-4 w-4 mr-2" />
                    Limpiar Permisos
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="max-w-lg">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Limpiar Permisos</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-3">
                      <p>Selecciona qué permisos deseas eliminar:</p>

                      {hasRoles && (
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md p-3">
                          <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-2">
                            ⚠️ Este usuario tiene {userRoles.length} rol(es) asignado(s):
                          </p>
                          <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
                            {userRoles.map((ur) => {
                              const role = ur.roles;
                              const roleName = role?.name;
                              return <li key={ur.id}>• {roleName}</li>;
                            })}
                          </ul>
                        </div>
                      )}

                      {hasCustomPermissions && (
                        <p className="text-sm">
                          Permisos personalizados: <strong>{customPermissions.length}</strong>
                        </p>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
                    {hasCustomPermissions && (
                      <Button
                        variant="outline"
                        onClick={() => cleanCustomPermissionsMutation.mutate()}
                        disabled={cleanCustomPermissionsMutation.isPending || cleanAllPermissionsMutation.isPending}
                        className="w-full"
                      >
                        {cleanCustomPermissionsMutation.isPending ? 'Limpiando...' : 'Solo Permisos Personalizados'}
                      </Button>
                    )}

                    <Button
                      variant="destructive"
                      onClick={() => cleanAllPermissionsMutation.mutate()}
                      disabled={
                        disabled || cleanCustomPermissionsMutation.isPending || cleanAllPermissionsMutation.isPending
                      }
                      className="w-full"
                    >
                      {cleanAllPermissionsMutation.isPending ? 'Eliminando...' : 'Eliminar Todo (Roles + Permisos)'}
                    </Button>

                    <AlertDialogCancel className="w-full mt-0">Cancelar</AlertDialogCancel>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <Accordion type="multiple" className="space-y-3">
            {modules.map((module) => {
              const moduleCounts = (module.tabs as TabItem[])?.reduce(
                (acc, tab) => {
                  const tabCounts = countTabActions(tab);
                  return {
                    total: acc.total + tabCounts.total,
                    selected: acc.selected + tabCounts.selected,
                  };
                },
                { total: 0, selected: 0 }
              ) || { total: 0, selected: 0 };

              const moduleSelected = isModuleFullySelected(module);
              const modulePartiallySelected = moduleCounts.selected > 0 && !moduleSelected;
              const ModuleIcon = getModuleIcon(module.slug);

              return (
                <AccordionItem
                  key={module.id}
                  value={module.id}
                  className="last:border-b-0 border border-border/50 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30">
                    <Checkbox
                      checked={moduleSelected}
                      ref={(el: HTMLButtonElement | null) => {
                        if (el)
                          (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate =
                            modulePartiallySelected;
                      }}
                      onCheckedChange={() => toggleModule(module)}
                      disabled={disabled}
                    />
                    <AccordionTrigger className="flex-1 hover:no-underline p-0">
                      <div className="flex items-center gap-4 flex-1">
                        <ModuleIcon className="h-5 w-5 text-primary" />
                        <span className="font-semibold text-base">{module.name}</span>
                        <Badge variant="secondary" className="ml-auto mr-2 text-xs">
                          {moduleCounts.selected} / {moduleCounts.total}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                  </div>
                  <AccordionContent className="px-5 pb-5 pt-2">
                    {module.tabs && module.tabs.length > 0 ? (
                      <Accordion type="multiple" className="space-y-3">
                        {(module.tabs as TabItem[]).map((tab) => {
                          const hasSubtabs = tab.subtabs && tab.subtabs.length > 0;
                          const counts = countTabActions(tab);
                          const tabSelected = isTabFullySelected(tab);
                          const tabPartiallySelected = counts.selected > 0 && !tabSelected;

                          return (
                            <AccordionItem
                              key={tab.id}
                              value={tab.id}
                              className="border-l-2 border-primary/20 pl-4 bg-muted/20 rounded-r-md"
                            >
                              <div className="flex items-center gap-3 py-2">
                                <Checkbox
                                  checked={tabSelected}
                                  ref={(el: HTMLButtonElement | null) => {
                                    if (el)
                                      (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate =
                                        tabPartiallySelected;
                                  }}
                                  onCheckedChange={() => toggleTab(tab)}
                                  disabled={disabled}
                                />
                                <AccordionTrigger className="flex-1 hover:no-underline py-0">
                                  <div className="flex items-center gap-2 flex-1">
                                    <span className="font-semibold text-sm">{tab.name}</span>
                                    {counts.total > 0 && (
                                      <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                                        {counts.selected}/{counts.total}
                                      </Badge>
                                    )}
                                  </div>
                                </AccordionTrigger>
                              </div>
                              <AccordionContent>
                                <div className="space-y-4 pt-3 pb-2">
                                  {renderActions(tab)}

                                  {hasSubtabs && (
                                    <>
                                      <Separator className="my-3" />
                                      <div className="space-y-2">
                                        {(tab.subtabs as TabItem[]).map((subtab) =>
                                          renderSubtab(subtab, 1, module.slug ?? undefined)
                                        )}
                                      </div>
                                    </>
                                  )}

                                  {module.slug === 'empleados' && tab.slug === 'detalle-empleado' && (
                                    <>
                                      <Separator className="my-3" />
                                      <div className="space-y-3">
                                        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                                          <div className="flex items-start gap-2">
                                            <HelpCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1">
                                              <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                                                Tab Documentación
                                              </p>
                                              <p className="text-xs text-blue-800 dark:text-blue-200">
                                                Los permisos para la tab de Documentación se heredan del módulo{' '}
                                                <strong>Documentación</strong> → tab{' '}
                                                <strong>Documentos de Empleados</strong>. Gestiona los permisos desde
                                                allí.
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                                          <div className="flex items-start gap-2">
                                            <HelpCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1">
                                              <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                                                Subtab Nuevo Diagrama
                                              </p>
                                              <p className="text-xs text-blue-800 dark:text-blue-200">
                                                Los permisos para la subtab <strong>Nuevo Diagrama</strong> se heredan
                                                del módulo <strong>Empleados</strong> → tab <strong>Diagramas</strong> →
                                                subtab <strong>Cargar Diagramas</strong>. Gestiona los permisos desde
                                                allí.
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </>
                                  )}

                                  {module.slug === 'equipos' && tab.slug === 'detalle-equipo' && (
                                    <>
                                      <Separator className="my-3" />
                                      <div className="space-y-3">
                                        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                                          <div className="flex items-start gap-2">
                                            <HelpCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1">
                                              <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                                                Tab Documentación
                                              </p>
                                              <p className="text-xs text-blue-800 dark:text-blue-200">
                                                Los permisos para la tab de Documentación se heredan del módulo{' '}
                                                <strong>Documentación</strong> → tab{' '}
                                                <strong>Documentos de Equipos</strong>. Gestiona los permisos desde
                                                allí.
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                                          <div className="flex items-start gap-2">
                                            <HelpCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1">
                                              <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                                                Tab Reparaciones
                                              </p>
                                              <p className="text-xs text-blue-800 dark:text-blue-200">
                                                Los permisos para la tab de Reparaciones se heredan del módulo{' '}
                                                <strong>Equipos</strong> → tab <strong>Mantenimiento</strong>. Gestiona
                                                los permisos desde allí.
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}

                        {module.slug === 'empleados' && (
                          <>
                            <Separator className="my-3" />
                            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                              <div className="flex items-start gap-2">
                                <HelpCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                                    Tab Tipos de Documentos
                                  </p>
                                  <p className="text-xs text-blue-800 dark:text-blue-200">
                                    Los permisos para la tab de Tipos de Documentos se heredan del módulo{' '}
                                    <strong>Documentación</strong> → tab <strong>Tipos de Documentos</strong>. Gestiona
                                    los permisos desde allí.
                                  </p>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        {module.slug === 'equipos' && (
                          <>
                            <Separator className="my-3" />
                            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                              <div className="flex items-start gap-2">
                                <HelpCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                                    Tab Tipos de Documentos
                                  </p>
                                  <p className="text-xs text-blue-800 dark:text-blue-200">
                                    Los permisos para la tab de Tipos de Documentos se heredan del módulo{' '}
                                    <strong>Documentación</strong> → tab <strong>Tipos de Documentos</strong>. Gestiona
                                    los permisos desde allí.
                                  </p>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </Accordion>
                    ) : (
                      <div className="text-sm text-muted-foreground pt-2">No hay tabs disponibles para este módulo</div>
                    )}

                    {module.slug === 'mantenimiento' && (
                      <>
                        <Separator className="my-4" />
                        <UserEquipmentTypesSection userId={userId} disabled={disabled} />
                      </>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </Card>
    </TooltipProvider>
  );
}
