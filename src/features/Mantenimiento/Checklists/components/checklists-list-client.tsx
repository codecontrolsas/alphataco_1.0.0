'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/features/Mantenimiento/shared/components/empty-state';
import { MaintenanceHeader } from '@/features/Mantenimiento/shared/components/maintenance-header';
import { Calendar, ChevronRight, ClipboardList } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';

type Checklist = {
  id: string;
  name: string;
  form: {
    description?: string;
    frequency?: string;
    title?: string;
    vehicle_type?: string[];
  } | null;
  created_at: string;
};

interface ChecklistsListClientProps {
  equipmentId: string;
  checklists: Checklist[];
  employeeName?: string | null;
  employeeCuil?: string | null;
}

export default function ChecklistsListClient({
  equipmentId,
  checklists,
  employeeName,
  employeeCuil,
}: ChecklistsListClientProps) {
  const router = useRouter();

  const formatDate = (dateStr: string) => {
    return moment(dateStr).format('DD/MM/YYYY');
  };

  const handleSelectChecklist = (checklistId: string) => {
    router.push(`/maintenance/equipment/${equipmentId}/checklists/${checklistId}`);
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <MaintenanceHeader
        title="Checklists"
        showBack
        backHref={`/maintenance/equipment/${equipmentId}`}
        employeeName={employeeName}
        employeeCuil={employeeCuil}
      />

      <main className="flex-1 p-4 pb-24">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">Tipos de checklist</h2>
          <p className="text-sm text-muted-foreground">Seleccione el checklist de mantenimiento a completar</p>
        </div>

        {checklists.length > 0 ? (
          <div className="space-y-3">
            {checklists.map((checklist) => (
              <Card key={checklist.id} className="transition-colors hover:bg-accent/50 active:scale-[0.99]">
                {/* El botón ocupa toda la tarjeta: objetivo táctil grande y alcanzable con teclado */}
                <button
                  type="button"
                  onClick={() => handleSelectChecklist(checklist.id)}
                  className="block w-full rounded-xl text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <CardContent className="p-4">
                    <div className="flex min-h-12 items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <ClipboardList aria-hidden="true" className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-foreground text-base text-pretty">
                            {(checklist.form && typeof checklist.form === 'object' && 'description' in checklist.form
                              ? checklist.form.description
                              : null) || checklist.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {checklist.form &&
                              typeof checklist.form === 'object' &&
                              'frequency' in checklist.form &&
                              checklist.form.frequency && (
                                <Badge variant="secondary" className="text-xs">
                                  {checklist.form.frequency}
                                </Badge>
                              )}
                            <span className="text-sm text-muted-foreground flex items-center gap-1 tabular-nums">
                              <Calendar aria-hidden="true" className="h-3 w-3" />
                              {formatDate(checklist.created_at)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{checklist.name}</p>
                        </div>
                      </div>
                      <ChevronRight aria-hidden="true" className="h-5 w-5 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </button>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No hay checklists disponibles"
            description="No hay checklists configurados para este tipo de equipo"
          />
        )}
      </main>
    </div>
  );
}
