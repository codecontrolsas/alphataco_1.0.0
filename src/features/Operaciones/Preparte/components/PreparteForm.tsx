'use client';

import { usePreparteFormController } from '../hooks/usePreparteFormController';
import { type PreparteFormData, type PreparteItem } from '../schemas/preparte-form';
import { PreparteFormPageLayout } from './PreparteFormPageLayout';
import { PreparteFormSheetLayout } from './PreparteFormSheetLayout';
import type { Contrato } from './preparte-form/types';
import type { Cliente } from '../types/entities';

export type { PreparteFormData, PreparteItem };

interface PreparteFormProps {
  formData: PreparteItem;
  clientes: Cliente[];
  contratos: Contrato[];
  isEditing: boolean;
  onSubmit: (data: PreparteItem) => void | Promise<void>;
  onCancel: () => void;
  /**
   * `sheet` (por defecto): formulario compacto del Sheet de edición.
   * `page`: pantalla completa de alta, con secciones en tarjetas, resumen lateral y barra de guardado.
   */
  variant?: 'sheet' | 'page';
  /** Bloquea el guardado desde afuera (ej. mientras navega tras un alta exitosa). */
  submitDisabled?: boolean;
}

/** Formulario de pedido: elige el layout y delega el estado y el envío en `usePreparteFormController`. */
export function PreparteForm({
  formData,
  clientes,
  isEditing,
  onSubmit,
  onCancel,
  variant = 'sheet',
  submitDisabled = false,
}: PreparteFormProps) {
  const controller = usePreparteFormController({ formData, isEditing, onSubmit, onCancel });

  if (variant === 'page') {
    return (
      <PreparteFormPageLayout
        controller={controller}
        clientes={clientes}
        isEditing={isEditing}
        submitDisabled={submitDisabled}
        onCancel={onCancel}
      />
    );
  }

  return (
    <PreparteFormSheetLayout controller={controller} clientes={clientes} isEditing={isEditing} onCancel={onCancel} />
  );
}
