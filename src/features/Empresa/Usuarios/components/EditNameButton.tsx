'use client';

import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { EditUserNameDialog } from './EditUserNameDialog';

interface EditNameButtonProps {
  profileId: string;
  currentFullname: string | null;
  employeeFullname: string | null;
}

export function EditNameButton({ profileId, currentFullname, employeeFullname }: EditNameButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="h-9">
        <Pencil aria-hidden="true" />
        Editar nombre
      </Button>

      <EditUserNameDialog
        open={open}
        onOpenChange={setOpen}
        profileId={profileId}
        currentFullname={currentFullname}
        employeeFullname={employeeFullname}
      />
    </>
  );
}
