/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Las guías del manual se leen del disco en runtime (`src/features/Ayuda/Manual/lib`): sin esto,
  // el trazado de `standalone` no las copia y en producción el manual queda vacío.
  outputFileTracingIncludes: {
    '/dashboard/help': ['./src/content/manual/**/*'],
    // Página propia del manual (ticket 809).
    '/manual': ['./src/content/manual/**/*']
  },
  cacheComponents: true,
  // El chequeo de tipos NO se repite en `next build`: ya lo corre `npm run check-types` (job `types-and-lint` del CI y
  // `verify` del deploy, que es requisito para desplegar). Repetirlo en el build hacia que, segun el orden de
  // inferencia, `next build` superara el limite de instanciacion de tipos (TS2589) en sitios donde `tsc` no, y le suma
  // ~2 minutos a cada imagen.
  typescript: {
    ignoreBuildErrors: true
  },
  transpilePackages: ['@react-pdf/renderer'],
  experimental: {
    staleTimes: {
      dynamic: 60
    },
    serverActions: {
      // Subimos el limite del body para soportar adjuntos de hasta 10MB
      // (el default de Next.js es 1MB y rompe upload de imagenes grandes).
      bodySizeLimit: '10mb'
    }
  },
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === 'development'
    }
  },
  images: {
    remotePatterns: [
      {
        // Cualquier proyecto Supabase: dev y prod tienen refs distintos y al
        // sumar un entorno nuevo las imagenes fallaban en silencio (se resolvia
        // con `unoptimized`, que descarga el original completo).
        protocol: 'https',
        hostname: '*.supabase.co'
      },
      {
        protocol: 'https',
        hostname: 'zktcbhhlcksopklpnubj.supabase.co'
      },
      {
        protocol: 'https',
        hostname: 'vvrckjjyrwqzpbaatemz.supabase.co'
      },
      {
        protocol: 'https',
        hostname: 'th.bing.com'
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1'
      }
    ]
  },
  async redirects() {
    // El modulo "Empresa" paso a llamarse "Configuracion" y se mudo de /dashboard/company a
    // /dashboard/configuration. Estos redirects son para los links que la gente ya tiene
    // guardados: favoritos, mails de alertas viejos, y la pestana que alguien dejo abierta.
    // Permanentes (308) para que el navegador deje de pedir la vieja.
    return [
      {
        // "Pre Legajos" salio de Empleados a su propio modulo, Seleccion.
        source: '/dashboard/employee/pre-legajo',
        destination: '/dashboard/recruitment/detail',
        permanent: true
      },
      {
        source: '/dashboard/company/actualCompany/:path*',
        destination: '/dashboard/configuration/:path*',
        permanent: true
      },
      {
        source: '/dashboard/company/new',
        destination: '/dashboard/configuration/companies/new',
        permanent: true
      },
      {
        // El listado y la edicion por id. Va despues de /new para no comerselo.
        source: '/dashboard/company/:path*',
        destination: '/dashboard/configuration/companies/:path*',
        permanent: true
      }
    ]
  },
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*'
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*'
      }
    ]
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true
}

module.exports = nextConfig
