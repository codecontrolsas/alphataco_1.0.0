'use client';
import { CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCitiesByProvince } from '@/shared/actions/countries.server';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

interface CatalogOption {
  id: number;
  name: string;
}

interface Props {
  provinces: CatalogOption[] | null;
  defaultProvince?: CatalogOption | null;
  defaultCity?: CatalogOption | null;
}

/**
 * Selectores provincia → ciudad del formulario de empresa (campos `province_id` y `city`).
 * Las ciudades se piden por server action al cambiar la provincia (React Query).
 */
export default function CityInput({ provinces, defaultProvince, defaultCity }: Props) {
  const [selectedProvince, setSelectedProvince] = useState<string | undefined>(
    defaultProvince?.id != null ? String(defaultProvince.id) : undefined
  );
  const [selectedCity, setSelectedCity] = useState<string | undefined>(
    defaultCity?.id != null ? String(defaultCity.id) : undefined
  );

  const provinceId = selectedProvince ? Number(selectedProvince) : null;
  const { data: cities = [], isLoading } = useQuery({
    queryKey: ['cities-by-province', provinceId],
    queryFn: () => getCitiesByProvince(provinceId as number),
    enabled: provinceId !== null && !Number.isNaN(provinceId),
    staleTime: 60 * 60 * 1000,
  });

  const handleProvinceChange = (value: string) => {
    setSelectedProvince(value);
    setSelectedCity(undefined);
  };

  return (
    <>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="province_id">Seleccione una provincia</Label>
        <Select value={selectedProvince} onValueChange={handleProvinceChange} name="province_id">
          <SelectTrigger id="province_id" name="province_id" className="w-full">
            <SelectValue placeholder="Seleccionar Provincia" />
          </SelectTrigger>
          <SelectContent>
            {provinces?.map((prov) => (
              <SelectItem key={prov.id} value={String(prov.id)}>
                {prov.name.trim()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <CardDescription id="province_id_error" />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="city">Seleccione una ciudad</Label>
        <Select value={selectedCity} onValueChange={setSelectedCity} name="city" disabled={!selectedProvince}>
          <SelectTrigger id="city" name="city" className="w-full">
            <SelectValue placeholder={isLoading ? 'Cargando ciudades...' : 'Seleccionar Ciudad'} />
          </SelectTrigger>
          <SelectContent>
            {cities.map((city) => (
              <SelectItem key={city.id} value={String(city.id)}>
                {city.name.trim()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CardDescription id="city_error" />
      </div>
    </>
  );
}
