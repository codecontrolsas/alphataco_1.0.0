import { Toaster } from '@/components/ui/sonner';
import { PostHogProvider } from '@/shared/providers/PostHogProvider';
import { ThemeProvider } from '@/shared/providers/theme-provider';
import type { Metadata, Viewport } from 'next';
import { fontVariables } from './fonts';

import './globals.css';

export const metadata: Metadata = {
  title: 'alphataco',
  description: 'Gestión para las empresas',
  // `?v=`: los navegadores cachean el favicon por URL; subirlo al cambiar el icono.
  icons: {
    icon: '/brand-icon.svg?v=2',
    shortcut: '/brand-icon.svg?v=2',
    apple: '/brand-icon.svg?v=2',
  },
};

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7f9' }, // --canvas claro
    { media: '(prefers-color-scheme: dark)', color: '#0c0f11' }, // --canvas oscuro
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={fontVariables} suppressHydrationWarning>
      <body>
        <PostHogProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
            {children}
            <Toaster />
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
