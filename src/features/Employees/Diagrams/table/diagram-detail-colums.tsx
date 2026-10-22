'use client';

import { Badge } from '@/components/ui/badge';
import { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import { DataTableColumnHeader } from './data-table-column-header';

type Colum = {
  id: string;
  created_at: string;
  employee_id: string;
  diagram_type_id: string;
  name: string;
  color: string;
  company_id: string;
  diagram_type_created_at: string;
  short_description: string;
  day: number;
  month: number;
  year: number;
  comments?: string | null;
};

export const DetailDiagramColums: ColumnDef<Colum>[] = [
  {
    accessorKey: 'created_at',
    id: 'Fecha',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
    cell: ({ row }) => {
      return moment(row.original.created_at).format('DD/MM/YYYY');
    },
    enableHiding: false,
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'short_description',
    id: 'Descripción',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Descripcion" />,
    cell: ({ row }) => (
      <Badge variant={'outline'} style={{ color: row.original.color, border: `1px solid ${row.original.color}` }}>
        {row.getValue('Descripción')}
      </Badge>
    ),
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'name',
    id: 'Estado',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
    cell: ({ row }) => {
      return <div className="flex gap-2 items-center">{row.original.name}</div>;
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'comments',
    id: 'Comentario',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Comentario" />,
    cell: ({ row }) => {
      const comment = row.original.comments;
      if (!comment) return <span className="text-muted-foreground">-</span>;
      // Los comentarios son texto libre: se trunca y el texto completo queda en el title.
      return (
        <span className="block max-w-[240px] truncate" title={comment}>
          {comment}
        </span>
      );
    },
  },
];
