import { checkPermissionServer } from '@/features/Permissions';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { CalendarDays } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import { DailyReportProgress } from './components/DailyReportProgress';
import { DailyReportStatusPills } from './components/DailyReportStatusPills';
import { NewLineButton } from './components/NewLineButton';
import { getCachedDailyReportHeader } from './lib/header-cache';
import { toReportDateString } from './lib/report-date';

interface Props {
  uuid: string;
}

export async function DailyReportHeader({ uuid }: Props) {
  const [header, canUpdate] = await Promise.all([
    getCachedDailyReportHeader(uuid),
    checkPermissionServer('operaciones', 'detalle-parte-diario', 'update'),
  ]);

  if (!header) return null;

  // `date` y `creation_date` son `@db.Date` (medianoche UTC): se leen en UTC para no correr el día.
  const title = `Parte del ${moment.utc(header.date).locale('es').format('dddd DD/MM/YYYY')}`;
  const createdOn = header.creation_date ? moment.utc(header.creation_date).format('DD/MM/YYYY') : null;

  return (
    <RecordHeader
      identity={
        <div className="flex items-center gap-4">
          <span
            className="bg-brand-subtle text-brand-subtle-foreground flex size-14 shrink-0 items-center justify-center rounded-xl"
            aria-hidden="true"
          >
            <CalendarDays className="size-7" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-foreground text-xl font-semibold tracking-tight">{title}</h1>
            {createdOn ? <p className="text-muted-foreground text-sm">Creado el {createdOn}</p> : null}
            <DailyReportStatusPills dailyReportId={uuid} reportStatus={header.status} />
          </div>
        </div>
      }
      actions={
        <>
          <DailyReportProgress dailyReportId={uuid} />
          <NewLineButton
            canUpdate={canUpdate}
            dailyReportStatus={header.status ?? 'abierto'}
            reportDate={toReportDateString(header.date)}
          />
        </>
      }
    />
  );
}
