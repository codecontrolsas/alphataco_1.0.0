import { Card, CardContent } from '@/components/ui/card';
import { arCurrentPeriod } from '@/features/Documentacion/shared/compliance/dates';
import { MonthlyCyclesClient } from './MonthlyCyclesClient';

export function MonthlyCyclesSection() {
  return (
    <Card>
      <CardContent>
        <MonthlyCyclesClient initialPeriod={arCurrentPeriod()} />
      </CardContent>
    </Card>
  );
}
