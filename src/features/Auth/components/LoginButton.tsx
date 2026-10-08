'use client';
import { Button } from '@/components/ui/button';
import { login } from '@/features/Auth/actions/login-actions';
import { Logger } from '@/lib/logger';
import { loginSchema } from '@/shared/schemas/schemas';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';

const logger = new Logger('LoginButton');

export const LoginButton = () => {
  const { pending } = useFormStatus();
  const router = useRouter();

  const clientAccion = async (formData: FormData) => {
    const values = Object.fromEntries(formData.entries());
    const result = await loginSchema.safeParseAsync(values);

    Object.keys(values).forEach((key) => {
      const element = document.getElementById(`${key}_error`);
      if (element) {
        element.innerText = '';
      }
    });

    if (!result.success) {
      result.error.issues.forEach((issue) => {
        const element = document.getElementById(`${issue.path}_error`);
        if (element) {
          element.innerText = issue.message;
        }
      });

      Object.keys(values).forEach((key) => {
        if (!result.error.issues.some((issue) => issue.path.includes(key))) {
          const element = document.getElementById(`${key}_error`);
          if (element) {
            element.innerText = '';
          }
        }
      });
      return;
    }
    toast.promise(
      async () => {
        const data = await login(formData);
        if ('error' in data) {
          logger.error('Login error', { data: { error: data.error } });
          throw new Error(data.error);
        }
        return 'success';
      },
      {
        loading: 'Iniciando Sesion...',
        success: () => {
          router.push('/dashboard');
          return '¡Bienvenido!';
        },
        error: (error) => {
          logger.error('Login failed', { data: { error } });
          if (error?.message?.includes('banned')) {
            return 'Tu acceso ha sido revocado. Contacta al administrador de tu empresa.';
          }
          return error?.message || 'Error desconocido';
        },
      }
    );
  };
  return (
    <Button
      size="lg"
      className="w-full"
      formAction={(formData) => clientAccion(formData)}
      disabled={pending}
      data-testid="login-submit-button"
    >
      {pending ? 'Cargando...' : 'Iniciar Sesion'}
    </Button>
  );
};
