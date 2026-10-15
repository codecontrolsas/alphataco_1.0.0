'use client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRef, useState, type ChangeEvent } from 'react';

interface CompanyLogoInputProps {
  onFileChange: (file: File | null) => void;
}

const ACCEPT = '.jpg, .jpeg, .png, .gif, .bmp, .tif, .tiff, .webp';

/** Selector de logo con vista previa (alta y edición de empresa). El archivo viaja en el FormData como `logo`. */
export function CompanyLogoInput({ onFileChange }: CompanyLogoInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>('');

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    onFileChange(file);
    if (!file) {
      setPreview('');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') setPreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <div className="flex max-w-sm flex-col gap-2">
        <Label htmlFor="logo">
          Subir Logo <span className="opacity-70">(10MB máximo)</span>
        </Label>
        <Input
          readOnly
          type="text"
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer"
          placeholder="Seleccionar foto o subir foto"
        />
        <Input
          ref={fileInputRef}
          type="file"
          name="logo"
          id="logo"
          accept={ACCEPT}
          onChange={handleImageChange}
          className="hidden"
        />
      </div>
      <div className="flex items-center gap-2 rounded-xl">
        {preview && (
          <img
            src={preview}
            className="rounded-xl my-1 max-w-[150px] max-h-[120px] bg-muted p-2"
            alt="Vista previa del logo"
          />
        )}
      </div>
    </div>
  );
}
