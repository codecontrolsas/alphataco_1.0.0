
import { Table } from '@tanstack/react-table';

interface ColumnVisibilityToggleProps<TData> {
  table: Table<TData>;
  storageKey: string;
  role?: string | null;
}
