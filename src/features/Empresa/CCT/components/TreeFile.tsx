'use client';
import AddCategoryModal from '@/features/Empresa/CCT/components/AddCategoryModal';
import AddCovenantModal from '@/features/Empresa/CCT/components/AddCovenantModal';
import AddGuildModal from '@/features/Empresa/CCT/components/AddGuildModal';
import { PermissionGuard } from '@/features/Permissions';
import { ChevronDown, ChevronRight, FileText, FolderClosed, FolderOpen } from 'lucide-react';
import React, { useState } from 'react';
import type { TreeNodeData } from '../lib/covenant-tree';

export type { TreeNodeData };

interface TreeNodeProps {
  node: TreeNodeData;
  level: number;
}

export const TreeNode: React.FC<TreeNodeProps> = ({ node, level }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOpen = () => setIsOpen(!isOpen);

  const renderIcon = () => {
    if (node.children) {
      return isOpen ? <FolderOpen className="h-4 w-4 text-warn" /> : <FolderClosed className="h-4 w-4 text-warn" />;
    }
    return <FileText className="h-4 w-4 text-info" />;
  };

  return (
    <div>
      <div
        className={`flex items-center p-1 hover:bg-accent rounded cursor-pointer ${level === 0 ? 'font-semibold' : ''}`}
        style={{ paddingLeft: `${level * 20}px` }}
      >
        <div className="flex justify-between w-full">
          <div className="flex items-center gap-2 flex-grow" onClick={toggleOpen}>
            {node.children && (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
            {renderIcon()}
            <span>{node.name}</span>
          </div>

          <div>
            {node.type === 'sindicatoPadre' && (
              <PermissionGuard module="configuracion" tab="convenios" action="create">
                <AddGuildModal />
              </PermissionGuard>
            )}
            {node.type === 'sindicato' && (
              <PermissionGuard module="configuracion" tab="convenios" action="create">
                <AddCovenantModal guildInfo={{ name: node.name, id: node.id }} />
              </PermissionGuard>
            )}
            {node.type === 'convenio' && (
              <PermissionGuard module="configuracion" tab="convenios" action="create">
                <AddCategoryModal covenantInfo={{ name: node.name, id: node.id }} />
              </PermissionGuard>
            )}
          </div>
        </div>
      </div>
      {isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};
