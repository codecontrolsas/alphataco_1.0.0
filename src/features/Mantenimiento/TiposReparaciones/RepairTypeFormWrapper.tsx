import { Card } from '@/components/ui/card';
import { RepairTypeForm } from './RepairTypeForm';
import { fetchAllTypesOfRepairs } from './actions/actions';
import type { RepairTypeRow } from './repair-type-columns';

async function RepairTypeFormWrapper() {
  const types_of_repairs = await fetchAllTypesOfRepairs();

  return (
    <Card className="p-6">
      <RepairTypeForm types_of_repairs={types_of_repairs as RepairTypeRow[]} />
    </Card>
  );
}

export default RepairTypeFormWrapper;
