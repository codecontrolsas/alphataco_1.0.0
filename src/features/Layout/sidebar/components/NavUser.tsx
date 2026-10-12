'use client';

import { AlertDialogHeader } from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { logout as serverLogout } from '@/features/Auth/actions/login-actions';
import { Logger } from '@/lib/logger';
import { UploadImage } from '@/shared/components/common/UploadImage';
import cookie from 'js-cookie';
import { ChevronsUpDown, LogOut, Settings, UserCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { updateProfileAvatar } from '../actions/user-profile';
import type { UserMenuProps } from '../types/types';

const logger = new Logger('NavUser');

/**
 * Menu de usuario en el footer del sidebar — ocupa el lugar del `NavUser` del bloque sidebar-07.
 */
export function NavUser({ user }: UserMenuProps) {
  const { isMobile } = useSidebar();
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const form = useForm();
  const router = useRouter();

  // El cierre de sesión es una Server Action: la cookie de Better Auth y la de empresa activa
  // son httpOnly, así que las dos las borra el servidor. La navegación la hace el cliente.
  const logout = async () => {
    cookie.remove('actualCompName');
    await serverLogout();
    router.push('/login');
    router.refresh();
  };

  const handleAvatarUpdate = async (imageUrl: string) => {
    if (!user?.id) return;

    try {
      // El perfil a modificar sale de la sesión en el servidor: acá sólo viaja la imagen.
      await updateProfileAvatar(imageUrl);
      form.setValue('profile', imageUrl);
    } catch (error) {
      logger.error('Error al actualizar avatar', { data: { error } });
    }
  };

  const initials =
    user?.fullname
      ?.split(' ')
      .map((name) => name[0])
      .join('')
      .toUpperCase() || 'U';

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                data-testid="user-menu-trigger"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="size-8 rounded-lg">
                  <AvatarImage src={user?.avatar || ''} alt={user?.fullname ?? ''} />
                  <AvatarFallback className="bg-brand text-brand-foreground rounded-lg text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{user?.fullname}</span>
                  <span className="truncate text-xs">{user?.email}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? 'bottom' : 'right'}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarImage src={user?.avatar || ''} alt={user?.fullname ?? ''} />
                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user?.fullname}</span>
                    <span className="truncate text-xs">{user?.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => setShowProfileDialog(true)} className="cursor-pointer">
                  <Settings />
                  Mi perfil
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                data-testid="user-menu-logout"
                onSelect={async () => {
                  await logout();
                }}
              >
                <LogOut />
                Salir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <AlertDialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle2 className="h-5 w-5" />
              Mi perfil
            </DialogTitle>
            <DialogDescription>Elegí la foto que te identifica en alphataco.</DialogDescription>
          </AlertDialogHeader>

          <div className="py-6">
            <FormProvider {...form}>
              <FormField
                control={form.control}
                name="company_logo"
                render={({ field: _field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="space-y-8">
                        <div className="flex justify-center">
                          <Avatar className="size-24">
                            <AvatarImage src={user?.avatar || ''} />
                            <AvatarFallback className="bg-muted text-2xl">{initials}</AvatarFallback>
                          </Avatar>
                        </div>
                        <UploadImage
                          labelInput="Cambiar foto"
                          imageBucket="avatar"
                          desciption="JPG o PNG, cuadrada si puede ser."
                          onImageChange={handleAvatarUpdate}
                          inputStyle={{ width: '100%' }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormProvider>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProfileDialog(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
