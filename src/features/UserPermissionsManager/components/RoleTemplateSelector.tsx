'use client';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Shield } from 'lucide-react';
import type { RoleWithCount } from '@/features/Permissions/actions/roles.server';

interface RoleTemplateSelectorProps {
  roles: RoleWithCount[];
  selectedRoleIds: number[];
  onSelectionChange: (roleIds: number[]) => void;
  /** Cache de permisos precargado desde SSR — evita queries individuales */
  rolePermissionsCache: Record<number, Array<{ tabId: string; actionId: string }>>;
}

function RoleTemplateItem({
  role,
  isSelected,
  onToggle,
  permissionsCount,
}: {
  role: RoleWithCount;
  isSelected: boolean;
  onToggle: () => void;
  permissionsCount: number;
}) {
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-md border transition-colors cursor-pointer ${
        isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30 hover:bg-muted/50'
      }`}
      onClick={onToggle}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="h-4 w-4"
      />
      <Shield className="h-4 w-4 flex-shrink-0" style={{ color: role.color || 'currentColor' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{role.name}</p>
      </div>
      <Badge variant="outline" className="text-[10px] flex-shrink-0 flex items-center gap-1">
        <Shield className="h-2.5 w-2.5" />
        {permissionsCount}
      </Badge>
      {role.is_system && (
        <Badge variant="outline" className="text-[10px] flex-shrink-0">
          Sistema
        </Badge>
      )}
    </div>
  );
}

export function RoleTemplateSelector({
  roles,
  selectedRoleIds,
  onSelectionChange,
  rolePermissionsCache,
}: RoleTemplateSelectorProps) {
  const handleToggle = (roleId: number) => {
    if (selectedRoleIds.includes(roleId)) {
      onSelectionChange(selectedRoleIds.filter((id) => id !== roleId));
    } else {
      onSelectionChange([...selectedRoleIds, roleId]);
    }
  };

  if (roles.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4 border rounded-md">
        No hay roles disponibles para usar como plantilla
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto border rounded-md p-3 bg-muted/20">
      {roles.map((role) => (
        <RoleTemplateItem
          key={role.id}
          role={role}
          isSelected={selectedRoleIds.includes(role.id)}
          onToggle={() => handleToggle(role.id)}
          permissionsCount={(rolePermissionsCache[role.id] ?? []).length}
        />
      ))}
    </div>
  );
}
