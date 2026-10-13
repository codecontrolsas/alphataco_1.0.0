import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { PostHogProvider } from '@/shared/providers/PostHogProvider';
import { ThemeProvider } from '@/shared/providers/theme-provider';
import type { Metadata } from 'next';
import { Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google';

import './globals.css';

// Sans para la interfaz y mono para identificadores (legajo, CUIL, fechas). Las variables las
// consume `@theme` en globals.css (`--font-sans` / `--font-mono`).
const sansFont = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', display: 'swap' });
const monoFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={`${sansFont.variable} ${monoFont.variable} bg-background font-sans text-foreground antialiased`}>
        <PostHogProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
            <Toaster />
            <Sonner richColors={true} />
            <main>{children}</main>
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
