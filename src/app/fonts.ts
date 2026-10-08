import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

// Instancias a nivel de módulo: las comparten el root layout y global-error (que reemplaza al layout).
export const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const fontVariables = `${plexSans.variable} ${plexMono.variable}`;
