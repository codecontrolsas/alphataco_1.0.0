'use client';

import { Button } from '@/components/ui/button';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import Cookies from 'js-cookie';
import { Filter } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface CookieFilterProps {
  cookieName: string;
  options: { label: string; value: string }[];
  placeholder: string;
  initialValues: string[];
}

export function CookieFilter({ cookieName, options, placeholder, initialValues }: CookieFilterProps) {
  const router = useRouter();
  const [selectedValues, setSelectedValues] = useState<string[]>(initialValues);

  const handleApply = () => {
    if (selectedValues.length > 0) {
      Cookies.set(cookieName, selectedValues.join(','), { expires: 1 });
    } else {
      Cookies.remove(cookieName);
    }
    router.refresh();
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
      <div className="w-full min-w-0 sm:w-[280px]">
        <MultiSelectCombobox
          options={options}
          placeholder={placeholder}
          emptyMessage="Sin resultados"
          selectedValues={selectedValues}
          onChange={setSelectedValues}
          showSelectAll
        />
      </div>
      <Button type="button" size="sm" variant="outline" onClick={handleApply}>
        <Filter className="mr-1.5 h-3.5 w-3.5" />
        Filtrar
      </Button>
    </div>
  );
}
