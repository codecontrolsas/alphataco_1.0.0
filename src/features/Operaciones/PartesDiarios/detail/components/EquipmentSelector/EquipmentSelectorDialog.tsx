'use client';

// ============================================================================
// CONSTANTS
// ============================================================================

const TABLE_ID = 'equipment-selector';

// ============================================================================
// TYPES
// ============================================================================

export interface EquipmentSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** IDs already assigned — these rows will have the checkbox checked + disabled */
  alreadySelectedIds: string[];
  /** If set, equipment not contracted for this customer gets a "No asignado" badge */
  selectedCustomerId: string | null;
  /** Called with the NEW selections (excluding already-selected ones) */
  onSelect: (selectedIds: string[]) => void;
}
