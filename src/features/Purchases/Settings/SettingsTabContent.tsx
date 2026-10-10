import Link from 'next/link';
import { Landmark } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupplierCategories } from '../actions/categories.server';
import { getExpenseCategories } from '../actions/expense-categories.server';
import { getWithholdingRegimes } from '../actions/withholding-regimes.server';
import { NoPermission } from '../fallback/NoPermission';
import { ExpenseCategoriesSection } from './components/ExpenseCategoriesSection';
import { SupplierCategoriesSection } from './components/SupplierCategoriesSection';
import { WithholdingRegimesSection } from './components/WithholdingRegimesSection';

/**
 * Configuracion de Compras: rubros, conceptos de gasto y regimenes de retencion. Las cuentas y
 * cajas desde las que se paga se administran en Tesoreria.
 */
export default async function SettingsTabContent({ permissions }: { permissions: Record<string, boolean> }) {
  if (permissions['compras:config-compras:view'] !== true) return <NoPermission />;
  const [categories, expenseCategories, regimes] = await Promise.all([
    getSupplierCategories(),
    getExpenseCategories(),
    getWithholdingRegimes(),
  ]);
  const canUpdate = permissions['compras:config-compras:update'] === true;
  return (
    <div className="max-w-2xl space-y-6">
      <SupplierCategoriesSection categories={categories} canUpdate={canUpdate} />
      <ExpenseCategoriesSection categories={expenseCategories} canUpdate={canUpdate} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4" /> Cuentas y cajas
          </CardTitle>
          <CardDescription>Las cuentas bancarias y cajas desde las que se paga se administran en Tesorería.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/treasury?tab=config-tesoreria" className="text-sm font-medium underline underline-offset-4">
            Ir a Configuración de Tesorería
          </Link>
        </CardContent>
      </Card>
      <WithholdingRegimesSection regimes={regimes} canUpdate={canUpdate} />
    </div>
  );
}
