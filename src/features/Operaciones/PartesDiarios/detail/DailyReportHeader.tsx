import { Badge } from '@/components/ui/badge';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { dailyReportStatusBadges, dailyReportStatusLabels } from '@/shared/utils/mappers';
import { ClipboardList } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import { DAILY_REPORT_STATUS_ICONS } from '../lib/daily-report-status-ui';
import { DailyReportColorLegend } from './components/DailyReportColorLegend';
import { DailyReportSummaryStrip } from './components/DailyReportSummaryStrip';
import { DetailBackButton } from './components/DetailBackButton';
import { getDailyReportHeader, getDailyReportRowStatusSummary } from './queries.server';

interface Props {
  uuid: string;
}

/** Cabecera del detalle del parte: volver, identidad (fecha y estado), datos clave y leyenda de colores. */
export async function DailyReportHeader({ uuid }: Props) {
  const [header, summary] = await Promise.all([getDailyReportHeader(uuid), getDailyReportRowStatusSummary(uuid)]);

  if (!header) return null;

  // `date` es `@db.Date` (medianoche UTC): se lee en UTC para no correr el día.
  const date = moment.utc(header.date);
  const StatusIcon = header.status ? DAILY_REPORT_STATUS_ICONS[header.status] : undefined;

  return (
    <div className="space-y-6">
      <DetailBackButton />

      <RecordHeader
        identity={
          <div className="flex items-center gap-4">
            <div className="bg-muted text-muted-foreground flex size-14 shrink-0 items-center justify-center rounded-xl">
              <ClipboardList className="size-7" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Parte del <span className="font-mono tabular-nums">{date.format('DD/MM/YYYY')}</span>
              </h1>
              <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                <span className="capitalize">{date.locale('es').format('dddd')}</span>
                {header.status && (
                  <Badge variant={dailyReportStatusBadges[header.status] ?? 'default'}>
                    {StatusIcon && <StatusIcon aria-hidden="true" />}
                    {dailyReportStatusLabels[header.status] ?? header.status}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        }
      />

      <DailyReportSummaryStrip dailyReportId={uuid} initialData={summary} />

      <DailyReportColorLegend />
    </div>
  );
}
